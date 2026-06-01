/**
 * Client-side AES-GCM encryption and decryption.
 * Uses the Web Crypto API built into modern browsers.
 */

function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binaryString = "";
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte !== undefined) {
      binaryString += String.fromCharCode(byte);
    }
  }
  return btoa(binaryString);
}

async function importKey(base64Key: string): Promise<CryptoKey> {
  const rawKey = base64ToBytes(base64Key);
  return window.crypto.subtle.importKey(
    "raw",
    rawKey as unknown as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptClientSide(
  text: string,
  base64Key: string,
): Promise<{ ciphertext: string; iv: string }> {
  const key = await importKey(base64Key);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encodedText = encoder.encode(text);

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv as unknown as ArrayBuffer,
    },
    key,
    encodedText as unknown as ArrayBuffer,
  );

  return {
    ciphertext: bytesToBase64(new Uint8Array(encryptedBuffer)),
    iv: bytesToBase64(iv),
  };
}

export async function decryptClientSide(
  ciphertext: string,
  ivBase64: string,
  base64Key: string,
): Promise<string> {
  const key = await importKey(base64Key);
  const iv = base64ToBytes(ivBase64);
  const encryptedBytes = base64ToBytes(ciphertext);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv as unknown as ArrayBuffer,
    },
    key,
    encryptedBytes as unknown as ArrayBuffer,
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

let memoryKey: string | null = null;

export async function getClientStorageKey(apiBase: string): Promise<string | null> {
  if (memoryKey) return memoryKey;

  try {
    const cached = sessionStorage.getItem("logforge:storage_key");
    if (cached) {
      memoryKey = cached;
      return cached;
    }
  } catch (err) {
    console.debug("sessionStorage not available", err);
  }

  try {
    const res = await fetch(`${apiBase}/api/auth/storage-key`, {
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { storageKey?: string };
    if (data.storageKey) {
      memoryKey = data.storageKey;
      try {
        sessionStorage.setItem("logforge:storage_key", data.storageKey);
      } catch (err) {
        console.debug("Failed to write to sessionStorage", err);
      }
      return data.storageKey;
    }
  } catch (err) {
    console.debug("Network or authentication error", err);
  }

  return null;
}
