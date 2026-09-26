import { buildContext, renderContext } from "./context.mjs";
import { createSession, getSession, latestAssistantText, listItems, sendMessage } from "./openai.mjs";
import { appendReport, isDue, loadState, nextRunFrom, saveState } from "./state.mjs";

function reportBlock(output) {
  return `## ${new Date().toISOString()}\n\n${output.text}`;
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
    const output = latestAssistantText(await listItems(state.session_id));
    if (output && output.id !== state.last_output_id) {
      state.last_output_id = output.id;
      state.last_summary = output.text.slice(0, 1200);
      await appendReport(config.id, reportBlock(output));
      if (/\bCOMPLETE\b/i.test(output.text)) state.status = "complete";
      else if (/\bBLOCKED\b/i.test(output.text)) state.status = "blocked";
      else state.status = "idle";
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
      await sendMessage(state.session_id, prompt);
    }

    state.status = "running";
    state.run_count += 1;
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
