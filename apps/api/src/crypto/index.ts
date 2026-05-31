import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY is required and must be a 32-byte utf8 string or base64-encoded 32-byte key",
    );
  }

  const utf8Key = Buffer.from(raw, "utf8");
  if (utf8Key.length === 32) {
    return utf8Key;
  }

  const base64Key = Buffer.from(raw, "base64");
  if (base64Key.length === 32) {
    return base64Key;
  }

  throw new Error(
    "ENCRYPTION_KEY must resolve to exactly 32 bytes for AES-256-GCM",
  );
}

export function assertEncryptionConfig() {
  getEncryptionKey();
}

export function encrypt(text: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);

  let encrypted = cipher.update(text, "utf8", "base64");
  encrypted += cipher.final("base64");

  const authTag = cipher.getAuthTag();

  return {
    encToken: encrypted,
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decrypt(
  encToken: string,
  ivBase64: string,
  authTagBase64: string,
) {
  const iv = Buffer.from(ivBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encToken, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
