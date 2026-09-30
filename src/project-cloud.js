import { githubApiRequest } from "./source.js";
import { cloudWriteScripts, deployCloudVersion } from "./cloud.js";

const PROJECT = /^[a-z0-9-]{1,80}$/;
const decode = content => Buffer.from(String(content || "").replace(/\s/g, ""), "base64").toString("utf8");

function validateRegistration(value, project) {
  if (!value || value.id !== project || value.managed !== true) throw new Error("Invalid managed project registration");
  const cloud = value.cloud;
  if (!cloud) return null;
  if (cloud.provider !== "cloudflare" || typeof cloud.worker !== "string" || !/^[A-Za-z0-9_][A-Za-z0-9_-]{0,127}$/.test(cloud.worker) || typeof cloud.write !== "boolean") {
    throw new Error("Invalid project Cloud registration");
  }
  return cloud;
}

export async function projectCloudStatus(env, project, apiOverride) {
  if (!PROJECT.test(project || "")) throw new Error("Invalid project");
  const api = apiOverride || ((path, options) => githubApiRequest(env, path, options));
  const controlRepository = String(env?.RELAY_RUNNER_CONTROL_REPOSITORY || "lrnolivia/relay");
  const file = await api(`/repos/${controlRepository}/contents/projects/${project}.json?ref=main`);
  if (file?.type !== "file" || file.encoding !== "base64" || file.truncated) throw new Error("Project registration is incomplete");
  const registration = JSON.parse(decode(file.content));
  const cloud = validateRegistration(registration, project);
  const runtimeAllowed = Boolean(cloud?.worker && cloudWriteScripts(env).includes(cloud.worker));
  return {
    ok: true,
    namespace: "relay.CLOUD",
    project,
    repository: registration.repository,
    provider: cloud?.provider || null,
    worker: cloud?.worker || null,
    project_write: cloud?.write === true,
    runtime_allowlisted: runtimeAllowed,
    writable: Boolean(cloud?.write === true && runtimeAllowed),
    authorization: "project-registration+runtime-allowlist"
  };
}

export async function deployProjectCloudVersion(env, project, versionId, message, deps = {}) {
  const status = await projectCloudStatus(env, project, deps.github);
  if (!status.worker) throw new Error(`Project ${project} has no Cloudflare Worker registration`);
  if (!status.project_write) throw new Error(`Project ${project} does not authorize Cloud writes`);
  if (!status.runtime_allowlisted) throw new Error(`Project ${project} Worker is not in Relay's runtime write allowlist`);
  const deploy = deps.deploy || ((worker, version, note) => deployCloudVersion(env, worker, version, note));
  const result = await deploy(status.worker, versionId, message);
  return { ...result, project, authorization: status.authorization };
}
