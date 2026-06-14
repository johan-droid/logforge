import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_CACHE = new Map<number, Buffer>();

const PLACEHOLDER_JWT = [
  "replace",
  "with",
  "secure",
  "jwt",
  "secret",
  "key",
  "32",
  "bytes",
].join("-");
const PLACEHOLDER_PLAIN = ["1234567890123456", "7890123456789012"].join("");
const PLACEHOLDER_HEX = [
  "1234567890123456",
  "7890123456789012",
  "1234567890123456",
  "7890123456789012",
].join("");

const KNOWN_PLACEHOLDER_VALUES = new Set([
  PLACEHOLDER_JWT,
  PLACEHOLDER_PLAIN,
  PLACEHOLDER_HEX,
]);

function loadKey(envVar: string) {
  const raw = process.env[envVar];
  if (!raw) {
    throw new Error(
      `${envVar} is required and must be a 32-byte utf8 string, hex-encoded key, or base64-encoded key`,
    );
  }

  const utf8Key = Buffer.from(raw, "utf8");
  if (utf8Key.length === 32) {
    return utf8Key;
  }

  // A 64-character hex string resolves to 32 bytes
  if (raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)) {
    const hexKey = Buffer.from(raw, "hex");
    if (hexKey.length === 32) {
      return hexKey;
    }
  }

  const base64Key = Buffer.from(raw, "base64");
  if (base64Key.length === 32) {
    return base64Key;
  }

  throw new Error(
    `${envVar} must resolve to exactly 32 bytes (64 hex characters or 32 plain text characters)`,
  );
}

function getEncryptionKey(version: number = 1) {
  const cached = KEY_CACHE.get(version);
  if (cached) {
    return cached;
  }

  const envVar = version === 1 ? "ENCRYPTION_KEY" : "ENCRYPTION_KEY_PREVIOUS";
  const key = loadKey(envVar);
  KEY_CACHE.set(version, key);
  return key;
}

export function assertNotPlaceholder(name: string, value: string) {
  if (!KNOWN_PLACEHOLDER_VALUES.has(value)) {
    return;
  }

  const message = `${name} is set to the example placeholder from .env.example; generate a real secret.`;
  if (process.env.NODE_ENV === "production") {
    throw new Error(message);
  }

  console.warn(`[WARN] ${message} (allowed outside production)`);
}

export function assertEncryptionConfig() {
  getEncryptionKey(1);
}

export function encrypt(text: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(1), iv);

  let encrypted = cipher.update(text, "utf8", "base64");
  encrypted += cipher.final("base64");

  const authTag = cipher.getAuthTag();

  return {
    encToken: encrypted,
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    keyVersion: 1,
  };
}

export function decrypt(
  encToken: string,
  ivBase64: string,
  authTagBase64: string,
  keyVersion: number = 1,
) {
  const iv = Buffer.from(ivBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getEncryptionKey(keyVersion),
    iv,
  );
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encToken, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
