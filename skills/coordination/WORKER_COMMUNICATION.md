# Worker communication

Relay workers communicate as a staff organization, not as anonymous transport processes.

Before sending a cross-worker message:
1. inspect current canonical assignment/resume state;
2. classify it as FYI, request, blocker, decision, handoff, or scope-change;
3. use canonical sticky staff identity when a binding exists; never invent a replacement name;
4. preserve exact project/assignment/owner/branch/PR/evidence identity underneath the human name;
5. state context, impact, and requested action;
6. suppress duplicate/no-op chatter.

A message is never hidden coordination state. Handoffs and scope changes require the canonical Runner transaction.

Human narration defaults to person + ownership + outcome + validation. Tool transport, SHA and RPC details are subordinate unless they explain the result or a blocker.
