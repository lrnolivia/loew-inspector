# Relay 1.9.6.2 — operational staff routing and conversational cards

Assignment: `relay-1.9.6.2-operational-staff-routing-20261001`
Owner: `relay-1.9-wrapup-20261001`
Umbrella: `relay-1.9-skills-runtime-creative-20260930`

Runner persists canonical `primary_staff` and `supporting_staff` directory IDs on queue/claim/amend. New assignments resolve active staff deterministically from role/category; reserve identities require explicit selection; retired/unknown identities, duplicate teams and incompatible declared roles are rejected. Claim inherits the queued team. Explicit null/empty bindings are allowed. Reads preserve legacy unbound records, and amendments audit any newly resolved bindings. Handoffs keep the team while changing the machine owner through existing Runner authority.

Resume/checkpoint hashes, amendment windows, progress, worker messages and executive presentation carry the team. Canonical machine IDs, CAS, ownership, scope, branch/base identity, leases and exact-head gates remain authoritative. Staff metadata grants no access and is never a productivity score.

Normal conversational tools select `ui://relay/context-card/v2.html`. This compact resource renders staff, progress, blockers, connected handoffs, QA and next actions. Exact evidence is subordinate in an expandable panel. The explicit Open Relay action opens the full dashboard. The resource supports ChatGPT globals and MCP Apps initialization/tool-result notifications, binds elements explicitly to avoid browser API collisions, and displays connection/error uncertainty without manufacturing success.

Validation and deployment receipts will be appended before completion. The 1.9 umbrella remains open until successor creative/platform/performance/integration work is accounted for and fresh-consumer verification passes.
