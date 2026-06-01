import "../env.js";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

const sqlite = new Database(process.env.DATABASE_URL || "logforge.db");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

export function initializeDatabase() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      label TEXT,
      enc_token TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      credential_id TEXT NOT NULL REFERENCES credentials(id) ON DELETE CASCADE,
      provider_svc_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT,
      repo_url TEXT,
      active INTEGER DEFAULT 1,
      last_seen INTEGER
    );

    CREATE TABLE IF NOT EXISTS branches (
      id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sha TEXT,
      status TEXT,
      deploy_url TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      timestamp INTEGER NOT NULL,
      level TEXT,
      message TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS log_cursors (
      service_id TEXT PRIMARY KEY REFERENCES services(id) ON DELETE CASCADE,
      cursor_value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rate_limit_state (
      provider TEXT PRIMARY KEY,
      calls_used INTEGER DEFAULT 0,
      window_start INTEGER NOT NULL,
      limit_per_hr INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_credentials_user_id ON credentials(user_id);
    CREATE INDEX IF NOT EXISTS idx_services_credential_id ON services(credential_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_services_credential_provider_svc
      ON services(credential_id, provider_svc_id);
    CREATE INDEX IF NOT EXISTS idx_branches_service_id ON branches(service_id);
    CREATE INDEX IF NOT EXISTS idx_logs_service_timestamp ON logs(service_id, timestamp);
  `);
}
