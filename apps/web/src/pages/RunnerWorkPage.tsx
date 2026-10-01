import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { loadAssignment } from "../api";
import { SignalDeck } from "../components/SignalDeck";
import { ActivitySparkline, ProgressRing, StatusLight } from "../components/Telemetry";
import type { ObservedProgress } from "../types";

export function RunnerWorkPage() {
  const { project = "", assignment = "" } = useParams();
  const [item, setItem] = useState<ObservedProgress | null>(null);
  const [status, setStatus] = useState<"connecting" | "live" | "reconnecting" | "stale" | "offline">("connecting");

  useEffect(() => {
    let alive = true;
    let last = 0;
    async function refresh() {
      try {
        if (last) setStatus("reconnecting");
        const payload = await loadAssignment(project, assignment);
        if (!alive) return;
        setItem(payload.progress?.[0] || null);
        last = Date.now();
        setStatus("live");
      } catch {
        if (!alive) return;
        setStatus(last && Date.now() - last < 30_000 ? "reconnecting" : "offline");
      }
    }
    void refresh();
    const timer = window.setInterval(() => {
      if (last && Date.now() - last > 20_000) setStatus("stale");
      void refresh();
    }, 8_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [project, assignment]);

  const title = item?.goal || assignment.replace(/[-_]+/g, " ");
  const events = useMemo(() => item?.events || [], [item]);
  const percent = item?.state === "complete" ? 100 : undefined;
  const cards = [
    { id: "state", label: "state", value: (item?.state || status).replaceAll("-", " "), detail: item?.waiting_reason || "Current canonical work state.", tone: item?.state === "failed" || item?.state === "blocked" ? "bad" : status === "live" ? "good" : "quiet" },
    { id: "phase", label: "current phase", value: (item?.stage || "working").replaceAll("-", " "), detail: item?.next_action || "No next action reported.", tone: "quiet" },
    { id: "events", label: "observed updates", value: String(events.length), detail: item?.last_meaningful_progress_at ? `latest ${new Date(item.last_meaningful_progress_at).toLocaleString()}` : "No timestamp reported.", tone: events.length ? "good" : "quiet" }
  ];

  return (
    <div className="page operator-page react-page work-detail">
      <Link className="back-link" to="/runner">← runner</Link>
      <SignalDeck cards={cards} />
      <div className="work-detail-head">
        <div>
          <div className="work-card-meta"><StatusLight tone={status === "live" ? "good" : status === "stale" ? "warn" : "quiet"} label={status} />{item?.primary_staff && <span>{item.primary_staff}</span>}</div>
          <h1>{title}</h1>
          <p>{item?.waiting_reason || item?.recovery_action || item?.latest_event?.type?.replaceAll("-", " ") || "Waiting for current execution evidence."}</p>
        </div>
        <ProgressRing percent={percent} label={(item?.stage || "current phase").replaceAll("-", " ")} />
      </div>
      <section className="telemetry-panel">
        <div><span>latest update</span><strong>{item?.last_meaningful_progress_at ? new Date(item.last_meaningful_progress_at).toLocaleString() : "not reported"}</strong></div>
        <div><span>next</span><strong>{item?.next_action || "No next action reported."}</strong></div>
        <ActivitySparkline events={events} />
      </section>
      <section className="operator-section">
        <div className="section-heading"><h2>live updates</h2><span>{events.length} observed</span></div>
        <ol className="event-stream">
          {events.map((event, index) => <li key={event.id || index}><time>{event.at ? new Date(event.at).toLocaleTimeString() : "time unknown"}</time><strong>{(event.type || "update").replaceAll("-", " ")}</strong><span>{index === 0 ? "latest confirmed update" : "observed by Relay"}</span></li>)}
        </ol>
      </section>
      <details className="technical-disclosure"><summary>technical identity</summary><pre>{JSON.stringify(item?.identities || {}, null, 2)}</pre></details>
    </div>
  );
}
