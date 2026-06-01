"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/store";
import {
  Circle,
  Download,
  Pause,
  Play,
  Search,
  SlidersHorizontal,
  Trash2,
  Zap,
  Filter,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import type { ProviderType, LogEvent } from "@repo/shared";
import { API_BASE } from "@/lib/config";
import { cn } from "@/lib/utils";

const EMPTY_LOGS: LogEvent[] = [];

type LevelFilter = "all" | "error" | "warn" | "info" | "debug";
type DensityMode = "cozy" | "compact";

const levelOptions: Array<{ key: LevelFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "error", label: "Error" },
  { key: "warn", label: "Warn" },
  { key: "info", label: "Info" },
  { key: "debug", label: "Debug" },
];

function normalizeLevel(level?: string): Exclude<LevelFilter, "all"> {
  const value = (level || "info").toLowerCase();
  if (value.includes("err")) return "error";
  if (value.includes("warn")) return "warn";
  if (value.includes("debug") || value.includes("trace")) return "debug";
  return "info";
}

function levelTone(level: Exclude<LevelFilter, "all">) {
  if (level === "error") return "text-rose-300";
  if (level === "warn") return "text-amber-200";
  if (level === "debug") return "text-sky-200";
  return "text-emerald-200";
}

export default function LogViewer({
  serviceId,
  provider,
  serviceName,
  repository,
  valveTicketId,
}: {
  serviceId: string;
  provider: ProviderType;
  serviceName?: string;
  repository?: string;
  valveTicketId?: string;
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
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [density, setDensity] = useState<DensityMode>("cozy");
  const [autoFollow, setAutoFollow] = useState(true);
  
  const [appConnectionState, setAppConnectionState] = useState<
    "connecting" | "live" | "retrying" | "paused" | "rate-limited"
  >("connecting");
  const [buildConnectionState, setBuildConnectionState] = useState<
    "connecting" | "live" | "retrying" | "paused" | "rate-limited"
  >("connecting");

  const [isWakingUp, setIsWakingUp] = useState(false);
  const [showControls, setShowControls] = useState(false);
  
  const displayedLogs = activeTab === "app" ? (logs ?? EMPTY_LOGS) : (buildLogs ?? EMPTY_LOGS);
  const activeConnectionState = activeTab === "app" ? appConnectionState : buildConnectionState;

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeConnectionState === "connecting" || activeConnectionState === "retrying") {
      const timer = setTimeout(() => {
        setIsWakingUp(true);
      }, 4000);
      return () => clearTimeout(timer);
    } else {
      setIsWakingUp(false);
    }
  }, [activeConnectionState]);

  // App Logs Stream connection
  useEffect(() => {
    if (paused) {
      setAppConnectionState("paused");
      return;
    }

    let stream: EventSource | null = null;
    let closed = false;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 1000;
    const maxRetryDelay = 30000;

    function connectStream() {
      if (closed) return;

      if (stream) {
        stream.close();
      }

      setAppConnectionState("connecting");
      const url = valveTicketId
        ? `${API_BASE}/api/valve/stream?ticket=${valveTicketId}&type=app`
        : `${API_BASE}/api/stream/${provider}/${serviceId}?type=app`;

      stream = new EventSource(url, {
        withCredentials: true,
      });

      stream.addEventListener("ready", () => {
        setAppConnectionState("live");
        retryDelay = 1000;
      });

      stream.addEventListener("rate-limit", () => {
        setAppConnectionState("rate-limited");
      });

      stream.addEventListener("rate-limit-cleared", () => {
        setAppConnectionState("live");
      });

      stream.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as LogEvent[];
          if (Array.isArray(data)) {
            addLogs(serviceId, data);
            setAppConnectionState("live");
            retryDelay = 1000;
          }
        } catch {
          void 0;
        }
      };

      stream.onerror = () => {
        if (closed) return;
        setAppConnectionState("retrying");
        
        if (stream) {
          stream.close();
        }

        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
        }

        reconnectTimeout = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 2, maxRetryDelay);
          connectStream();
        }, retryDelay);
      };
    }

    connectStream();

    return () => {
      closed = true;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (stream) {
        stream.close();
      }
    };
  }, [serviceId, provider, addLogs, paused, valveTicketId]);

  // Build Logs Stream connection
  useEffect(() => {
    if (paused) {
      setBuildConnectionState("paused");
      return;
    }

    let stream: EventSource | null = null;
    let closed = false;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 1000;
    const maxRetryDelay = 30000;

    function connectStream() {
      if (closed) return;

      if (stream) {
        stream.close();
      }

      setBuildConnectionState("connecting");
      const url = valveTicketId
        ? `${API_BASE}/api/valve/stream?ticket=${valveTicketId}&type=build`
        : `${API_BASE}/api/stream/${provider}/${serviceId}?type=build`;

      stream = new EventSource(url, {
        withCredentials: true,
      });

      stream.addEventListener("ready", () => {
        setBuildConnectionState("live");
        retryDelay = 1000;
      });

      stream.addEventListener("rate-limit", () => {
        setBuildConnectionState("rate-limited");
      });

      stream.addEventListener("rate-limit-cleared", () => {
        setBuildConnectionState("live");
      });

      stream.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as LogEvent[];
          if (Array.isArray(data)) {
            addBuildLogs(serviceId, data);
            setBuildConnectionState("live");
            retryDelay = 1000;
          }
        } catch {
          void 0;
        }
      };

      stream.onerror = () => {
        if (closed) return;
        setBuildConnectionState("retrying");
        
        if (stream) {
          stream.close();
        }

        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
        }

        reconnectTimeout = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 2, maxRetryDelay);
          connectStream();
        }, retryDelay);
      };
    }

    connectStream();

    return () => {
      closed = true;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (stream) {
        stream.close();
      }
    };
  }, [serviceId, provider, addBuildLogs, paused, valveTicketId]);

  useEffect(() => {
    if (!paused && autoFollow) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [displayedLogs, paused, autoFollow]);

  useEffect(() => {
    if (paused) {
      setAutoFollow(false);
    }
  }, [paused]);

  const levelCounts = useMemo(() => {
    return displayedLogs.reduce(
      (acc, log) => {
        const level = normalizeLevel(log.level);
        acc[level] += 1;
        return acc;
      },
      { error: 0, warn: 0, info: 0, debug: 0 },
    );
  }, [displayedLogs]);

  const linesPerMinute = useMemo(() => {
    const cutoff = Date.now() - 60_000;
    return displayedLogs.reduce((count, log) => {
      const timestamp = new Date(log.timestamp).getTime();
      if (Number.isFinite(timestamp) && timestamp >= cutoff) {
        return count + 1;
      }
      return count;
    }, 0);
  }, [displayedLogs]);

  const filteredLogs = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    const source = displayedLogs.filter((log) => {
      const normalizedLevel = normalizeLevel(log.level);
      const levelMatch =
        levelFilter === "all" ? true : normalizedLevel === levelFilter;
      if (!levelMatch) {
        return false;
      }

      if (!trimmed) {
        return true;
      }

      return `${log.level || ""} ${log.message}`
        .toLowerCase()
        .includes(trimmed);
    });

    return source.slice(-(density === "compact" ? 1400 : 900));
  }, [density, displayedLogs, levelFilter, query]);

  function downloadLogs() {
    const text = displayedLogs
      .map(
        (log) =>
          `[${log.timestamp}] ${log.level ? `${log.level.toUpperCase()} ` : ""}${log.message}`,
      )
      .join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${provider}-${serviceId}-${activeTab}-logs.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const statusTone = {
    connecting: "text-amber-200",
    live: "text-emerald-200",
    retrying: "text-orange-200",
    paused: "text-muted-foreground",
    "rate-limited": "text-rose-400 animate-pulse",
  }[activeConnectionState];

  const statusLabel =
    activeConnectionState === "live"
      ? "Live"
      : activeConnectionState === "rate-limited"
        ? "Rate Limited (Paused)"
        : `${activeConnectionState.charAt(0).toUpperCase()}${activeConnectionState.slice(1)}`;

  return (
    <section className="glass-panel log-surface sticky top-24 self-start overflow-hidden rounded-[2rem] border border-white/10 shadow-2xl shadow-black/30 buttery-float buttery-fade-up">
      {/* Header Container */}
      <div className="flex flex-col border-b border-white/10 bg-white/[0.03] p-4 gap-3">
        {/* Row 1: Title, Status, Tab Selection, and Collapsible Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Circle className={`h-2.5 w-2.5 fill-current ${statusTone}`} />
              <span className="font-semibold tracking-tight">Terminal</span> · <span className="text-xs text-muted-foreground">{statusLabel}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className="truncate text-foreground/90 font-medium">{serviceName || serviceId}</span>
              {repository && (
                <span className="hidden sm:inline text-muted-foreground/60 truncate">({repository})</span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3 shrink-0">
            {/* Beautiful slide tab switcher */}
            <div className="flex items-center bg-black/40 border border-white/10 rounded-xl p-0.5 shadow-inner">
              <button
                type="button"
                className={cn(
                  "px-3 py-1 text-[11px] font-semibold rounded-lg transition-all duration-200",
                  activeTab === "app"
                    ? "bg-white/10 text-emerald-300 shadow-sm border border-white/5"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setActiveTab("app")}
              >
                App Logs
              </button>
              <button
                type="button"
                className={cn(
                  "px-3 py-1 text-[11px] font-semibold rounded-lg transition-all duration-200",
                  activeTab === "build"
                    ? "bg-white/10 text-amber-300 shadow-sm border border-white/5"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setActiveTab("build")}
              >
                Build Logs
              </button>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "h-8 border-white/15 bg-white/5 text-xs gap-1.5 px-2.5 transition-all",
                showControls && "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"
              )}
              onClick={() => setShowControls(!showControls)}
            >
              <Filter className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Filters & Info</span>
            </Button>
          </div>
        </div>

        {/* Row 2: Search and Main Control Buttons */}
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
          <label className="relative flex-1 min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search / filter logs..."
              className="h-8 border-white/10 bg-black/40 pl-9 text-xs"
            />
          </label>
          
          <div className="flex items-center gap-1.5 justify-end">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title={paused ? "Resume stream" : "Pause stream"}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setPaused((value) => !value);
                setAutoFollow((value) => (paused ? true : value));
              }}
            >
              {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Clear buffer"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => (activeTab === "app" ? clearLogs(serviceId) : clearBuildLogs(serviceId))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-white/10 bg-black/25 text-xs px-2.5 font-medium text-stone-200 hover:bg-white/5"
              onClick={() => {
                setAutoFollow(true);
                setPaused(false);
                bottomRef.current?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Jump to live
            </Button>
          </div>
        </div>

        {/* Collapsible Info and Filters Panel */}
        {showControls && (
          <div className="flex flex-col gap-3 pt-3 border-t border-white/5 animate-in slide-in-from-top-2 duration-200">
            {/* Stats and metadata info */}
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="font-mono px-2 py-0.5 rounded-full border border-white/5 bg-black/30">
                {provider}/{serviceId}
              </span>
              <span className="px-2 py-0.5 rounded-full border border-white/5 bg-black/30">
                {displayedLogs.length.toLocaleString()} buffered
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-white/5 bg-black/30">
                <Zap className="h-2.5 w-2.5 text-emerald-300" />
                {linesPerMinute.toLocaleString()} lines/min
              </span>
              <span className="px-2 py-0.5 rounded-full border border-rose-500/10 bg-rose-500/5 text-rose-300/80">
                {levelCounts.error} error
              </span>
              <span className="px-2 py-0.5 rounded-full border border-amber-500/10 bg-amber-500/5 text-amber-300/80">
                {levelCounts.warn} warn
              </span>
              <span className="px-2 py-0.5 rounded-full border border-blue-500/10 bg-blue-500/5 text-blue-300/80">
                {levelCounts.info} info
              </span>
              <span className="px-2 py-0.5 rounded-full border border-white/10 bg-white/5">
                {levelCounts.debug} debug
              </span>
            </div>

            {/* Level filters and settings */}
            <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
              <div className="flex flex-wrap items-center gap-1">
                {levelOptions.map((option) => (
                  <Button
                    key={option.key}
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-7 border-white/5 bg-black/30 text-xs px-2.5 rounded-lg",
                      levelFilter === option.key &&
                        "border-emerald-300/30 bg-emerald-300/20 text-emerald-100",
                    )}
                    onClick={() => setLevelFilter(option.key)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>

              <div className="flex items-center gap-1.5 self-stretch sm:self-auto justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  title={density === "cozy" ? "Switch to compact" : "Switch to cozy"}
                  className="h-7 border-white/5 bg-black/30 text-xs gap-1.5 px-2.5 rounded-lg"
                  onClick={() =>
                    setDensity((value) => (value === "cozy" ? "compact" : "cozy"))
                  }
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>{density === "cozy" ? "Compact" : "Cozy"}</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  title="Download logs"
                  className="h-7 border-white/5 bg-black/30 text-xs gap-1.5 px-2.5 rounded-lg"
                  onClick={downloadLogs}
                  disabled={displayedLogs.length === 0}
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Export</span>
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {isWakingUp && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-xs text-amber-200/90 flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
          </span>
          Server cold start detected. Waking up server container... (May take 30-60s)
        </div>
      )}
      {activeConnectionState === "rate-limited" && (
        <div className="bg-rose-500/10 border-b border-rose-500/20 px-4 py-2 text-xs text-rose-200/90 flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
          </span>
          API Rate Limit reached. Polling is temporarily paused for 60 seconds.
        </div>
      )}

      <div
        className={cn(
          "smooth-scrollbar h-[60vh] lg:h-[32rem] overflow-y-auto p-3 font-mono text-xs text-stone-200",
          density === "compact" ? "leading-4" : "leading-5",
        )}
      >
        {filteredLogs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted-foreground gap-3">
            {isWakingUp ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-amber-300" />
                <p className="max-w-md text-amber-200/80">
                  Waking up the server... Since LogForge is running on a free tier, it can take up to 60 seconds to start. Thank you for your patience!
                </p>
              </>
            ) : activeConnectionState === "rate-limited" ? (
              <p className="max-w-md text-rose-300/80 font-semibold animate-pulse">
                API Rate Limit reached! Polling has been paused temporarily to prevent account suspension. It will resume automatically in 60 seconds.
              </p>
            ) : (
              <p>
                {displayedLogs.length === 0
                  ? `Waiting for the first ${activeTab === "app" ? "runtime app" : "build"} log event.`
                  : "No log lines match this filter."}
              </p>
            )}
          </div>
        ) : (
          filteredLogs.map((log, i) => {
            const normalizedLevel = normalizeLevel(log.level);
            return (
              <div
                key={log.id || `${log.timestamp}-${i}`}
                className={cn(
                  "logline-enter flex flex-col sm:grid sm:grid-cols-[2.5rem_7.75rem_4.5rem_1fr] gap-1 sm:gap-3 border-b border-white/[0.04] px-1 py-1 hover:bg-white/[0.04] transition-colors duration-150",
                  density === "compact" ? "py-0.5 sm:py-1" : "py-1.5 sm:py-2",
                )}
              >
                <span className="hidden sm:inline text-right text-[10px] text-muted-foreground/50">
                  {i + 1}
                </span>
                <div className="flex items-center gap-2 sm:contents">
                  <span className="text-[10px] sm:text-xs text-muted-foreground/60 font-medium">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={cn("text-[9px] sm:text-xs font-semibold sm:font-normal uppercase tracking-wider sm:normal-case sm:tracking-normal px-1 rounded-sm sm:px-0 sm:bg-transparent", 
                    normalizedLevel === "error" && "bg-rose-500/10 sm:bg-transparent",
                    normalizedLevel === "warn" && "bg-amber-500/10 sm:bg-transparent",
                    normalizedLevel === "info" && "bg-emerald-500/10 sm:bg-transparent",
                    normalizedLevel === "debug" && "bg-blue-500/10 sm:bg-transparent",
                    levelTone(normalizedLevel)
                  )}>
                    {normalizedLevel}
                  </span>
                </div>
                <span className="min-w-0 break-words text-stone-100 text-xs select-text">
                  {log.message}
                </span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </section>
  );
}
