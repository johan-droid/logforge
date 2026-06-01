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
  const addLogs = useStore((state) => state.addLogs);
  const clearLogs = useStore((state) => state.clearLogs);
  const [paused, setPaused] = useState(false);
  const [query, setQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [density, setDensity] = useState<DensityMode>("cozy");
  const [autoFollow, setAutoFollow] = useState(true);
  const [connectionState, setConnectionState] = useState<
    "connecting" | "live" | "retrying" | "paused"
  >("connecting");
  const displayedLogs = logs ?? EMPTY_LOGS;

  const bottomRef = useRef<HTMLDivElement>(null);

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

      if (stream) {
        stream.close();
      }

      setConnectionState("connecting");
      const url = valveTicketId
        ? `${API_BASE}/api/valve/stream?ticket=${valveTicketId}`
        : `${API_BASE}/api/stream/${provider}/${serviceId}`;

      stream = new EventSource(url, {
        withCredentials: true,
      });

      stream.addEventListener("ready", () => {
        setConnectionState("live");
        retryDelay = 1000;
      });

      stream.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as LogEvent[];
          if (Array.isArray(data)) {
            addLogs(serviceId, data);
            setConnectionState("live");
            retryDelay = 1000;
          }
        } catch {
          // JSON parse failed, do not trigger auto-reconnection
        }
      };

      stream.onerror = () => {
        if (closed) return;
        setConnectionState("retrying");
        
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
    anchor.download = `${provider}-${serviceId}-logs.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const statusTone = {
    connecting: "text-amber-200",
    live: "text-emerald-200",
    retrying: "text-orange-200",
    paused: "text-muted-foreground",
  }[connectionState];

  const statusLabel =
    connectionState === "live"
      ? "Live"
      : `${connectionState.charAt(0).toUpperCase()}${connectionState.slice(1)}`;

  return (
    <section className="glass-panel log-surface sticky top-24 self-start overflow-hidden rounded-[2rem] border border-white/10 shadow-2xl shadow-black/30 buttery-float buttery-fade-up">
      <div className="flex flex-col gap-3 border-b border-white/10 bg-white/[0.03] p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Circle className={`h-2.5 w-2.5 fill-current ${statusTone}`} />
            Floating terminal · {statusLabel}
          </div>
          <div className="mt-1 truncate text-xs text-foreground/90">
            {serviceName || serviceId}
            {repository ? ` in ${repository}` : ""}
          </div>
          <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {provider}/{serviceId} / {displayedLogs.length.toLocaleString()} buffered
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/20 px-2 py-1">
              <Zap className="h-3 w-3 text-emerald-300" />
              {linesPerMinute.toLocaleString()} lines/min
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/20 px-2 py-1">
              {levelCounts.error} error
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/20 px-2 py-1">
              {levelCounts.warn} warn
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/20 px-2 py-1">
              {levelCounts.info} info
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/20 px-2 py-1">
              {levelCounts.debug} debug
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2 lg:items-end">
          <label className="relative block min-w-0 sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter text, level, context"
              className="h-9 border-white/10 bg-black/30 pl-9"
            />
          </label>
          <div className="flex flex-wrap items-center gap-1">
            {levelOptions.map((option) => (
              <Button
                key={option.key}
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 border-white/10 bg-black/25 text-xs",
                  levelFilter === option.key &&
                    "border-emerald-300/40 bg-emerald-300/20 text-emerald-100",
                )}
                onClick={() => setLevelFilter(option.key)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title={density === "cozy" ? "Switch to compact" : "Switch to cozy"}
              className="h-9 w-9"
              onClick={() =>
                setDensity((value) => (value === "cozy" ? "compact" : "cozy"))
              }
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title={paused ? "Resume stream" : "Pause stream"}
              className="h-9 w-9"
              onClick={() => {
                setPaused((value) => !value);
                setAutoFollow((value) => (paused ? true : value));
              }}
            >
              {paused ? (
                <Play className="h-4 w-4" />
              ) : (
                <Pause className="h-4 w-4" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Download logs"
              className="h-9 w-9"
              onClick={downloadLogs}
              disabled={displayedLogs.length === 0}
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Clear buffer"
              className="h-9 w-9"
              onClick={() => clearLogs(serviceId)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 border-white/10 bg-black/25 text-xs"
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
      </div>

      <div
        className={cn(
          "smooth-scrollbar h-[30rem] overflow-y-auto p-3 font-mono text-xs text-stone-200",
          density === "compact" ? "leading-4" : "leading-5",
        )}
      >
        {filteredLogs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
            {displayedLogs.length === 0
              ? "Waiting for the first log event."
              : "No log lines match this filter."}
          </div>
        ) : (
          filteredLogs.map((log, i) => {
            const normalizedLevel = normalizeLevel(log.level);
            return (
              <div
                key={log.id || `${log.timestamp}-${i}`}
                className={cn(
                  "logline-enter grid grid-cols-[2.5rem_7.75rem_4.5rem_1fr] gap-3 border-b border-white/[0.04] px-1 py-1.5 hover:bg-white/[0.04]",
                  density === "compact" ? "py-1" : "py-1.5",
                )}
              >
                <span className="text-right text-[10px] text-muted-foreground/70">
                  {i + 1}
                </span>
                <span className="text-muted-foreground">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={cn("truncate", levelTone(normalizedLevel))}>
                  {normalizedLevel}
                </span>
                <span className="min-w-0 break-words text-stone-100">
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
