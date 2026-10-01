// Exact user-supplied Relay feature PNG assets.
// The base64 payloads decode byte-for-byte to the uploaded 1024×1024 PNGs.
const png = value => "data:image/png;base64," + value;

const relayBase64 = "__RELAY__";
const todayBase64 = "__TODAY__";
const runnerBase64 = "__RUNNER__";
const inspectorBase64 = "__INSPECTOR__";
const nightShiftBase64 = "__NIGHT_SHIFT__";

export const finalIcons = Object.freeze({
  relay: png(relayBase64),
  today: png(todayBase64),
  runner: png(runnerBase64),
  inspector: png(inspectorBase64),
  "night-shift": png(nightShiftBase64)
});

export const finalIconSha256 = Object.freeze({
  relay: "8c417f466c3e08b1f0fe54674b5e07a0adfc1f8aceebeab4670dbe4b0805b744",
  today: "4dee06a2da34d3d776a9b111e3206cf7d439d71c04f0210454995ba540093cca",
  runner: "cacd4cd088ddd8426bc71cb7cf8b1be4334f42c2fd9377db465b4c37b3a486b7",
  inspector: "8bc9ee750036a611e71aa9cdd22856eda242f0ac5e31a39d1a3f4bb57638155f",
  "night-shift": "aeaba257b09b266a3cbc0bf239bbc5bae9253057279fa06b462ccc354d719028"
});
