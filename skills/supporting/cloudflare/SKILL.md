---
name: relay-cloudflare
description: Relay cloudflare guidance for cloudflare workers build deployment evidence.
---

# cloudflare

Resolve the canonical project-to-Worker mapping and runtime allowlist before any deployment. Prefer GitHub Workers Builds for registered web projects. Inspect build, version and traffic deployment separately, then verify runtime source identity and protected behavior. Preserve Access audience/policies, service bindings and secrets. Use R2 conditional writes with bounded pagination for evidence and receipts. Report rate limits and unavailable entitlements as environment state; never conceal them as application failures.
