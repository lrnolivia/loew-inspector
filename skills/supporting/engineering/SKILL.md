---
name: relay-engineering
description: Relay engineering guidance for build implementation frontend architecture.
---

# engineering

Read current entrypoints, boundaries and tests before changing code. Extend existing architecture. Declare ownership and affected paths, preserve user changes, and make one coherent reversible patch. Validate behavior through the smallest meaningful tests, then required build/type gates. Report exact source identity and separately state runtime evidence. Avoid adding dependencies without a concrete need. Treat request cancellation, stale async responses, error recovery and data persistence as correctness requirements.
