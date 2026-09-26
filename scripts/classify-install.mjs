import fs from "node:fs/promises";

export function classifyInstallLog(text) {
  const rules = [
    ["lockfile", /npm ci can only install|package\.json.*package-lock|lock file.*out of date|EUSAGE/i],
    ["peer-dependency", /ERESOLVE|peer dep|peer dependency/i],
    ["node-version", /EBADENGINE|unsupported engine|wanted.*node|requires node/i],
    ["native-build", /node-gyp|gyp ERR|prebuild-install|make:.*Error|CXX\(/i],
    ["registry-network", /ETIMEDOUT|ECONNRESET|EAI_AGAIN|ENETUNREACH|registry\.npmjs\.org.*5\d\d/i],
    ["permissions", /EACCES|EPERM|permission denied/i],
    ["missing-package", /E404|not found.*registry|No matching version found/i]
  ];

  for (const [kind, pattern] of rules) {
    if (pattern.test(text)) return kind;
  }
  return "unclassified";
}

if (process.argv[1]?.endsWith("classify-install.mjs") && process.argv[2]) {
  const text = await fs.readFile(process.argv[2], "utf8");
  const kind = classifyInstallLog(text);
  process.stdout.write([
    "# Dependency Doctor",
    "",
    `**Classification:** ${kind}`,
    "",
    "The complete install log is attached to the workflow run."
  ].join("\n"));
}
