"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { useEffect } from "react";
import { fetchSessionUser } from "@/lib/auth";
import { API_BASE } from "@/lib/config";
import { decryptClientSide, encryptClientSide, getClientStorageKey } from "@/lib/crypto";

function CredentialSync() {
  useEffect(() => {
    let active = true;

    async function sync() {
      const session = await fetchSessionUser();
      if (!session || !active) return;

      const storageKey = `logforge:credentials:${session.id}`;
      const localCredsRaw = localStorage.getItem(storageKey);
      if (!localCredsRaw) return;

      let localCreds: Array<{
        provider: string;
        label: string;
        token?: string;
        ciphertext?: string;
        iv?: string;
      }> = [];

      try {
        localCreds = JSON.parse(localCredsRaw);
      } catch {
        return;
      }

      if (!Array.isArray(localCreds) || localCreds.length === 0) return;

      // Retrieve the derived key for decryption/encryption
      const clientKey = await getClientStorageKey(API_BASE);
      if (!clientKey) {
        console.warn("[Auto-Sync] Could not retrieve client-side storage key; skipping sync.");
        return;
      }

      try {
        const providersRes = await fetch(`${API_BASE}/api/providers`, {
          credentials: "include",
        });
        if (!providersRes.ok) return;

        const backendProviders = (await providersRes.json()) as Array<{
          key: string;
          connected: boolean;
        }>;

        let needsResave = false;

        for (const cred of localCreds) {
          let plainToken = "";

          if (cred.token) {
            // Legacy unencrypted token
            plainToken = cred.token;
            // Upgrade legacy token to AES-GCM format
            try {
              const encrypted = await encryptClientSide(plainToken, clientKey);
              cred.ciphertext = encrypted.ciphertext;
              cred.iv = encrypted.iv;
              delete cred.token;
              needsResave = true;
            } catch (err) {
              console.error("[Auto-Sync] Failed to encrypt legacy token:", err);
            }
          } else if (cred.ciphertext && cred.iv) {
            // Decrypt the secure token
            try {
              plainToken = await decryptClientSide(cred.ciphertext, cred.iv, clientKey);
            } catch (err) {
              console.error(`[Auto-Sync] Failed to decrypt secure token for ${cred.provider}:`, err);
              continue;
            }
          }

          if (!plainToken) continue;

          const matched = backendProviders.find((p) => p.key === cred.provider);
          if (!matched || !matched.connected) {
            console.log(`[Auto-Sync] Restoring secure backend connection for ${cred.provider}...`);
            await fetch(`${API_BASE}/api/credentials`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                provider: cred.provider,
                label: cred.label,
                token: plainToken,
              }),
            });
          }
        }

        if (needsResave && active) {
          localStorage.setItem(storageKey, JSON.stringify(localCreds));
        }
      } catch (err) {
        console.error("[Auto-Sync] Error synchronizing credentials:", err);
      }
    }

    sync();

    return () => {
      active = false;
    };
  }, []);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <CredentialSync />
      {children}
    </QueryClientProvider>
  );
}
