import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const credentials = pgTable("credentials", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  provider: text("provider").notNull(),
  label: text("label"),
  encToken: text("enc_token").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  keyVersion: integer("key_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const services = pgTable("services", {
  id: text("id").primaryKey(),
  credentialId: text("credential_id")
    .notNull()
    .references(() => credentials.id),
  providerSvcId: text("provider_svc_id").notNull(),
  providerProjectId: text("provider_project_id"),
  name: text("name").notNull(),
  type: text("type"),
  repoUrl: text("repo_url"),
  active: boolean("active").default(true),
  lastSeen: timestamp("last_seen", { withTimezone: true }),
});

export const branches = pgTable("branches", {
  id: text("id").primaryKey(),
  serviceId: text("service_id")
    .notNull()
    .references(() => services.id),
  name: text("name").notNull(),
  sha: text("sha"),
  status: text("status"),
  deployUrl: text("deploy_url"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const logs = pgTable("logs", {
  id: text("id").primaryKey(),
  serviceId: text("service_id").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  level: text("level"),
  message: text("message").notNull(),
});

export const logCursors = pgTable(
  "log_cursors",
  {
    serviceId: text("service_id").notNull(),
    logType: text("log_type").notNull().default("app"),
    cursorValue: text("cursor_value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.serviceId, table.logType] }),
  }),
);

export const rateLimitState = pgTable("rate_limit_state", {
  provider: text("provider").primaryKey(),
  callsUsed: integer("calls_used").default(0),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  limitPerHr: integer("limit_per_hr").notNull(),
});
