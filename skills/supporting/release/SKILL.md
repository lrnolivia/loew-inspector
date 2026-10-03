---
name: relay-release
description: Relay release guidance for release deployment rollback.
---

# release

Resolve project registration, live ownership, branch head and required checks. Publish through the registered Git-native release path with an exact-head gate. Do not use an upload route to bypass policy. Record the previous production version for rollback. After deployment verify the actual source/build identity and a behavior affected by the change; a green build alone is insufficient. Keep secrets and protections unchanged. Treat an uncertain write as a readback task before retrying.
