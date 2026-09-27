# current state

## verified

- deployed inspector gateway: `https://inspector.loew.fi/mcp`
- gateway version deployed: `0.3.1`
- public health route works
- Cloudflare Managed OAuth is configured
- Cloudflare service-token authentication works locally
- downstream auth model is linked-app token forwarding
- `fetch_loew_url` is read-only and bounded to loew.fi HTTPS targets
- GitHub Actions run [36296247963](https://github.com/lrnolivia/loew-inspector/actions/runs/36296247963) succeeded with inspector HTTP 200 and a `LOEW_INSPECTOR_RESULT` showing target HTTP 200, JSON, and a runner API body
- A [normal ChatGPT conversation](https://chatgpt.com/c/6ab8a4b4-a6ac-83ea-8926-2c52fb6d36e3) used its connected Composio GitHub action to dispatch [run 36296334657](https://github.com/lrnolivia/loew-inspector/actions/runs/36296334657), read the log, and report target HTTP 200, JSON, and a runner worker object in the body. This is direct evidence on the normal-chat surface, rather than Codex-only reachability.

## compatibility bridge

`.github/workflows/inspect.yml` exists solely to let normal ChatGPT reach the canonical inspector through Composio -> GitHub Actions. It calls the Access-protected `workers.dev` hostname of the same deployed Worker, using the `loew-inspector-github-bridge` service token.

Cloudflare Access app `e03969b6-ecb4-40d5-b66d-c11ac91ce7a1` protects the workers.dev hostname. Its Service Auth policy `aea892bf-12c7-4b8a-85bd-87568aa17350` allows that token. Linked-app policy `eb0289df-8d22-4b09-aa21-3a656bd80fff` permits the authenticated inspector to read protected loew.fi targets. No broad Access bypass was added.

Ray `a417e7cabccd2546` on `/mcp` was a Bot Fight Mode managed challenge. After moving ingress to workers.dev, the same zone feature challenged the downstream runner request. Cloudflare Free-plan Bot Fight Mode has no path-specific skip, so it was turned off zone-wide. Browser Integrity Check, Security Level Medium, managed rules, and Access are still enabled.

It does not replace MCP.

## QA decision

Preview remains runtime truth.

Inspector QA is external verification only. Add checks only where they provide evidence Preview cannot provide by itself, such as Access reachability, status/final URL, origin-vs-Access failure classification, content markers, or later DOM/screenshot parity evidence.
