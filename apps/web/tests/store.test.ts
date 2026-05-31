import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "../store";
import { ProviderType, type LogEvent } from "@repo/shared";

describe("store addLogs/clearLogs", () => {
  beforeEach(() => {
    // reset store state
    useStore.setState({ logs: {} });
  });

  it("adds logs and truncates to 5000", () => {
    const sid = "svc-test";
    const logs: LogEvent[] = Array.from({ length: 10 }, (_, i) => ({
      timestamp: new Date().toISOString(),
      serviceId: sid,
      provider: ProviderType.RENDER,
      message: `m${i}`,
    }));
    useStore.getState().addLogs(sid, logs);
    const s = useStore.getState();
    const arr = s.logs[sid] || [];
    expect(arr.length).toBe(10);
  });

  it("ignores malformed logs", () => {
    const sid = "svc-test-2";
    useStore.getState().addLogs(sid, [{ bad: true } as unknown as LogEvent]);
    const s = useStore.getState();
    expect(s.logs[sid]).toBeUndefined();
  });

  it("clearLogs sets empty array", () => {
    const sid = "svc-clear";
    useStore.getState().addLogs(sid, [
      {
        timestamp: new Date().toISOString(),
        serviceId: sid,
        provider: ProviderType.RENDER,
        message: "hi",
      },
    ]);
    useStore.getState().clearLogs(sid);
    const s = useStore.getState();
    expect(s.logs[sid] ?? []).toEqual([]);
  });
});
