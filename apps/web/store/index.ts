import { create } from 'zustand';
import type { Branch, LogEvent, ProviderType, Service } from '@repo/shared';

interface AppState {
  providers: ProviderType[];
  services: Service[];
  branches: Branch[];
  logs: Record<string, LogEvent[]>;
  buildLogs: Record<string, LogEvent[]>;
  setProviders: (providers: ProviderType[]) => void;
  setServices: (services: Service[]) => void;
  setBranches: (branches: Branch[]) => void;
  addLogs: (serviceId: string, newLogs: LogEvent[]) => void;
  addBuildLogs: (serviceId: string, newLogs: LogEvent[]) => void;
  clearLogs: (serviceId: string) => void;
  clearBuildLogs: (serviceId: string) => void;
}

export const useStore = create<AppState>((set) => ({
  providers: [],
  services: [],
  branches: [],
  logs: {},
  buildLogs: {},
  setProviders: (providers) => set({ providers }),
  setServices: (services) => set({ services }),
  setBranches: (branches) => set({ branches }),
  addLogs: (serviceId, newLogs) => set((state) => {
    if (typeof serviceId !== 'string') return state;
    if (!Array.isArray(newLogs) || newLogs.length === 0) return state;
    const sanitized = newLogs.filter(l => l && typeof l.timestamp === 'string' && typeof l.serviceId === 'string' && typeof l.message === 'string');
    if (sanitized.length === 0) return state;
    const existing = state.logs[serviceId] || [];
    const combined = [...existing, ...sanitized];
    const truncated = combined.length > 5000 ? combined.slice(combined.length - 5000) : combined;
    return { logs: { ...state.logs, [serviceId]: truncated } };
  }),
  addBuildLogs: (serviceId, newLogs) => set((state) => {
    if (typeof serviceId !== 'string') return state;
    if (!Array.isArray(newLogs) || newLogs.length === 0) return state;
    const sanitized = newLogs.filter(l => l && typeof l.timestamp === 'string' && typeof l.serviceId === 'string' && typeof l.message === 'string');
    if (sanitized.length === 0) return state;
    const existing = state.buildLogs[serviceId] || [];
    const combined = [...existing, ...sanitized];
    const truncated = combined.length > 5000 ? combined.slice(combined.length - 5000) : combined;
    return { buildLogs: { ...state.buildLogs, [serviceId]: truncated } };
  }),
  clearLogs: (serviceId) => set((state) => {
    if (typeof serviceId !== 'string') return state;
    return { logs: { ...state.logs, [serviceId]: [] } };
  }),
  clearBuildLogs: (serviceId) => set((state) => {
    if (typeof serviceId !== 'string') return state;
    return { buildLogs: { ...state.buildLogs, [serviceId]: [] } };
  })
}));
