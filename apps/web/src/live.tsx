import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { loadDashboard } from "./api";
import type { ConnectionState, DashboardSnapshot } from "./types";

type LiveRelay = {
  snapshot: DashboardSnapshot | null;
  state: ConnectionState;
  error: string | null;
  refresh: () => Promise<void>;
};

const LiveRelayContext = createContext<LiveRelay | null>(null);

export function LiveRelayProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [state, setState] = useState<ConnectionState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const lastSuccess = useRef(0);
  const busy = useRef(false);

  async function refresh() {
    if (busy.current) return;
    busy.current = true;
    if (lastSuccess.current) setState("reconnecting");
    try {
      const next = await loadDashboard();
      lastSuccess.current = Date.now();
      setSnapshot(next);
      setError(null);
      setState("live");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Relay could not refresh.";
      setError(message);
      setState(lastSuccess.current && Date.now() - lastSuccess.current < 30_000 ? "reconnecting" : "offline");
    } finally {
      busy.current = false;
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 8_000);
    const staleTimer = window.setInterval(() => {
      if (lastSuccess.current && Date.now() - lastSuccess.current > 20_000) {
        setState(current => current === "offline" ? current : "stale");
      }
    }, 2_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(staleTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const value = useMemo(() => ({ snapshot, state, error, refresh }), [snapshot, state, error]);
  return <LiveRelayContext.Provider value={value}>{children}</LiveRelayContext.Provider>;
}

export function useLiveRelay() {
  const value = useContext(LiveRelayContext);
  if (!value) throw new Error("useLiveRelay must be inside LiveRelayProvider");
  return value;
}
