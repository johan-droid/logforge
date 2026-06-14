import "../src/env.js";
import { eq } from "drizzle-orm";
import { decrypt, encrypt } from "../src/crypto/index.js";
import { db, initializeDatabase } from "../src/db/index.js";
import { credentials } from "../src/db/schema.js";

await initializeDatabase();

const rows = await db.select().from(credentials);

for (const row of rows) {
  if (row.keyVersion === 1) {
    continue;
  }

  const plaintext = decrypt(row.encToken, row.iv, row.authTag, row.keyVersion);
  const rotated = encrypt(plaintext);

  await db
    .update(credentials)
    .set({
      encToken: rotated.encToken,
      iv: rotated.iv,
      authTag: rotated.authTag,
      keyVersion: rotated.keyVersion,
    })
    .where(eq(credentials.id, row.id));
}

console.log("Credential key rotation complete");
