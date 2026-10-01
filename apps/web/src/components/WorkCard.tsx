import { projectHref } from "../../../../packages/shared-ui/project-context.js";
import { useLiveRelay } from "../live";
import { Link } from "react-router-dom";
import { ActivitySparkline, ProgressRing, StatusLight } from "./Telemetry";
import type { ObservedProgress } from "../types";

function stateTone(state?: string) {
  if (["blocked", "failed"].includes(state || "")) return "bad";
  if (state === "waiting-for-human") return "act";
  if (state?.includes("stale")) return "warn";
  if (state === "waiting-on-external-system") return "wait";
  if (state === "working") return "good";
  if (state === "complete") return "done";
  return "quiet";
}

function stateLabel(state?: string) {
  return (state || "recorded").replaceAll("-", " ");
}

export function WorkCard({ project, item }: { project: string; item: ObservedProgress }) {
  const { project: contextProject } = useLiveRelay();
  const title = item.goal || item.assignment.replace(/[-_]+/g, " ");
  const detail = item.waiting_reason || item.recovery_action || item.latest_event?.type?.replaceAll("-", " ") || "No newer execution evidence.";
  const percent = item.state === "complete" ? 100 : undefined;
  const phase = item.state === "complete" ? "delivery" : (item.stage || "in progress").replaceAll("-", " ");
  return (
    <article className="progress-row work-card" data-tone={stateTone(item.state)}>
      <div className="work-card-main">
        <div className="work-card-copy">
          <div className="work-card-meta">
            <StatusLight tone={stateTone(item.state)} label={stateLabel(item.state)} />
            {item.primary_staff && <span>{item.primary_staff}</span>}
          </div>
          <h2>{title}</h2>
          <p>{detail}</p>
          {item.next_action && <div className="next-step"><span>next</span><strong>{item.next_action}</strong></div>}
          <div className="work-card-bottom">
            <ActivitySparkline events={item.events} />
            <Link className="text-action" to={projectHref(`/runner/${encodeURIComponent(project)}/${encodeURIComponent(item.assignment)}`, contextProject)}>view live progress</Link>
          </div>
        </div>
        <ProgressRing percent={percent} label={phase} />
      </div>
      <details>
        <summary>technical details</summary>
        <div className="technical-grid">
          <code>{item.assignment}</code>
          {item.identities?.branch && <code>branch · {item.identities.branch}</code>}
          {item.identities?.pr && <code>PR · {item.identities.pr}</code>}
          {item.identities?.head_sha && <code>head · {item.identities.head_sha.slice(0, 10)}</code>}
        </div>
      </details>
    </article>
  );
}
