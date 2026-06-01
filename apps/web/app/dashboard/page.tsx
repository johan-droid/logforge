"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ChevronRight,
  Database,
  RefreshCcw,
  Search,
  Server,
  Cloud,
} from "lucide-react";
import LogViewer from "@/components/LogViewer";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/store";
import type { ProviderType } from "@repo/shared";
import { cn } from "@/lib/utils";
import { fetchSessionUser } from "@/lib/auth";
import { API_BASE } from "@/lib/config";

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

export default function Dashboard() {
  const router = useRouter();
  const bufferedLogs = useStore((state) => state.logs);
  const [providers, setProviders] = useState<ProviderCard[]>([]);
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [selectedService, setSelectedService] = useState<ServiceRecord | null>(
    null,
  );
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"directory" | "terminal">("directory");

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

  const connectedProvidersCount = providers.filter((p) => p.connected).length;

  return (
    <div className="relative flex min-h-screen flex-col bg-background text-foreground selection:bg-primary/20">
      {/* Background gradients */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 -top-20 h-96 w-96 rounded-full bg-blue-500/5 blur-[120px]" />
        <div className="absolute right-10 top-20 h-[30rem] w-[30rem] rounded-full bg-indigo-500/5 blur-[150px]" />
      </div>

      <AppHeader />

      {/* Mini SaaS Utility Bar */}
      <div className="border-b border-white/[0.06] bg-black/10 py-3 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Cloud className="h-3.5 w-3.5 text-blue-400" />
              <span>
                Providers: <strong className="text-foreground">{connectedProvidersCount}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Server className="h-3.5 w-3.5 text-emerald-400" />
              <span>
                Active Systems: <strong className="text-foreground">{services.length}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Database className="h-3.5 w-3.5 text-violet-400" />
              <span>
                Buffered Lines:{" "}
                <strong className="text-foreground">
                  {Object.values(bufferedLogs)
                    .reduce((acc, current) => acc + current.length, 0)
                    .toLocaleString()}
                </strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadDashboard}
              disabled={loading}
              className="h-8 border-white/5 bg-white/[0.02] text-xs hover:bg-white/[0.06]"
            >
              <RefreshCcw className={cn("mr-1.5 h-3 w-3", loading && "animate-spin")} />
              Sync Now
            </Button>
            <Button asChild size="sm" className="h-8 text-xs">
              <a href="/settings">Configure Provider</a>
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-auto mt-4 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-xs text-rose-300">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        </div>
      )}

      {/* View Toggle on Mobile/Tablet */}
      <div className="flex border-b border-white/[0.06] bg-black/15 p-1 lg:hidden justify-center gap-1 mx-4 sm:mx-6 mt-4 rounded-xl border border-white/5 shadow-inner">
        <button
          onClick={() => setActiveView("directory")}
          className={cn(
            "flex-1 py-1.5 text-center text-xs font-semibold rounded-lg transition-all duration-200",
            activeView === "directory"
              ? "bg-white/10 text-foreground shadow-sm"
              : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
          )}
        >
          Systems Directory
        </button>
        <button
          onClick={() => setActiveView("terminal")}
          className={cn(
            "flex-1 py-1.5 text-center text-xs font-semibold rounded-lg transition-all duration-200",
            activeView === "terminal"
              ? "bg-white/10 text-foreground shadow-sm"
              : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
          )}
          disabled={!selectedService}
        >
          Terminal Output
        </button>
      </div>

      {/* Main SaaS Workspace */}
      <main className="mx-auto flex w-full max-w-7xl flex-1 gap-6 p-4 sm:p-6 lg:p-8">
        <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
          
          {/* Left Column: Systems Directory */}
          <div className={cn("flex flex-col gap-3", activeView !== "directory" && "hidden lg:flex")}>
            <div className="relative flex items-center">
              <Search className="absolute left-3 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search systems..."
                className="h-9 border-white/[0.06] bg-white/[0.02] pl-9 text-xs placeholder:text-muted-foreground/60 focus-visible:ring-1 focus-visible:ring-white/10"
              />
            </div>

            <div className="flex-1 rounded-2xl border border-white/[0.06] bg-white/[0.01] p-2 backdrop-blur-xl">
              <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                Connected Systems
              </div>
              <div className="mt-1 space-y-1">
                {loading ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    Discovering systems...
                  </div>
                ) : filteredServices.length > 0 ? (
                  filteredServices.map((service) => {
                    const isSelected = selectedService?.id === service.id;
                    const linesCount = bufferedLogs[service.id]?.length || 0;
                    return (
                      <button
                        key={service.id}
                        onClick={() => {
                          setSelectedService(service);
                          setActiveView("terminal");
                        }}
                        className={cn(
                          "group flex w-full items-center justify-between rounded-xl p-2.5 text-left text-xs transition-all duration-150",
                          isSelected
                            ? "bg-white/[0.06] text-foreground shadow-sm border border-white/[0.05]"
                            : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground border border-transparent"
                        )}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="truncate font-medium">{service.name}</div>
                          <div className="mt-1 flex items-center gap-1.5 text-[10px] opacity-80">
                            <span
                              className={cn(
                                "inline-block px-1.5 py-0.5 rounded text-[9px] font-medium border uppercase tracking-wider",
                                providerColors[service.provider] ||
                                  "bg-white/10 text-white/70 border-white/10"
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
                            <span className="font-mono text-[10px] text-muted-foreground/80">
                              {linesCount}
                            </span>
                          )}
                          <ChevronRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    No active systems found. Configure credentials in settings.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Dynamic Output Terminal */}
          <div className={cn("min-w-0", activeView !== "terminal" && "hidden lg:block")}>
            {selectedService ? (
              <LogViewer
                key={selectedService.id}
                serviceId={selectedService.id}
                provider={selectedService.provider}
                serviceName={selectedService.name}
                repository={selectedService.repoUrl || undefined}
              />
            ) : (
              <div className="flex min-h-[32rem] flex-col items-center justify-center rounded-[2rem] border border-white/[0.06] bg-white/[0.01] p-8 text-center backdrop-blur-xl">
                <Activity className="h-8 w-8 text-muted-foreground/30 mb-3 animate-pulse" />
                <h3 className="text-sm font-medium text-foreground">Select a System</h3>
                <p className="mt-1 text-xs text-muted-foreground max-w-xs">
                  Choose a service from the sidebar directory to connect the live logs telemetry terminal.
                </p>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
