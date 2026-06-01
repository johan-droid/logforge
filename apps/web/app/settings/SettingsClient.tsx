"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  ExternalLink,
  KeyRound,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fetchSessionUser } from "@/lib/auth";
import { API_BASE } from "@/lib/config";
import { encryptClientSide, getClientStorageKey } from "@/lib/crypto";

type ProviderCard = {
  key: string;
  label: string;
  connected: boolean;
  appsAvailable: boolean;
};

type ProviderAppsResponse = {
  provider: string;
  connected: boolean;
  apps: Array<{ id: string; name: string; provider: string }>;
};

type SettingsClientProps = {
  initialProvider: string;
};

const providerTone: Record<string, string> = {
  render: "border-cyan-300/25 bg-cyan-300/10",
  vercel: "border-zinc-100/25 bg-zinc-100/10",
  heroku: "border-indigo-300/25 bg-indigo-300/10",
  cloudflare: "border-amber-300/25 bg-amber-300/10",
};

export function SettingsClient({ initialProvider }: SettingsClientProps) {
  const router = useRouter();
  const selectedProvider = initialProvider || "render";
  const [providers, setProviders] = useState<ProviderCard[]>([]);
  const [apps, setApps] = useState<ProviderAppsResponse | null>(null);
  const [token, setToken] = useState("");
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const session = await fetchSessionUser();
      if (!session) {
        router.replace("/");
        return;
      }

      const providersRes = await fetch(`${API_BASE}/api/providers`, {
        credentials: "include",
      });
      if (!providersRes.ok) {
        if (providersRes.status === 401) {
          router.replace("/");
          return;
        }
        throw new Error("Unable to load provider connections");
      }

      const providersJson = (await providersRes.json()) as ProviderCard[];
      setProviders(providersJson);

      const appsRes = await fetch(
        `${API_BASE}/api/providers/${selectedProvider}/apps`,
        {
          credentials: "include",
        },
      );
      if (appsRes.ok) {
        const appsJson = (await appsRes.json()) as ProviderAppsResponse;
        setApps(appsJson);
      } else {
        setApps(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load providers");
    } finally {
      setLoading(false);
    }
  }, [router, selectedProvider]);

  useEffect(() => {
    load();
  }, [load]);

  const providerList = useMemo(
    () => providers.filter((provider) => provider.key !== "railway"),
    [providers],
  );
  const selectedLabel = useMemo(
    () =>
      providerList.find((provider) => provider.key === selectedProvider)
        ?.label || selectedProvider.charAt(0).toUpperCase() + selectedProvider.slice(1),
    [providerList, selectedProvider],
  );

  async function saveToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setSaving(true);
      setError(null);
      setNotice(null);

      const response = await fetch(`${API_BASE}/api/credentials`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selectedProvider,
          label: label || selectedLabel,
          token,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Failed to save provider token");
      }

      // Also save in localStorage (AES-GCM encrypted client-side)
      const session = await fetchSessionUser();
      if (session) {
        const clientKey = await getClientStorageKey(API_BASE);
        if (clientKey) {
          const storageKey = `logforge:credentials:${session.id}`;
          let localCreds: Array<{
            provider: string;
            label: string;
            ciphertext?: string;
            iv?: string;
            token?: string;
          }> = [];
          try {
            const raw = localStorage.getItem(storageKey);
            if (raw) localCreds = JSON.parse(raw);
          } catch (e) {
            console.warn("Failed to parse local credentials", e);
          }
          localCreds = localCreds.filter((c) => c.provider !== selectedProvider);
          try {
            const encrypted = await encryptClientSide(token, clientKey);
            localCreds.push({
              provider: selectedProvider,
              label: label || selectedLabel,
              ciphertext: encrypted.ciphertext,
              iv: encrypted.iv,
            });
            localStorage.setItem(storageKey, JSON.stringify(localCreds));
          } catch (err) {
            console.error("Failed to encrypt token client-side:", err);
          }
        }
      }

      setToken("");
      setLabel("");
      setNotice(`${selectedLabel} token validated and saved`);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save provider token",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative min-h-screen">
      <AppHeader />
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-100">
              <ShieldCheck className="h-3.5 w-3.5" />
              Credential vault
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Provider connections
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Add provider credentials, verify API access, and review the
              services LogForge can observe.
            </p>
          </div>
          <Button
            variant="outline"
            className="w-fit border-white/10 bg-white/5"
            onClick={load}
            disabled={loading}
          >
            <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {error ? (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-red-300/20 bg-red-300/10 px-4 py-3 text-sm text-red-100">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        ) : null}

        {notice ? (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">
            <CheckCircle2 className="h-4 w-4" />
            {notice}
          </div>
        ) : null}

        <section className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {providerList.length > 0 ? (
            providerList.map((provider) => {
              const selected = provider.key === selectedProvider;
              return (
                <Link
                  key={provider.key}
                  href={`/settings?provider=${provider.key}`}
                  className={cn(
                    "rounded-lg border p-4 transition-colors hover:border-primary/40",
                    providerTone[provider.key] ||
                      "border-white/10 bg-white/[0.045]",
                    selected && "ring-1 ring-primary/60",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      <Cloud className="h-4 w-4" />
                      {provider.label}
                    </div>
                    <Badge
                      variant={provider.connected ? "default" : "secondary"}
                      className="rounded-md"
                    >
                      {provider.connected ? "Connected" : "Idle"}
                    </Badge>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    {provider.appsAvailable
                      ? "Service discovery available"
                      : "Waiting for credentials"}
                  </div>
                </Link>
              );
            })
          ) : (
            <div className="col-span-full rounded-lg border border-white/10 bg-white/[0.045] p-4 text-sm text-muted-foreground">
              No provider records loaded yet. Sign in and refresh to load your actual connected providers.
            </div>
          )}
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <Card className="border-white/10 bg-white/[0.045]">
            <CardHeader className="border-b border-white/10">
              <CardTitle className="flex items-center gap-2 text-lg">
                <KeyRound className="h-5 w-5 text-primary" />
                Save {selectedLabel} API token
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <form className="space-y-4" onSubmit={saveToken}>
                <div className="space-y-2">
                  <label
                    htmlFor="label"
                    className="text-sm font-medium text-foreground"
                  >
                    Account label
                  </label>
                  <Input
                    id="label"
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    placeholder={`${selectedLabel} production`}
                    className="border-white/10 bg-black/25"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="token"
                    className="text-sm font-medium text-foreground"
                  >
                    API token
                  </label>
                  <Input
                    id="token"
                    type="password"
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    placeholder="Paste a scoped provider token"
                    className="border-white/10 bg-black/25 font-mono"
                    required
                  />
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="submit" disabled={saving || !token.trim()}>
                    <ShieldCheck className="h-4 w-4" />
                    {saving ? "Validating..." : "Validate and save"}
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="border-white/10 bg-white/5"
                  >
                    <a
                      href={`${API_BASE}/api/providers/${selectedProvider}/auth`}
                    >
                      <ExternalLink className="h-4 w-4" />
                      OAuth connect
                    </a>
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/[0.045]">
            <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-white/10">
              <CardTitle className="text-lg">
                {selectedLabel} services
              </CardTitle>
              <Badge
                variant={apps?.connected ? "default" : "secondary"}
                className="rounded-md"
              >
                {apps?.connected ? "Connected" : "Not connected"}
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 text-sm text-muted-foreground">
                  Loading services...
                </div>
              ) : apps?.apps?.length ? (
                <div className="divide-y divide-white/10">
                  {apps.apps.map((app) => (
                    <div
                      key={app.id}
                      className="grid grid-cols-[1fr_auto] gap-4 px-4 py-4"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">
                          {app.name}
                        </div>
                        <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                          {app.provider}
                        </div>
                      </div>
                      <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-sm text-muted-foreground">
                  No services discovered yet. Add a valid token or complete
                  OAuth for this provider.
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
