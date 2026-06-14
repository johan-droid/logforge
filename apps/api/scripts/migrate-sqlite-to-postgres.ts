import "../src/env.js";
import Database from "better-sqlite3";
import { db, initializeDatabase } from "../src/db/index.js";
import {
  branches,
  credentials,
  logs,
  logCursors,
  rateLimitState,
  services,
  users,
} from "../src/db/schema.js";

const sqlitePath = process.argv[2] || "logforge.db";
const sqlite = new Database(sqlitePath, { readonly: true });

await initializeDatabase();

type TableName =
  | "users"
  | "credentials"
  | "services"
  | "branches"
  | "logs"
  | "log_cursors"
  | "rate_limit_state";

function readAll<T>(table: TableName) {
  return sqlite.prepare(`SELECT * FROM ${table}`).all() as T[];
}

await db.insert(users).values(
  readAll<{
    id: string;
    email: string;
    password_hash: string;
    created_at: number;
  }>("users").map((row) => ({
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: new Date(row.created_at),
  })),
).onConflictDoNothing();

await db.insert(credentials).values(
  readAll<{
    id: string;
    user_id: string;
    provider: string;
    label: string | null;
    enc_token: string;
    iv: string;
    auth_tag: string;
    created_at: number;
    key_version?: number;
  }>("credentials").map((row) => ({
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    label: row.label,
    encToken: row.enc_token,
    iv: row.iv,
    authTag: row.auth_tag,
    keyVersion: row.key_version ?? 1,
    createdAt: new Date(row.created_at),
  })),
).onConflictDoNothing();

await db.insert(services).values(
  readAll<{
    id: string;
    credential_id: string;
    provider_svc_id: string;
    provider_project_id?: string | null;
    name: string;
    type: string | null;
    repo_url: string | null;
    active: number | null;
    last_seen: number | null;
  }>("services").map((row) => ({
    id: row.id,
    credentialId: row.credential_id,
    providerSvcId: row.provider_svc_id,
    providerProjectId: row.provider_project_id ?? null,
    name: row.name,
    type: row.type,
    repoUrl: row.repo_url,
    active: row.active == null ? true : Boolean(row.active),
    lastSeen: row.last_seen ? new Date(row.last_seen) : null,
  })),
).onConflictDoNothing();

await db.insert(branches).values(
  readAll<{
    id: string;
    service_id: string;
    name: string;
    sha: string | null;
    status: string | null;
    deploy_url: string | null;
    updated_at: number;
  }>("branches").map((row) => ({
    id: row.id,
    serviceId: row.service_id,
    name: row.name,
    sha: row.sha,
    status: row.status,
    deployUrl: row.deploy_url,
    updatedAt: new Date(row.updated_at),
  })),
).onConflictDoNothing();

await db.insert(logs).values(
  readAll<{
    id: string;
    service_id: string;
    timestamp: number;
    level: string | null;
    message: string;
  }>("logs").map((row) => ({
    id: row.id,
    serviceId: row.service_id,
    timestamp: new Date(row.timestamp),
    level: row.level,
    message: row.message,
  })),
).onConflictDoNothing();

await db.insert(logCursors).values(
  readAll<{
    service_id: string;
    cursor_value: string;
    updated_at: number;
    log_type?: string;
  }>("log_cursors").map((row) => ({
    serviceId: row.service_id,
    logType: row.log_type ?? "app",
    cursorValue: row.cursor_value,
    updatedAt: new Date(row.updated_at),
  })),
).onConflictDoNothing();

await db.insert(rateLimitState).values(
  readAll<{
    provider: string;
    calls_used: number | null;
    window_start: number;
    limit_per_hr: number;
  }>("rate_limit_state").map((row) => ({
    provider: row.provider,
    callsUsed: row.calls_used ?? 0,
    windowStart: new Date(row.window_start),
    limitPerHr: row.limit_per_hr,
  })),
).onConflictDoNothing();

sqlite.close();
console.log(`SQLite data migrated from ${sqlitePath}`);
