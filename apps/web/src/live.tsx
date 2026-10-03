import { bindLiveEvents } from '../public/live-events.js';
import {projectInGroup} from "../../../packages/shared-ui/project-groups.js";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { loadDashboard, projectLabel } from "./api";
import { publishNotification, resolveNotification } from '../../../packages/shared-ui/notifications.js';
import { advanceArrivalBaseline } from "../../../packages/shared-ui/work-activity.js";
import type { ConnectionState, DashboardSnapshot } from "./types";

type LiveRelay = {
  snapshot: DashboardSnapshot | null;
  allSnapshot: DashboardSnapshot | null;
  state: ConnectionState;
  eventConnected: boolean;
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
  const [eventConnected,setEventConnected]=useState(false);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [state, setState] = useState<ConnectionState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const lastSuccess = useRef(0);
  const busy = useRef(false);
  const refreshPending = useRef(false);
  const latestSnapshot = useRef<DashboardSnapshot | null>(null);

  const arrivals = useRef<Record<string,{ids:string[]}> | null>(null);
  if (arrivals.current === null) {
    try { const stored=JSON.parse(sessionStorage.getItem('relay.arrivals.v1') || '{}'); arrivals.current=stored && typeof stored==='object' && !Array.isArray(stored)?stored:{}; } catch { arrivals.current={}; }
  }
  async function refresh() {
    if (busy.current) {refreshPending.current=true;return;}
    busy.current = true;
    if (lastSuccess.current) setState("reconnecting");
    try {
      await loadDashboard(next => {
        const observed=advanceArrivalBaseline(arrivals.current || {},next);
        arrivals.current=observed.next;
        if(observed.arrivals.length)window.dispatchEvent(new CustomEvent('relay:work-arrivals',{detail:observed.arrivals.map(({project,item})=>({project,kind:'assignment',id:item.assignment}))}));
        try { sessionStorage.setItem('relay.arrivals.v1',JSON.stringify(observed.next)); } catch {}
        for(const {project:itemProject,item} of observed.arrivals) publishNotification({
          id:'new-work:'+itemProject+':'+item.assignment, feature:'runner',project:projectLabel(itemProject),
          title:'New work',message:item.goal || item.assignment,severity:'info',
          href:'/#/runner/'+encodeURIComponent(itemProject)+'/'+encodeURIComponent(item.assignment)+'?project='+encodeURIComponent(itemProject),action:'Open work'
        });
        resolveNotification('dashboard:connection');
        for (const item of next.projects) {
          const id = 'progress:' + item.id;
          if (next.failedProgress?.includes(item.id)) publishNotification({ id, feature:'runner', project:projectLabel(item), title:'Project activity unavailable',
            message:'Some activity could not refresh. Available information stays visible; Relay will retry.', severity:'warning',
            href:'/#/runner?project=' + encodeURIComponent(item.id), action:'Open project' });
          else if (!next.loadingProgress?.includes(item.id)) resolveNotification(id);
        }
        for (const worker of next.workers) {
          const id = 'automatic:' + worker.id;
          if (worker.runtime?.status === 'failed') publishNotification({id,feature:'night-shift',project:projectLabel(worker.id),title:'Automatic check needs attention',
            message:worker.runtime.last_summary || 'The last automatic check reported a problem.',severity:'warning',href:'/#/night-shift?project=' + encodeURIComponent(worker.id)+'&item='+encodeURIComponent(worker.id),action:'Open check'});
          else if (['completed','succeeded','success'].includes(worker.runtime?.status || '')) resolveNotification(id);
        }
        lastSuccess.current = Date.now();
        latestSnapshot.current = next;
        setSnapshot(next);
        setError(null);
        setState("live");
      }, latestSnapshot.current);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Relay could not refresh.";
      publishNotification({id:'dashboard:connection',feature:'relay',title:'Could not refresh Relay',message:'The connection is unavailable. Previously loaded information stays visible; Relay will retry.',severity:'error',href:'/#/today',action:'Open Today'});
      setError(message);
      setState(lastSuccess.current && Date.now() - lastSuccess.current < 30_000 ? "reconnecting" : "offline");
    } finally {
      busy.current = false;
      if(refreshPending.current){refreshPending.current=false;void refresh();}
    }
  }

  useEffect(() => {
    void refresh();
    const host=window as Window & {__RELAY_MCP__?:boolean;__retainedFixture?:unknown};
    const unbindEvents=bindLiveEvents({invalidate:()=>void refresh(),connection:setEventConnected,disabled:Boolean(host.__RELAY_MCP__||host.__retainedFixture)});
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
      unbindEvents();
      window.clearInterval(timer);
      window.clearInterval(staleTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const scopedSnapshot = useMemo(() => snapshot && project ? {
    ...snapshot,
    progress: Object.fromEntries(Object.entries(snapshot.progress).filter(([id]) => projectInGroup(id,project))),
    workers: snapshot.workers.filter(worker => projectInGroup(worker.id,project)),
    loadingProgress: snapshot.loadingProgress?.filter(id => projectInGroup(id,project)),
    failedProgress: snapshot.failedProgress?.filter(id => projectInGroup(id,project))
  } : snapshot, [snapshot, project]);
  const value = { snapshot: scopedSnapshot, allSnapshot: snapshot, state, eventConnected, error, refresh, project, selectProject };
  return <LiveRelayContext.Provider value={value}>{children}</LiveRelayContext.Provider>;
}

export function useLiveRelay() {
  const value = useContext(LiveRelayContext);
  if (!value) throw new Error("useLiveRelay must be inside LiveRelayProvider");
  return value;
}
