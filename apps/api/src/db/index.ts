import "../env.js";
import { createRequire } from "node:module";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

const require = createRequire(import.meta.url);

function createPool() {
  if (process.env.NODE_ENV === "test" || process.env.DATABASE_URL === "pg-mem") {
    const { newDb } = require("pg-mem") as {
      newDb: () => {
        adapters: {
          createPg: () => {
            Pool: new () => Pool;
          };
        };
      };
    };
    const memoryDb = newDb();
    const adapter = memoryDb.adapters.createPg();
    const memoryPool = new adapter.Pool() as Pool & {
      query: (...args: unknown[]) => unknown;
    };
    const originalQuery = memoryPool.query.bind(memoryPool);
    memoryPool.query = ((queryConfig: unknown, ...rest: unknown[]) => {
      if (queryConfig && typeof queryConfig === "object") {
        const sanitized = { ...(queryConfig as Record<string, unknown>) };
        delete sanitized.types;
        delete sanitized.rowMode;
        return originalQuery(sanitized, ...rest);
      }
      return originalQuery(queryConfig as never, ...rest);
    }) as typeof memoryPool.query;
    return memoryPool;
  }

  const connectionString = process.env.DATABASE_URL;
  return new Pool({
    // DECISION(jules): keep module import side-effect free so startup can emit
    // a clear fatal log before the first database query if Render env vars are missing.
    connectionString:
      connectionString || "postgres://missing:missing@127.0.0.1:1/missing",
    max: 20,
  });
}

export const pool = createPool();
export const db = drizzle(pool, { schema });

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      label TEXT,
      enc_token TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      key_version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      credential_id TEXT NOT NULL REFERENCES credentials(id) ON DELETE CASCADE,
      provider_svc_id TEXT NOT NULL,
      provider_project_id TEXT,
      name TEXT NOT NULL,
      type TEXT,
      repo_url TEXT,
      active BOOLEAN DEFAULT TRUE,
      last_seen TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS branches (
      id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sha TEXT,
      status TEXT,
      deploy_url TEXT,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL,
      level TEXT,
      message TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS log_cursors (
      service_id TEXT NOT NULL,
      log_type TEXT NOT NULL DEFAULT 'app',
      cursor_value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (service_id, log_type)
    );

    CREATE TABLE IF NOT EXISTS rate_limit_state (
      provider TEXT PRIMARY KEY,
      calls_used INTEGER DEFAULT 0,
      window_start TIMESTAMPTZ NOT NULL,
      limit_per_hr INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_credentials_user_id ON credentials(user_id);
    CREATE INDEX IF NOT EXISTS idx_services_credential_id ON services(credential_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_services_credential_provider_svc
      ON services(credential_id, provider_svc_id);
    CREATE INDEX IF NOT EXISTS idx_branches_service_id ON branches(service_id);
    CREATE INDEX IF NOT EXISTS idx_logs_service_timestamp ON logs(service_id, timestamp);
  `);

  await pool.query(`
    ALTER TABLE credentials
      ADD COLUMN IF NOT EXISTS key_version INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE services
      ADD COLUMN IF NOT EXISTS provider_project_id TEXT;
    ALTER TABLE log_cursors
      ADD COLUMN IF NOT EXISTS log_type TEXT NOT NULL DEFAULT 'app';
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name = 'logs'
          AND constraint_name = 'logs_service_id_fkey'
      ) THEN
        ALTER TABLE logs DROP CONSTRAINT logs_service_id_fkey;
      END IF;
      IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name = 'log_cursors'
          AND constraint_name = 'log_cursors_service_id_fkey'
      ) THEN
        ALTER TABLE log_cursors DROP CONSTRAINT log_cursors_service_id_fkey;
      END IF;
    EXCEPTION
      WHEN undefined_object THEN NULL;
    END $$;
  `).catch(() => undefined);

  const primaryKeyResult = await pool.query<{
    constraint_name: string;
  }>(`
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_name = 'log_cursors'
      AND constraint_type = 'PRIMARY KEY'
  `);

  const hasCompositePrimaryKey = primaryKeyResult.rows.some(
    (row: { constraint_name: string }) => row.constraint_name === "log_cursors_pkey",
  );

  if (hasCompositePrimaryKey) {
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE table_name = 'log_cursors'
            AND constraint_name = 'log_cursors_pkey'
            AND constraint_type = 'PRIMARY KEY'
        ) THEN
          ALTER TABLE log_cursors DROP CONSTRAINT log_cursors_pkey;
        END IF;
      EXCEPTION
        WHEN undefined_object THEN NULL;
      END $$;
    `);

    await pool.query(`
      ALTER TABLE log_cursors
        ADD PRIMARY KEY (service_id, log_type);
    `).catch(() => undefined);
  }
}
