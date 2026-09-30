import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAllWorkers, loadWorker, saveWorker } from "./config.mjs";
import { runWorker } from "./runner.mjs";
import { loadState } from "./state.mjs";
import { dispatchWorkflow } from "./github.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD = path.join(HERE, "..", "dashboard");
const PORT = Number(process.env.PORT ?? 4242);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml"
};

async function json(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

async function workersView() {
  const configs = await loadAllWorkers();
  return Promise.all(configs.map(async (config) => ({
    ...config,
    runtime: await loadState(config.id)
  })));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (req.method === "GET" && url.pathname === "/api/workers") {
      return json(res, 200, await workersView());
    }

    const toggle = url.pathname.match(/^\/api\/workers\/([^/]+)\/toggle$/);
    if (req.method === "POST" && toggle) {
      const config = await loadWorker(toggle[1]);
      const body = await readBody(req);
      config.enabled = typeof body.enabled === "boolean" ? body.enabled : !config.enabled;
      await saveWorker(config);
      return json(res, 200, { ok: true, enabled: config.enabled });
    }

    const run = url.pathname.match(/^\/api\/workers\/([^/]+)\/run$/);
    if (req.method === "POST" && run) {
      const config = await loadWorker(run[1]);
      if (!config.enabled) return json(res, 409, { error: "Enable this worker before running it." });
      return json(res, 200, await runWorker(config, { force: true }));
    }


    const doctor = url.pathname.match(/^\/api\/workers\/([^/]+)\/doctor$/);
    if (req.method === "POST" && doctor) {
      if (doctor[1] !== "field") {
        return json(res, 404, { error: "No dependency doctor is configured for this worker yet." });
      }
      return json(
        res,
        202,
        await dispatchWorkflow("lrnolivia/loew-runner", "field-dependency-doctor.yml")
      );
    }

    const repair = url.pathname.match(/^\/api\/workers\/([^/]+)\/repair$/);
    if (req.method === "POST" && repair) {
      if (repair[1] !== "field") {
        return json(res, 404, { error: "No dependency repair workflow is configured for this worker yet." });
      }
      const state = await loadState(repair[1]);
      if (state.dependency_health !== "repairable" || state.dependency?.repair_verified !== true) {
        return json(res, 409, {
          error: "Repair unlocks only after Dependency Doctor verifies a package-lock repair through clean install and build."
        });
      }
      return json(
        res,
        202,
        await dispatchWorkflow("lrnolivia/loew-runner", "field-dependency-repair.yml")
      );
    }

    const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const safe = path.normalize(relative).replace(/^(\.\.(\/|\\|$))+/, "");
    const file = path.join(DASHBOARD, safe);
    if (!file.startsWith(DASHBOARD)) return json(res, 403, { error: "Forbidden" });

    try {
      const body = await fs.readFile(file);
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      json(res, 404, { error: "Not found" });
    }
  } catch (error) {
    json(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`loew-runner dashboard: http://localhost:${PORT}`);
});
