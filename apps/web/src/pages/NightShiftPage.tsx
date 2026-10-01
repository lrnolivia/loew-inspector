import { FeatureHeader } from "../components/FeatureHeader";
import { SignalDeck } from "../components/SignalDeck";
import { StatusLight } from "../components/Telemetry";
import { projectLabel } from "../api";
import { useLiveRelay } from "../live";

function relative(value?: string | null) {
  if (!value) return "not reported";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "time unknown";
  const diff = ms - Date.now();
  const hours = Math.round(diff / 3_600_000);
  if (Math.abs(hours) < 1) return diff >= 0 ? "within the hour" : "less than an hour ago";
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(hours, "hour");
}

export function NightShiftPage() {
  const { snapshot, state } = useLiveRelay();
  const workers = snapshot?.workers || [];
  const enabled = workers.filter(worker => worker.enabled);
  const attention = workers.filter(worker => Boolean(worker.runtime?.last_error) || ["blocked", "failed", "waiting_credentials"].includes(worker.runtime?.status || ""));
  const nextTimes = enabled.map(worker => worker.runtime?.next_run_at).filter(Boolean) as string[];
  const next = nextTimes.sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  const results = [...workers].filter(worker => worker.runtime?.last_run_at).sort((a, b) => Date.parse(b.runtime?.last_run_at || "0") - Date.parse(a.runtime?.last_run_at || "0"));

  const answer = !enabled.length ? "nothing scheduled" : next ? relative(next) : "schedule enabled";
  const cards = [
    { id: "next", label: "will anything happen?", value: answer, detail: !enabled.length ? "Automatic checks are paused or unavailable." : next ? `next reported check ${new Date(next).toLocaleString()}` : "Automatic work is enabled, but Relay has no next-run time to show.", tone: enabled.length ? "good" : "quiet" },
    { id: "projects", label: "included projects", value: String(enabled.length), detail: enabled.length ? "Projects with automatic observation enabled." : "No project is currently scheduled.", tone: enabled.length ? "wait" : "quiet" },
    { id: "attention", label: "needs attention", value: String(attention.length), detail: attention.length ? "An unattended check reported a blocker or error." : "No unattended check currently reports an error.", tone: attention.length ? "act" : "quiet" },
    { id: "monitoring", label: "monitoring", value: state, detail: snapshot ? `dashboard refreshed ${new Date(snapshot.fetchedAt).toLocaleTimeString()}` : "waiting for Relay", tone: state === "live" ? "good" : state === "stale" ? "warn" : "quiet" }
  ];

  return (
    <div className="page operator-page react-page">
      <FeatureHeader feature="night-shift" title="night shift" subtitle="monitor" />
      <SignalDeck cards={cards} />
      <section className="operator-section">
        <div className="section-heading"><h2>while you were away</h2><span>{results.length} results on record</span></div>
        <div className="night-list">
          {results.length ? results.slice(0, 10).map(worker => {
            const tone = worker.runtime?.last_error ? "bad" : worker.runtime?.status === "running" ? "good" : "quiet";
            return <article className="automation-row night-card" key={worker.id} data-tone={tone}>
              <div className="night-card-head"><strong>{projectLabel(worker.id)}</strong><StatusLight tone={tone} label={worker.runtime?.last_error ? "needs attention" : worker.runtime?.status === "running" ? "checking now" : "recorded"} /></div>
              <p>{worker.runtime?.last_summary || worker.runtime?.last_error || "No result summary was recorded."}</p>
              <small>last run {relative(worker.runtime?.last_run_at)} · {worker.enabled ? `next ${relative(worker.runtime?.next_run_at)}` : "automatic checks paused"}</small>
            </article>;
          }) : <div className="empty-card"><strong>No unattended results yet.</strong><p>Night shift will distinguish an empty history from a completed run with a problem.</p></div>}
        </div>
      </section>
    </div>
  );
}
