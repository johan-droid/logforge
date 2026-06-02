"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Terminal, Cloud, Zap, Activity, AlertTriangle, RefreshCcw, Play, Pause, Download, Trash2, Search, Filter, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/store";
import type { ProviderType, LogEvent } from "@repo/shared";
import { cn } from "@/lib/utils";
import { API_BASE } from "@/lib/config";
import { fetchSessionUser } from "@/lib/auth";

type ProviderCard = {
  key: ProviderType;
  label: string;
  connected: boolean;
  appsAvailable: boolean;
};

type ServiceRecord = {
  id: string;
  provider: ProviderType;
  name: string;
  type?: string | null;
  repoUrl?: string | null;
  active: boolean;
};

const providerColors: Record<string, string> = {
  render: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
  vercel: "bg-zinc-100/10 text-zinc-300 border-zinc-100/20",
  heroku: "bg-indigo-500/10 text-indigo-300 border-indigo-500/20",
  cloudflare: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  railway: "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/20",
};

export default function TerminalPage() {
  const router = useRouter();
  const bufferedLogs = useStore((state) => state.logs);
  const [providers, setProviders] = useState<ProviderCard[]>([]);
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [selectedService, setSelectedService] = useState<ServiceRecord | null>(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const session = await fetchSessionUser();
      if (!session) {
        router.replace("/");
        return;
      }

      const [providersRes, servicesRes] = await Promise.all([
        fetch(`${API_BASE}/api/providers`, { credentials: "include" }),
        fetch(`${API_BASE}/api/services`, { credentials: "include" }),
      ]);

      if (providersRes.status === 401 || servicesRes.status === 401) {
        router.replace("/");
        return;
      }

      if (!providersRes.ok || !servicesRes.ok) {
        throw new Error("Unable to load platform configuration");
      }

      const providerList = (await providersRes.json()) as ProviderCard[];
      const serviceList = (await servicesRes.json()) as ServiceRecord[];

      setProviders(providerList);
      setServices(serviceList);
      setSelectedService((current) =>
        current && serviceList.some((svc) => svc.id === current.id)
          ? current
          : serviceList[0] || null,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load dashboard data",
      );
      setProviders([]);
      setServices([]);
      setSelectedService(null);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const filteredServices = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return services;
    return services.filter((service) => {
      const providerLabel = service.provider.toLowerCase();
      return `${service.name} ${providerLabel}`.includes(query);
    });
  }, [services, filter]);

  return (
    <div className="relative flex min-h-screen flex-col bg-black text-stone-100">
      {/* Deep terminal background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-emerald-600/8 blur-[200px]" />
        <div className="absolute right-20 top-40 h-[600px] w-[600px] rounded-full bg-cyan-700/6 blur-[250px]" />
        <div className="absolute bottom-0 left-1/2 h-[400px] w-[800px] -translate-x-1/2 rounded-full bg-indigo-800/5 blur-[180px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/[0.08] bg-black/40 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1920px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-600 shadow-lg shadow-emerald-500/20">
              <Terminal className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">LogForge Terminal</h1>
              <p className="text-xs text-stone-400">Live deployment telemetry across all clouds</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="sm" className="border-white/10 bg-white/5 text-xs hover:bg-white/10">
              <a href="/dashboard">Dashboard</a>
            </Button>
            <Button asChild size="sm" className="bg-emerald-600 text-xs hover:bg-emerald-500">
              <a href="/settings">Configure Providers</a>
            </Button>
          </div>
        </div>
      </header>

      {/* Utility Bar */}
      <div className="relative z-10 border-b border-white/[0.06] bg-black/20 py-2 px-6">
        <div className="mx-auto flex max-w-[1920px] flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6 text-xs text-stone-400">
            <div className="flex items-center gap-2">
              <Cloud className="h-3.5 w-3.5 text-blue-400" />
              <span>Providers: <strong className="text-stone-200">{providers.filter(p => p.connected).length}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-emerald-400" />
              <span>Active Systems: <strong className="text-stone-200">{services.length}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              <span>Buffered Lines: <strong className="text-stone-200">{Object.values(bufferedLogs).reduce((acc, c) => acc + c.length, 0).toLocaleString()}</strong></span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadDashboard}
            disabled={loading}
            className="h-7 border-white/10 bg-white/5 text-xs hover:bg-white/10"
          >
            <RefreshCcw className={cn("mr-1.5 h-3 w-3", loading && "animate-spin")} />
            Sync
          </Button>
        </div>
      </div>

      {error && (
        <div className="relative z-10 mx-auto mt-4 w-full max-w-[1920px] px-6">
          <div className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-2 text-xs text-rose-300">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        </div>
      )}

      {/* Main Terminal Workspace */}
      <main className="relative z-10 mx-auto flex w-full max-w-[1920px] flex-1 gap-4 p-4">
        {/* Left Sidebar - Service Directory */}
        <aside className="flex w-72 flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-500" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search systems..."
              className="h-9 border-white/10 bg-white/5 pl-9 text-xs placeholder:text-stone-500 focus-visible:ring-1 focus-visible:ring-emerald-500/50"
            />
          </div>

          <div className="flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-black/40 p-2 backdrop-blur-xl">
            <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">
              Connected Systems
            </div>
            <div className="mt-1 space-y-1">
              {loading ? (
                <div className="p-4 text-center text-xs text-stone-500">Discovering systems...</div>
              ) : filteredServices.length > 0 ? (
                filteredServices.map((service) => {
                  const isSelected = selectedService?.id === service.id;
                  const linesCount = bufferedLogs[service.id]?.length || 0;
                  return (
                    <button
                      key={service.id}
                      onClick={() => setSelectedService(service)}
                      className={cn(
                        "group flex w-full items-center justify-between rounded-xl p-2.5 text-left text-xs transition-all duration-150",
                        isSelected
                          ? "bg-emerald-500/10 text-stone-100 shadow-sm border border-emerald-500/20"
                          : "text-stone-400 hover:bg-white/5 hover:text-stone-100 border border-transparent"
                      )}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="truncate font-medium">{service.name}</div>
                        <div className="mt-1 flex items-center gap-1.5 text-[10px] opacity-80">
                          <span
                            className={cn(
                              "inline-block px-1.5 py-0.5 rounded text-[9px] font-medium border uppercase tracking-wider",
                              providerColors[service.provider] || "bg-white/10 text-white/70 border-white/10"
                            )}
                          >
                            {service.provider}
                          </span>
                          {service.active && (
                            <span className="flex h-1.5 w-1.5 items-center rounded-full bg-emerald-400" />
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {linesCount > 0 && (
                          <span className="font-mono text-[10px] text-stone-500">{linesCount}</span>
                        )}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="p-6 text-center text-xs text-stone-500">
                  No active systems found. Configure credentials in settings.
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Right - Terminal Output */}
        <div className="flex-1 min-w-0">
          {selectedService ? (
            <TerminalViewer
              key={selectedService.id}
              serviceId={selectedService.id}
              provider={selectedService.provider}
              serviceName={selectedService.name}
              repository={selectedService.repoUrl || undefined}
            />
          ) : (
            <div className="flex h-full min-h-[600px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl">
              <Terminal className="h-16 w-16 text-stone-600 mb-4 animate-pulse" />
              <h3 className="text-lg font-semibold text-stone-200">Select a System</h3>
              <p className="mt-2 text-sm text-stone-500 max-w-md text-center">
                Choose a service from the directory to connect the live telemetry terminal and stream deployment logs.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function TerminalViewer({
  serviceId,
  provider,
  serviceName,
  repository,
}: {
  serviceId: string;
  provider: ProviderType;
  serviceName?: string;
  repository?: string;
}) {
  const logs = useStore((state) => state.logs[serviceId]);
  const buildLogs = useStore((state) => state.buildLogs[serviceId]);
  const addLogs = useStore((state) => state.addLogs);
  const addBuildLogs = useStore((state) => state.addBuildLogs);
  const clearLogs = useStore((state) => state.clearLogs);
  const clearBuildLogs = useStore((state) => state.clearBuildLogs);

  const [activeTab, setActiveTab] = useState<"app" | "build">("app");
  const [paused, setPaused] = useState(false);
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  
  const [connectionState, setConnectionState] = useState<"connecting" | "live" | "retrying" | "paused" | "rate-limited">("connecting");

  const displayedLogs = activeTab === "app" ? (logs ?? []) : (buildLogs ?? []);

  useEffect(() => {
    if (paused) {
      setConnectionState("paused");
      return;
    }

    let stream: EventSource | null = null;
    let closed = false;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 1000;
    const maxRetryDelay = 30000;

    function connectStream() {
      if (closed) return;
      if (stream) stream.close();

      setConnectionState("connecting");
      const url = `${API_BASE}/api/stream/${provider}/${serviceId}?type=${activeTab}`;

      stream = new EventSource(url, { withCredentials: true });

      stream.addEventListener("ready", () => {
        setConnectionState("live");
        retryDelay = 1000;
      });

      stream.addEventListener("rate-limit", () => setConnectionState("rate-limited"));
      stream.addEventListener("rate-limit-cleared", () => setConnectionState("live"));

      stream.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as LogEvent[];
          if (Array.isArray(data)) {
            activeTab === "app" ? addLogs(serviceId, data) : addBuildLogs(serviceId, data);
            setConnectionState("live");
            retryDelay = 1000;
          }
        } catch {}
      };

      stream.onerror = () => {
        if (closed) return;
        setConnectionState("retrying");
        if (stream) stream.close();
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 2, maxRetryDelay);
          connectStream();
        }, retryDelay);
      };
    }

    connectStream();

    return () => {
      closed = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (stream) stream.close();
    };
  }, [serviceId, provider, activeTab, addLogs, addBuildLogs, paused]);

  const statusTone = {
    connecting: "text-amber-300",
    live: "text-emerald-400",
    retrying: "text-orange-400",
    paused: "text-stone-500",
    "rate-limited": "text-rose-400 animate-pulse",
  }[connectionState];

  const filteredLogs = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    return displayedLogs.filter((log) => {
      if (!trimmed) return true;
      return `${log.level || ""} ${log.message}`.toLowerCase().includes(trimmed);
    }).slice(-1200);
  }, [displayedLogs, query]);

  function downloadLogs() {
    const text = displayedLogs
      .map((log) => `[${log.timestamp}] ${log.level ? `${log.level.toUpperCase()} ` : ""}${log.message}`)
      .join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${provider}-${serviceId}-${activeTab}-logs.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-black/60 backdrop-blur-xl overflow-hidden">
      {/* Terminal Header */}
      <div className="flex flex-col border-b border-white/10 bg-black/80 p-4 gap-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Circle className={`h-3 w-3 fill-current ${statusTone}`} />
            <div>
              <div className="text-sm font-semibold text-stone-100">{serviceName || serviceId}</div>
              <div className="text-xs text-stone-500">{repository}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-black/60 border border-white/10 rounded-lg p-0.5">
              <button
                className={cn(
                  "px-3 py-1 text-[11px] font-semibold rounded-md transition-all",
                  activeTab === "app" ? "bg-emerald-500/20 text-emerald-300" : "text-stone-500 hover:text-stone-200"
                )}
                onClick={() => setActiveTab("app")}
              >
                App Logs
              </button>
              <button
                className={cn(
                  "px-3 py-1 text-[11px] font-semibold rounded-md transition-all",
                  activeTab === "build" ? "bg-amber-500/20 text-amber-300" : "text-stone-500 hover:text-stone-200"
                )}
                onClick={() => setActiveTab("build")}
              >
                Build Logs
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              className={cn("h-8 border-white/10 bg-white/5 text-xs", showFilters && "border-emerald-400/30 bg-emerald-400/10")}
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-500" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search logs..."
              className="h-8 border-white/10 bg-black/60 pl-9 text-xs"
            />
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-stone-400 hover:text-stone-100" onClick={() => setPaused(!paused)}>
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-stone-400 hover:text-stone-100" onClick={() => activeTab === "app" ? clearLogs(serviceId) : clearBuildLogs(serviceId)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 border-white/10 bg-black/40 text-xs" onClick={downloadLogs}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export
          </Button>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
            <span className="text-[10px] px-2 py-1 rounded-full border border-white/10 bg-black/40 text-stone-400">
              {displayedLogs.length.toLocaleString()} buffered
            </span>
            <span className="text-[10px] px-2 py-1 rounded-full border border-white/10 bg-black/40 text-stone-400">
              {provider}/{serviceId}
            </span>
          </div>
        )}
      </div>

      {/* Log Output */}
      <div className="flex-1 overflow-y-auto font-mono text-xs p-4 space-y-1">
        {filteredLogs.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-stone-600">
            Waiting for logs...
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="logline-enter flex gap-3">
              <span className="shrink-0 text-stone-600">{new Date(log.timestamp).toLocaleTimeString()}</span>
              <span className={cn(
                "uppercase text-[10px] font-bold px-1.5 py-0.5 rounded",
                log.level === "error" ? "bg-rose-500/20 text-rose-300" :
                log.level === "warn" ? "bg-amber-500/20 text-amber-300" :
                log.level === "debug" ? "bg-sky-500/20 text-sky-300" :
                "bg-emerald-500/20 text-emerald-300"
              )}>
                {log.level || "INFO"}
              </span>
              <span className="text-stone-300 break-all">{log.message}</span>
            </div>
          ))
        )}
        <div ref={() => {}} />
      </div>
    </div>
  );
}
