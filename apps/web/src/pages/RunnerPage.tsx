import { FeatureHeader } from "../components/FeatureHeader";
import { SignalDeck } from "../components/SignalDeck";
import { ProgressNotice } from "../components/ProgressNotice";
import { WorkCard } from "../components/WorkCard";
import { useLiveRelay } from "../live";
import type { ObservedProgress } from "../types";

export function RunnerPage() {
  const { snapshot, state } = useLiveRelay();
  const all: Array<{ project: string; item: ObservedProgress }> = [];
  for (const [project, payload] of Object.entries(snapshot?.progress || {})) {
    for (const item of payload.progress || []) if (item.state !== "complete") all.push({ project, item });
  }
  all.sort((a, b) => Date.parse(b.item.last_meaningful_progress_at || "0") - Date.parse(a.item.last_meaningful_progress_at || "0"));
  const needs = all.filter(({ item }) => ["waiting-for-human", "blocked", "failed"].includes(item.state || "")).length;
  const external = all.filter(({ item }) => item.state === "waiting-on-external-system").length;
  const stale = all.filter(({ item }) => item.state?.includes("stale")).length;
  const incomplete = !snapshot || Boolean(snapshot.loadingProgress?.length || snapshot.failedProgress?.length);
  const count = (value: number) => incomplete ? value ? `${value}+` : "pending" : String(value);
  const cards = [
    { id: "now", label: "happening now", value: count(all.length), detail: incomplete ? "Available activity so far; some project reads are pending or unavailable." : "Meaningful work with current canonical state.", tone: all.length ? "good" : "quiet" },
    { id: "needs", label: "needs you", value: count(needs), detail: incomplete ? "Available activity so far; some project reads are pending or unavailable." : needs ? "Runner has a decision, blocker, or failed check to surface." : "No current work is waiting on you.", tone: needs ? "act" : "quiet" },
    { id: "external", label: "external wait", value: count(external), detail: incomplete ? "Available activity so far; some project reads are pending or unavailable." : external ? "A check or external system is still running." : "No work is waiting on an external system.", tone: external ? "wait" : "quiet" },
    { id: "fresh", label: "freshness", value: state, detail: incomplete ? "Activity coverage is incomplete." : stale ? `${stale} work item${stale === 1 ? "" : "s"} may be stale.` : "Current work has no stale warning.", tone: stale ? "warn" : state === "live" ? "good" : "quiet" }
  ];
  return (
    <div className="page operator-page react-page">
      <FeatureHeader feature="runner" title="runner" subtitle="coordinate" />
      <ProgressNotice />
      <SignalDeck cards={cards} feature="runner" />
      <section className="operator-section">
        <div className="section-heading"><h2>meaningful work</h2><span>{all.length} {incomplete ? "loaded" : "current"}</span></div>
        <div className="work-list">{all.length ? all.map(({ project, item }) => <WorkCard project={project} item={item} key={`${project}:${item.assignment}`} />) : incomplete ? null : <div className="empty-card"><strong>Nothing is moving right now.</strong><p>Runner will show work here when Relay has current execution evidence.</p></div>}</div>
      </section>
    </div>
  );
}
