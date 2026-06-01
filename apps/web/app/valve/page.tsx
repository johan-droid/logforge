"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Cloud,
  Cpu,
  Key,
  Play,
  RefreshCcw,
  Shield,
  StopCircle,
} from "lucide-react";
import LogViewer from "@/components/LogViewer";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { API_BASE } from "@/lib/config";
import { cn } from "@/lib/utils";
import { ProviderType } from "@repo/shared";

type ProviderOption = {
  key: ProviderType;
  label: string;
  placeholder: string;
  tone: string;
};

const providersList: ProviderOption[] = [
  {
    key: ProviderType.VERCEL,
    label: "Vercel",
    placeholder: "enter vercel personal access token...",
    tone: "border-zinc-100/20 bg-zinc-100/5 hover:border-zinc-100/40 text-zinc-100",
  },
  {
    key: ProviderType.HEROKU,
    label: "Heroku",
    placeholder: "enter heroku api key...",
    tone: "border-indigo-400/20 bg-indigo-400/5 hover:border-indigo-400/40 text-indigo-100",
  },
  {
    key: ProviderType.CLOUDFLARE,
    label: "Cloudflare",
    placeholder: "enter cloudflare api token...",
    tone: "border-amber-400/20 bg-amber-400/5 hover:border-amber-400/40 text-amber-100",
  },
  {
    key: ProviderType.RAILWAY,
    label: "Railway",
    placeholder: "enter railway api token...",
    tone: "border-fuchsia-400/20 bg-fuchsia-400/5 hover:border-fuchsia-400/40 text-fuchsia-100",
  },
  {
    key: ProviderType.RENDER,
    label: "Render",
    placeholder: "enter render api key...",
    tone: "border-cyan-400/20 bg-cyan-400/5 hover:border-cyan-400/40 text-cyan-100",
  },
];

type ProviderApp = {
  id: string;
  name: string;
};

export default function SecureValvePage() {
  const [provider, setProvider] = useState<ProviderOption["key"]>(ProviderType.VERCEL);
  const [token, setToken] = useState("");
  const [loadingApps, setLoadingApps] = useState(false);
  const [apps, setApps] = useState<ProviderApp[]>([]);
  const [selectedApp, setSelectedApp] = useState<ProviderApp | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [streaming, setStreaming] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);

  // Fetch apps statelessly
  async function handleLoadApps() {
    if (!token.trim()) {
      setError("Please supply a valid API key or token first.");
      return;
    }

    setLoadingApps(true);
    setError(null);
    setApps([]);
    setSelectedApp(null);

    try {
      const res = await fetch(`${API_BASE}/api/valve/apps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, token }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to locate any systems with token");
      }

      const data = await res.json();
      setApps(data.apps || []);
      if (data.apps?.length > 0) {
        setSelectedApp(data.apps[0]);
      } else {
        setError("No applications or services found on this account.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoadingApps(false);
    }
  }

  // Obtain an ephemeral ticket and stream
  async function handleStartStream() {
    if (!selectedApp) return;

    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/valve/ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          token,
          serviceId: selectedApp.id,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to establish single-use ticket");
      }

      const data = await res.json();
      setTicketId(data.ticketId);
      setStreaming(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open secure stream");
    }
  }

  function handleStopStream() {
    setStreaming(false);
    setTicketId(null);
  }

  const selectedProviderInfo = providersList.find((p) => p.key === provider)!;

  return (
    <div className="relative isolate min-h-screen overflow-hidden">
      {/* Visual background details */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-12 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute right-[-4rem] top-28 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-violet-500/5 blur-3xl" />
      </div>

      <AppHeader />

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 buttery-fade-up">
        {/* Banner area */}
        <section className="glass-panel relative overflow-hidden rounded-[2rem] border border-white/10 p-6 shadow-2xl shadow-black/20">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/60 to-transparent" />
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-medium text-blue-200">
                <span className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1 backdrop-blur-sm">
                  <Shield className="h-3.5 w-3.5" />
                  Stateless Ephemeral Streaming (Bypass Mode)
                </span>
                <span className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-3 py-1 text-foreground/80">
                  Zero Persistence
                </span>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                LogForge Secure Valve
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Bypass traditional database storage entirely. Enter your cloud provider credentials on-the-fly to stream live console logs straight to your browser. Your credentials are used exclusively in memory to establish a live connection and are discarded immediately upon disconnecting.
              </p>
            </div>
          </div>
        </section>

        {error && (
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3.5 text-sm text-rose-200">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          {/* Controls Panel */}
          <div className={cn("lg:col-span-5", streaming && "lg:col-span-4")}>
            <Card className="glass-panel border-white/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Key className="h-5 w-5 text-blue-400" />
                  Authentication Parameters
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Provider Selection */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Select Cloud Provider
                  </label>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
                    {providersList.map((p) => {
                      const active = provider === p.key;
                      return (
                        <button
                          key={p.key}
                          type="button"
                          disabled={streaming}
                          className={cn(
                            "flex flex-col items-start rounded-xl border p-3 text-left transition-all duration-300 disabled:opacity-50",
                            active
                              ? "border-blue-400/50 bg-blue-400/15 shadow-lg shadow-blue-500/10 text-white"
                              : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05] text-muted-foreground"
                          )}
                          onClick={() => {
                            setProvider(p.key);
                            setApps([]);
                            setSelectedApp(null);
                            setToken("");
                          }}
                        >
                          <Cloud className="h-4 w-4" />
                          <span className="mt-2 text-sm font-semibold">{p.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Token input */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {selectedProviderInfo.label} API Key / Token
                  </label>
                  <Input
                    type="password"
                    disabled={streaming}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={selectedProviderInfo.placeholder}
                    className="border-white/10 bg-black/40"
                  />
                  <p className="text-[11px] text-muted-foreground/80">
                    Your key is used strictly for authentication and app discovery. It is never stored.
                  </p>
                </div>

                {/* Action button */}
                {!streaming && (
                  <Button
                    onClick={handleLoadApps}
                    disabled={loadingApps || !token.trim()}
                    className="w-full"
                  >
                    {loadingApps ? (
                      <>
                        <RefreshCcw className="mr-2 h-4 w-4 animate-spin" />
                        Fetching Services...
                      </>
                    ) : (
                      <>
                        Discover Services
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                )}

                {/* App Discovery List */}
                {apps.length > 0 && (
                  <div className="space-y-2 border-t border-white/10 pt-4">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Discovered Systems ({apps.length})
                    </label>
                    <div className="smooth-scrollbar max-h-48 overflow-y-auto space-y-1.5 pr-1">
                      {apps.map((app) => {
                        const isSelected = selectedApp?.id === app.id;
                        return (
                          <button
                            key={app.id}
                            type="button"
                            disabled={streaming}
                            onClick={() => setSelectedApp(app)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-all duration-200 disabled:opacity-50",
                              isSelected
                                ? "border-blue-400 bg-blue-500/10 text-white"
                                : "border-white/5 bg-black/25 hover:border-white/15 hover:bg-black/40 text-muted-foreground"
                            )}
                          >
                            <Cpu className="h-4 w-4 shrink-0 text-blue-300" />
                            <span className="truncate font-medium">{app.name}</span>
                          </button>
                        );
                      })}
                    </div>

                    {!streaming ? (
                      <Button
                        onClick={handleStartStream}
                        disabled={!selectedApp}
                        className="mt-3 w-full bg-emerald-600 hover:bg-emerald-500 text-white"
                      >
                        <Play className="mr-2 h-4 w-4" />
                        Stream Live Logs
                      </Button>
                    ) : (
                      <Button
                        onClick={handleStopStream}
                        variant="destructive"
                        className="mt-3 w-full"
                      >
                        <StopCircle className="mr-2 h-4 w-4" />
                        Disconnect Valve
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Terminal Panel */}
          <div className={cn("lg:col-span-7", streaming && "lg:col-span-8")}>
            {streaming && selectedApp && ticketId ? (
              <LogViewer
                serviceId={selectedApp.id}
                provider={provider}
                serviceName={selectedApp.name}
                repository="Secure Ephemeral Stream"
                valveTicketId={ticketId}
              />
            ) : (
              <div className="glass-panel flex min-h-[25rem] flex-col items-center justify-center rounded-[2rem] border border-dashed border-white/10 p-8 text-center text-muted-foreground">
                <Shield className="h-12 w-12 text-muted-foreground/30 mb-4 animate-pulse" />
                <h3 className="text-base font-semibold text-foreground">
                  No Active Ephemeral Stream
                </h3>
                <p className="mt-1 text-sm max-w-sm">
                  Supply credentials and select a discovered service to establish an encrypted, real-time log pipe.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
