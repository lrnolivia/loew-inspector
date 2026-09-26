import { buildContext, renderContext } from "./context.mjs";
import { createSession, getSession, latestAssistantText, latestRootTurn, listItems, listTurns, parseRunnerStatus, sendMessage } from "./openai.mjs";
import { appendReport, isDue, loadState, nextRunFrom, saveState } from "./state.mjs";

function reportBlock(output) {
  return `## ${new Date().toISOString()}\n\n${output.text}`;
}

function localDay(config, now = new Date()) {
  const timezone = config.timezone ?? "UTC";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function budgetState(config, state, now = new Date()) {
  const day = localDay(config, now);
  const budget = state.budget ?? {
    day,
    runs: 0,
    tokens: 0,
    last_accounted_turn_id: null
  };
  if (budget.day !== day) {
    budget.day = day;
    budget.runs = 0;
    budget.tokens = 0;
    budget.last_accounted_turn_id = null;
  }
  state.budget = budget;
  return budget;
}

function budgetBlockReason(config, state) {
  const budget = budgetState(config, state);
  const maxRuns = config.limits?.max_runs_per_day;
  const maxTokens = config.limits?.max_tokens_per_day;
  if (maxRuns != null && budget.runs >= maxRuns) {
    return `Daily run budget reached (${budget.runs}/${maxRuns}).`;
  }
  if (maxTokens != null && budget.tokens >= maxTokens) {
    return `Daily token budget reached (${budget.tokens}/${maxTokens}).`;
  }
  return null;
}

async function harvest(config, state) {
  if (!state.session_id) return state;

  const session = await getSession(state.session_id);
  state.last_usage = session.usage ?? state.last_usage;

  if (session.status === "failed") {
    state.status = "blocked";
    state.last_error = session.error ?? "Agents API session failed";
    await saveState(state);
    return state;
  }

  if (session.status === "requires_action") {
    state.status = "blocked";
    state.last_error = "Session requires an action the v0.1 runner does not handle yet.";
    await saveState(state);
    return state;
  }

  if (session.status === "in_progress") {
    state.status = "running";
    await saveState(state);
    return state;
  }

  if (session.status === "idle") {
    const turn = latestRootTurn(await listTurns(state.session_id));

    if (!turn) {
      state.status = "idle";
      await saveState(state);
      return state;
    }

    state.last_turn_id = turn.id;
    state.last_usage = turn.usage ?? session.usage ?? state.last_usage;

    const budget = budgetState(config, state);
    if (turn.status === "completed" && budget.last_accounted_turn_id !== turn.id) {
      budget.tokens += Number(turn.usage?.total_tokens ?? 0);
      budget.last_accounted_turn_id = turn.id;
    }

    if (turn.status === "failed") {
      state.status = "blocked";
      state.last_error = turn.error?.message ?? turn.error ?? "Agents API turn failed";
      await saveState(state);
      return state;
    }

    if (turn.status === "cancelled") {
      state.status = "blocked";
      state.last_error = "Agents API turn was cancelled.";
      await saveState(state);
      return state;
    }

    if (["queued", "in_progress", "waiting"].includes(turn.status)) {
      state.status = "running";
      await saveState(state);
      return state;
    }

    if (turn.status !== "completed") {
      state.status = "blocked";
      state.last_error = `Unknown Agents API turn status: ${turn.status}`;
      await saveState(state);
      return state;
    }

    const output = latestAssistantText(await listItems(state.session_id));
    if (output && output.id !== state.last_output_id) {
      state.last_output_id = output.id;
      state.last_summary = output.text.slice(0, 1200);
      state.last_error = null;
      await appendReport(config.id, reportBlock(output));
      const declaredStatus = parseRunnerStatus(output.text);
      if (declaredStatus === "COMPLETE") state.status = "complete";
      else if (declaredStatus === "BLOCKED") state.status = "blocked";
      else if (declaredStatus === "CONTINUE") state.status = "idle";
      else {
        state.status = "blocked";
        state.last_error = "Agent output omitted the required final Status line.";
      }
    } else {
      state.status = "idle";
    }
    await saveState(state);
  }

  return state;
}

export async function runWorker(config, { force = false } = {}) {
  let state = await loadState(config.id);
  state = await harvest(config, state);

  if (!force && !isDue(config, state)) return state;
  if (["running", "blocked", "complete"].includes(state.status)) return state;

  const budgetReason = budgetBlockReason(config, state);
  if (budgetReason) {
    state.status = "blocked";
    state.last_error = budgetReason;
    await saveState(state);
    return state;
  }

  const packet = await buildContext(config);
  const context = renderContext(packet);
  const now = Date.now();
  const prompt = [
    `# Worker: ${config.name}`,
    `Target: ${config.target.repository}@${config.target.branch}`,
    `Write mode: ${config.target.write_mode}`,
    "",
    "## Goal",
    config.goal,
    "",
    "## Current repository context",
    context,
    "",
    state.session_id
      ? "Continue the existing investigation. Focus on what is unresolved or newly changed since the previous cycle."
      : "Begin with a bounded first cycle. Establish useful current-state findings without trying to solve the entire project at once."
  ].join("\n");

  try {
    if (!state.session_id) {
      const session = await createSession(config, prompt);
      state.session_id = session.id;
      state.last_usage = session.usage ?? null;
    } else {
      const idempotencyKey = [
        "loew-runner",
        config.id,
        state.run_count + 1,
        state.last_run_at ?? "initial"
      ].join(":");
      await sendMessage(state.session_id, prompt, idempotencyKey);
    }

    state.status = "running";
    state.run_count += 1;
    budgetState(config, state).runs += 1;
    state.last_run_at = new Date(now).toISOString();
    state.next_run_at = nextRunFrom(now, config.cadence_minutes);
    state.last_error = null;
  } catch (error) {
    state.status = "blocked";
    state.last_error = error.message;
  }

  await saveState(state);
  return state;
}
