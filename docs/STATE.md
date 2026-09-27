# current state

## verified

- deployed inspector gateway: `https://inspector.loew.fi/mcp`
- gateway version observed live: `0.3.0`
- public health route works
- Cloudflare Managed OAuth is configured
- Cloudflare service-token authentication works locally
- downstream auth model is linked-app token forwarding
- `fetch_loew_url` is read-only and bounded to loew.fi HTTPS targets
- normal ChatGPT private-MCP reachability remains the client-side gap on the user's current plan

## compatibility bridge

`.github/workflows/inspect.yml` exists solely to let normal ChatGPT reach the canonical inspector through Composio -> GitHub Actions.

It does not replace MCP.

## QA decision

Preview remains runtime truth.

Inspector QA is external verification only. Add checks only where they provide evidence Preview cannot provide by itself, such as Access reachability, status/final URL, origin-vs-Access failure classification, content markers, or later DOM/screenshot parity evidence.
