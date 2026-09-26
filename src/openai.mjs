const API = "https://api.openai.com/v1";

function headers() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
  return {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
    "OpenAI-Beta": "agents=v1"
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { ...headers(), ...(options.headers ?? {}) }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`OpenAI ${response.status}: ${JSON.stringify(data).slice(0, 1000)}`);
  }
  return data;
}

function agentConfig(config) {
  return {
    model: config.model.id,
    reasoning: { effort: config.model.reasoning_effort },
    instructions: [
      "You are an external continuity runner for a user-managed project.",
      "You are not a ChatGPT PJM, Master, or first-class Worker.",
      "Obey the supplied target write mode. read_only means never claim to have changed the target repository.",
      "Prefer concrete new findings over repeated summaries.",
      "Distinguish observed repository facts, inference, and proposals.",
      "End with headings: Findings, Risks, Next focus, Status.",
      "Status must be one of CONTINUE, BLOCKED, COMPLETE."
    ].join("\n"),
    tools: config.model.web_search
      ? [{ type: "web_search", mode: "live", context_size: "medium" }]
      : []
  };
}

export async function createSession(config, input) {
  return request("/agents/sessions", {
    method: "POST",
    body: JSON.stringify({
      agent: agentConfig(config),
      environment: { type: "none" },
      input,
      stream: false,
      metadata: { runner_worker: config.id }
    })
  });
}

export async function getSession(sessionId) {
  return request(`/agents/sessions/${encodeURIComponent(sessionId)}`, { method: "GET" });
}

export async function sendMessage(sessionId, text, idempotencyKey = null) {
  return request(`/agents/sessions/${encodeURIComponent(sessionId)}/events`, {
    method: "POST",
    body: JSON.stringify({
      events: [
        {
          type: "agent.session.input.message",
          input: [
            {
              role: "user",
              content: [{ type: "input_text", text }]
            }
          ]
        }
      ],
      ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {})
    })
  });
}

export async function listTurns(sessionId) {
  return request(
    `/agents/sessions/${encodeURIComponent(sessionId)}/turns?order=desc&limit=20`,
    { method: "GET" }
  );
}

export function latestRootTurn(page) {
  const turns = page.data ?? page.items ?? [];
  return turns.find((turn) => turn.subagent_id == null) ?? null;
}

export async function listItems(sessionId) {
  return request(
    `/agents/sessions/${encodeURIComponent(sessionId)}/items?order=desc&limit=50`,
    { method: "GET" }
  );
}

export function latestAssistantText(page) {
  const items = page.data ?? page.items ?? [];
  for (const item of items) {
    if (item.role !== "assistant") continue;
    const pieces = [];
    for (const part of item.content ?? []) {
      if (typeof part.text === "string") pieces.push(part.text);
      else if (part.type === "output_text" && typeof part.text === "string") pieces.push(part.text);
    }
    if (pieces.length) return { id: item.id, text: pieces.join("\n") };
  }
  return null;
}
