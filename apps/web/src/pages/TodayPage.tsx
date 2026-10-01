import { FeatureHeader } from "../components/FeatureHeader";
import { SignalDeck } from "../components/SignalDeck";
import { WorkCard } from "../components/WorkCard";
import { useLiveRelay } from "../live";
import type { ObservedProgress } from "../types";

export function TodayPage() {
  const { snapshot, state } = useLiveRelay();
  const all: Array<{ project: string; item: ObservedProgress }> = [];
  for (const [project, payload] of Object.entries(snapshot?.progress || {})) {
    for (const item of payload.progress || []) all.push({ project, item });
  }
  const current = all.filter(({ item }) => item.state !== "complete");
  const needs = current.filter(({ item }) => ["waiting-for-human", "blocked", "failed", "officially-stale"].includes(item.state || ""));
  const moving = current.filter(({ item }) => item.state === "working");
  const ready = current.filter(({ item }) => item.state === "waiting-for-human" && /review|approval/i.test([item.waiting_reason, item.next_action].filter(Boolean).join(" ")));
  const lead = needs[0] || moving[0] || current[0];

  const cards = [
    { id: "needs", label: "needs you", value: String(needs.length), detail: needs.length ? "A decision, review, or recovery step is waiting." : "Nothing is asking for your attention.", tone: needs.length ? "act" : "quiet" },
    { id: "moving", label: "moving", value: String(moving.length), detail: moving.length ? "Observed work has fresh execution evidence." : "No work is currently evidenced as moving.", tone: moving.length ? "good" : "quiet" },
    { id: "review", label: "ready to review", value: String(ready.length), detail: ready.length ? "Work is explicitly waiting on review or approval." : "No review request is waiting.", tone: ready.length ? "wait" : "quiet" },
    { id: "freshness", label: "information", value: state, detail: snapshot ? `last refreshed ${new Date(snapshot.fetchedAt).toLocaleTimeString()}` : "waiting for Relay", tone: state === "live" ? "good" : state === "stale" ? "warn" : "quiet" }
  ];

  return (
    <div className="page">
      <FeatureHeader feature="today" title="today" subtitle="what matters right now" />
      <SignalDeck cards={cards} />
      <section className="lead-section">
        <div className="section-label">most useful next action</div>
        {lead ? <WorkCard project={lead.project} item={lead.item} /> : <div className="empty-card"><strong>You’re clear.</strong><p>No observed work needs a next action right now.</p></div>}
      </section>
      <section>
        <div className="section-heading"><h2>work happening now</h2><span>{current.length} observed</span></div>
        <div className="work-list">{current.slice(0, 8).map(({ project, item }) => <WorkCard project={project} item={item} key={`${project}:${item.assignment}`} />)}</div>
      </section>
    </div>
  );
}
