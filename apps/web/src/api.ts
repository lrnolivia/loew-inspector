import type { DashboardSnapshot, ProgressPayload, ProjectRegistration, RunnerWorker } from "./types";

async function json<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Relay returned ${response.status} for ${path}`);
  return response.json() as Promise<T>;
}

export async function loadDashboard(): Promise<DashboardSnapshot> {
  const [{ projects }, workers] = await Promise.all([
    json<{ projects: ProjectRegistration[] }>("/api/projects"),
    json<RunnerWorker[]>("/api/workers")
  ]);
  const pairs = await Promise.all(projects.map(async project => {
    try {
      return [project.id, await json<ProgressPayload>(`/api/progress/${encodeURIComponent(project.id)}`)] as const;
    } catch {
      return [project.id, { project: project.id, observed_progress: false, progress: [], queue: [] } satisfies ProgressPayload] as const;
    }
  }));
  return {
    fetchedAt: new Date().toISOString(),
    projects,
    progress: Object.fromEntries(pairs),
    workers
  };
}

export async function loadAssignment(project: string, assignment: string): Promise<ProgressPayload> {
  return json<ProgressPayload>(`/api/progress/${encodeURIComponent(project)}?assignment=${encodeURIComponent(assignment)}`);
}

export function projectLabel(project: ProjectRegistration | string): string {
  const raw = typeof project === "string" ? project : project.name || project.id;
  const id = typeof project === "string" ? project : project.id;
  const known: Record<string, string> = {
    relay: "relay",
    field: "field",
    loewfi: "loew.fi",
    rtxforge: "rtxForge",
    "bazzite-custom": "loewOS",
    gamebridge: "GameBridge"
  };
  return known[id] || raw.replace(/[-_]+/g, " ");
}
