import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const credentials = sqliteTable("credentials", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  provider: text("provider").notNull(),
  label: text("label"),
  encToken: text("enc_token").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const services = sqliteTable("services", {
  id: text("id").primaryKey(),
  credentialId: text("credential_id")
    .notNull()
    .references(() => credentials.id),
  providerSvcId: text("provider_svc_id").notNull(),
  name: text("name").notNull(),
  type: text("type"),
  repoUrl: text("repo_url"),
  active: integer("active", { mode: "boolean" }).default(true),
  lastSeen: integer("last_seen", { mode: "timestamp" }),
});

export const branches = sqliteTable("branches", {
  id: text("id").primaryKey(),
  serviceId: text("service_id")
    .notNull()
    .references(() => services.id),
  name: text("name").notNull(),
  sha: text("sha"),
  status: text("status"),
  deployUrl: text("deploy_url"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const logs = sqliteTable("logs", {
  id: text("id").primaryKey(),
  serviceId: text("service_id")
    .notNull()
    .references(() => services.id),
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
  level: text("level"),
  message: text("message").notNull(),
});

export const logCursors = sqliteTable("log_cursors", {
  serviceId: text("service_id")
    .primaryKey()
    .references(() => services.id),
  cursorValue: text("cursor_value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const rateLimitState = sqliteTable("rate_limit_state", {
  provider: text("provider").primaryKey(),
  callsUsed: integer("calls_used").default(0),
  windowStart: integer("window_start", { mode: "timestamp" }).notNull(),
  limitPerHr: integer("limit_per_hr").notNull(),
});
