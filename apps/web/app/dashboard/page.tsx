"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Gauge,
  RadioTower,
  RefreshCcw,
  Search,
} from "lucide-react";
import LogViewer from "@/components/LogViewer";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type RepoGroup = {
  repoKey: string;
  repoLabel: string;
  services: ServiceRecord[];
};

type ProviderGroup = {
  provider: ProviderType;
  providerLabel: string;
  repos: RepoGroup[];
};

const providerTone: Record<string, string> = {
  render: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
  vercel: "border-zinc-100/25 bg-zinc-100/10 text-zinc-100",
  heroku: "border-indigo-300/25 bg-indigo-300/10 text-indigo-100",
  cloudflare: "border-amber-300/25 bg-amber-300/10 text-amber-100",
  railway: "border-fuchsia-300/25 bg-fuchsia-300/10 text-fuchsia-100",
};

function formatProvider(provider: string) {
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function repoLabelFromUrl(repoUrl?: string | null) {
  if (!repoUrl) {
    return "Unlinked repository";
  }

  try {
    const url = new URL(repoUrl);
    const path = url.pathname.replace(/^\/+|\/+$/g, "");
    return path || repoUrl;
  } catch {
    return repoUrl;
  }
}

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
        throw new Error("Unable to load provider systems and repositories");
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
      const repoLabel = repoLabelFromUrl(service.repoUrl).toLowerCase();
      return `${service.name} ${service.provider} ${repoLabel}`
        .toLowerCase()
        .includes(query);
    });
  }, [services, filter]);

  const providerGroups = useMemo<ProviderGroup[]>(() => {
    const providerLabelMap = new Map(
      providers.map((provider) => [provider.key, provider.label]),
    );
    const grouped = new Map<ProviderType, Map<string, RepoGroup>>();

    for (const service of filteredServices) {
      const providerMap =
        grouped.get(service.provider) || new Map<string, RepoGroup>();
      const repoLabel = repoLabelFromUrl(service.repoUrl);
      const repoKey = service.repoUrl || `unlinked:${service.provider}`;
      const existingRepo = providerMap.get(repoKey) || {
        repoKey,
        repoLabel,
        services: [],
      };

      existingRepo.services.push(service);
      providerMap.set(repoKey, existingRepo);
      grouped.set(service.provider, providerMap);
    }

    return Array.from(grouped.entries())
      .map(([provider, repoMap]) => ({
        provider,
        providerLabel: providerLabelMap.get(provider) || formatProvider(provider),
        repos: Array.from(repoMap.values()).sort((a, b) =>
          a.repoLabel.localeCompare(b.repoLabel),
        ),
      }))
      .sort((a, b) => a.providerLabel.localeCompare(b.providerLabel));
  }, [filteredServices, providers]);

  const totalLogLines = useMemo(
    () =>
      Object.values(bufferedLogs).reduce(
        (total, serviceLogs) => total + serviceLogs.length,
        0,
      ),
    [bufferedLogs],
  );

  const connectedProviders = providers.filter(
    (provider) => provider.connected,
  ).length;
  const activeServices = services.length;
  const totalRepos = providerGroups.reduce(
    (count, provider) => count + provider.repos.length,
    0,
  );

  return (
    <div className="relative min-h-screen">
      <AppHeader />
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 buttery-fade-up">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-100 backdrop-blur-sm">
              <RadioTower className="h-3.5 w-3.5" />
              Unified deployment console
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Provider systems and repository logs
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Browse each cloud provider, inspect published repositories, and
              stream service logs from a single dashboard.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="border-white/10 bg-white/5"
              onClick={loadDashboard}
              disabled={loading}
            >
              <RefreshCcw
                className={cn("h-4 w-4", loading && "animate-spin")}
              />
              Refresh
            </Button>
            <Button asChild>
              <a href="/settings">Connect provider</a>
            </Button>
          </div>
        </div>

        {error ? (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        ) : null}

        <section className="mb-6 grid gap-4 md:grid-cols-4">
          <Card className="glass-panel border-white/10 transition-transform duration-300 hover:-translate-y-0.5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                Connected providers
                <Cloud className="h-4 w-4" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{connectedProviders}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {providers.length} configured integrations
              </div>
            </CardContent>
          </Card>
          <Card className="glass-panel border-white/10 transition-transform duration-300 hover:-translate-y-0.5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                Active systems
                <Gauge className="h-4 w-4" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{activeServices}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Services loaded from your providers
              </div>
            </CardContent>
          </Card>
          <Card className="glass-panel border-white/10 transition-transform duration-300 hover:-translate-y-0.5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Published repositories
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{totalRepos}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Grouped across connected providers
              </div>
            </CardContent>
          </Card>
          <Card className="glass-panel border-white/10 transition-transform duration-300 hover:-translate-y-0.5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                Buffered log lines
                <RadioTower className="h-4 w-4" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">
                {totalLogLines.toLocaleString()}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Capped at 5,000 per system
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {providers.length > 0 ? (
            providers.map((provider) => {
            const providerServices = services.filter(
              (service) => service.provider === provider.key,
            );
            const repoCount = new Set(
              providerServices.map((service) => service.repoUrl || service.id),
            ).size;
            return (
              <div
                key={provider.key}
                className={cn(
                  "glass-panel rounded-lg border p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/20",
                  providerTone[provider.key] || "border-white/10 bg-white/5",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{provider.label}</div>
                  <Badge
                    variant={provider.connected ? "default" : "secondary"}
                    className="rounded-md"
                  >
                    {provider.connected ? "Connected" : "Idle"}
                  </Badge>
                </div>
                <div className="mt-3 flex items-end justify-between">
                  <div className="text-2xl font-semibold">
                    {providerServices.length}
                  </div>
                  <div className="text-xs opacity-80">systems</div>
                </div>
                <div className="mt-1 text-xs opacity-80">{repoCount} repos</div>
              </div>
            );
            })
          ) : (
            <div className="col-span-full rounded-lg border border-white/10 bg-white/[0.045] p-4 text-sm text-muted-foreground">
              No provider integrations are available yet. Connect one in settings to populate live provider cards.
            </div>
          )}
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <Card className="glass-panel border-white/10">
            <CardHeader className="gap-3 border-b border-white/10">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-lg">Systems by provider and repo</CardTitle>
                <label className="relative block sm:w-72">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    placeholder="Search provider, repo, or system"
                    className="h-9 border-white/10 bg-black/25 pl-9"
                  />
                </label>
              </div>
            </CardHeader>
            <CardContent className="smooth-scrollbar max-h-[40rem] overflow-y-auto p-0">
              {loading ? (
                <div className="p-6 text-sm text-muted-foreground">
                  Loading provider systems...
                </div>
              ) : providerGroups.length > 0 ? (
                <div className="divide-y divide-white/10">
                  {providerGroups.map((group) => (
                    <section key={group.provider} className="px-4 py-4">
                      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.providerLabel}
                      </div>
                      <div className="space-y-3">
                        {group.repos.map((repo) => (
                          <div
                            key={`${group.provider}-${repo.repoKey}`}
                            className="rounded-md border border-white/10 bg-black/20/80 transition-colors duration-200 hover:border-white/20"
                          >
                            <div className="border-b border-white/10 px-3 py-2 text-xs text-muted-foreground">
                              {repo.repoLabel}
                            </div>
                            <div className="divide-y divide-white/10">
                              {repo.services.map((service) => {
                                const selected = selectedService?.id === service.id;
                                const count = bufferedLogs[service.id]?.length || 0;
                                return (
                                  <button
                                    key={service.id}
                                    type="button"
                                    onClick={() => setSelectedService(service)}
                                    className={cn(
                                      "grid w-full grid-cols-[1fr_auto] gap-4 px-3 py-3 text-left transition-all duration-200 hover:bg-white/[0.06]",
                                      selected && "bg-primary/12 shadow-inner shadow-primary/20",
                                    )}
                                  >
                                    <span className="min-w-0">
                                      <span className="block truncate font-medium text-foreground">
                                        {service.name}
                                      </span>
                                      <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                                        {formatProvider(service.provider)} {service.type || "service"}
                                      </span>
                                    </span>
                                    <span className="text-right font-mono text-xs text-muted-foreground">
                                      {count.toLocaleString()} lines
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-sm text-muted-foreground">
                  No systems are loaded yet. Connect providers in Settings, then
                  return to stream logs by repository.
                </div>
              )}
            </CardContent>
          </Card>

          {selectedService ? (
            <LogViewer
              serviceId={selectedService.id}
              provider={selectedService.provider}
              serviceName={selectedService.name}
              repository={repoLabelFromUrl(selectedService.repoUrl)}
            />
          ) : (
            <div className="glass-panel flex min-h-[28rem] items-center justify-center rounded-lg border border-dashed border-white/15 p-8 text-center text-sm text-muted-foreground">
              Select a system from any provider/repository group to open live logs.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
