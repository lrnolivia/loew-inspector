import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { loadDashboard } from "./api";
import type { ConnectionState, DashboardSnapshot } from "./types";

type LiveRelay = {
  snapshot: DashboardSnapshot | null;
  state: ConnectionState;
  error: string | null;
  refresh: () => Promise<void>;
  project: string;
  selectProject: (id: string) => void;
};

const LiveRelayContext = createContext<LiveRelay | null>(null);

export function LiveRelayProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const project = searchParams.get("project") || "";
  const selectProject = (id: string) => {
    const params = new URLSearchParams(searchParams);
    if (id) params.set("project", id);
    else params.delete("project");
    setSearchParams(params);
  };
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [state, setState] = useState<ConnectionState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const lastSuccess = useRef(0);
  const busy = useRef(false);
  const latestSnapshot = useRef<DashboardSnapshot | null>(null);

  async function refresh() {
    if (busy.current) return;
    busy.current = true;
    if (lastSuccess.current) setState("reconnecting");
    try {
      await loadDashboard(next => {
        lastSuccess.current = Date.now();
        latestSnapshot.current = next;
        setSnapshot(next);
        setError(null);
        setState("live");
      }, latestSnapshot.current);
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
    const timer = window.setInterval(() => void refresh(), 60_000);
    const staleTimer = window.setInterval(() => {
      if (lastSuccess.current && Date.now() - lastSuccess.current > 90_000) {
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

  const scopedSnapshot = useMemo(() => snapshot && project ? {
    ...snapshot,
    progress: Object.fromEntries(Object.entries(snapshot.progress).filter(([id]) => id === project)),
    workers: snapshot.workers.filter(worker => worker.id === project),
    loadingProgress: snapshot.loadingProgress?.filter(id => id === project),
    failedProgress: snapshot.failedProgress?.filter(id => id === project)
  } : snapshot, [snapshot, project]);
  const value = { snapshot: scopedSnapshot, state, error, refresh, project, selectProject };
  return <LiveRelayContext.Provider value={value}>{children}</LiveRelayContext.Provider>;
}

export function useLiveRelay() {
  const value = useContext(LiveRelayContext);
  if (!value) throw new Error("useLiveRelay must be inside LiveRelayProvider");
  return value;
}
