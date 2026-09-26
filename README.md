# loew-runner

A small, durable control surface for background research and project work.

`loew-runner` exists because ordinary ChatGPT scheduled tasks are intentionally limited. It does **not** try to replace the normal ChatGPT Project chats that remain the user-facing place to plan, steer, and review work.

Instead, it provides a separate execution layer:

```text
normal ChatGPT / Project chats
            │
            │ steer + review
            ▼
       GitHub project truth
            ▲
            │
      loew-runner scheduler
            │
            ▼
      OpenAI Agents API
```

The first pilot is **field**.

## Design goals

- one scheduler can manage many jobs
- durable OpenAI agent session per job
- GitHub is durable project state
- jobs are disabled by default
- no surprise API spending
- read-only target access first
- clear stop / blocked states
- no hidden dependency on one ChatGPT conversation
- compact, pleasant dashboard
- zero runtime npm dependencies in loew-runner itself

That last point is intentional: the tool that diagnoses dependency failures should still run when dependency installation is the thing that is broken.

## Current status

**v0.1 foundation**

Included:

- zero-dependency Node 22 runner core
- JSON worker registry
- persisted session state
- OpenAI Agents API session creation / continuation
- GitHub context ingestion
- hosted web search support
- hourly GitHub Actions scheduler
- local dashboard
- field pilot configuration
- dependency doctor workflow for field
- dependency failure classifier
- CI for loew-runner itself

The field agent is committed **disabled by default**. Add the OpenAI API secret and explicitly enable it before it can spend API credits.

## Quick start

Clone the repository and run:

```bash
npm run dashboard
```

There is no `npm install` step. The project uses only Node built-ins.

Open:

```text
http://localhost:4242
```

Run static checks and tests:

```bash
npm run check
npm test
```

Run one scheduler tick:

```bash
npm run tick
```

Run one worker regardless of cadence:

```bash
npm run run -- field
```

## Required secret

For live agent work, add this GitHub Actions repository secret:

```text
OPENAI_API_KEY
```

The key needs the permissions required by the OpenAI Agents API, including agent session read/write and model inference.

The field pilot reads a public GitHub repository, so it does not require a cross-repository GitHub token.

For future private target repositories, add:

```text
RUNNER_GITHUB_TOKEN
```

as a fine-grained token with the minimum required read access.

## Workers

Workers live in:

```text
workers/
```

Example:

```json
{
  "id": "field",
  "name": "field",
  "enabled": false,
  "cadence_minutes": 60,
  "model": {
    "id": "gpt-6-sol",
    "reasoning_effort": "medium",
    "web_search": true
  },
  "target": {
    "repository": "lrnolivia/field",
    "branch": "main",
    "write_mode": "read_only"
  }
}
```

v0.1 deliberately permits only `read_only` target mode.

Each worker has durable state in `state/<id>.json` including its OpenAI session ID. Reports accumulate in `reports/<id>.md`.

## Scheduling

`.github/workflows/runner.yml` wakes the scheduler once per hour.

The workflow itself does not mean every worker runs every hour. Each worker has its own cadence and the scheduler decides whether it is due.

When state or reports change, the workflow commits them back to this repository so a later run can continue from the same session.

## Dashboard

The dashboard is intentionally small.

It shows:

- enabled / paused
- idle / running / blocked / complete
- cadence
- target repository
- model
- last run
- next run
- latest summary
- next focus
- dependency health

The local backend allows enabling and pausing workers. A hosted control backend is the next deployment step; secrets are never placed in browser JavaScript.

## Dependency Doctor

Dependency failures from ephemeral chat environments are difficult to interpret because the failure may belong to the environment rather than the repository.

The Dependency Doctor gives us a clean-room answer.

For the field pilot:

```text
GitHub-hosted Ubuntu runner
        ↓
Node 22
        ↓
npm ci
        ↓
build
        ↓
tests
        ↓
lint
        ↓
classified report + logs
```

Run it manually from **Actions → field dependency doctor → Run workflow**.

A clean install passing in Actions means a failure in a chat/container is probably environment-specific. A failure in Actions means the repository or lockfile genuinely needs attention.

The doctor does not auto-rewrite dependencies in v0.1. Automatic repair should happen on a branch/PR after the diagnostic path proves reliable.

## Safety

- target repositories are read-only in v0.1
- the field agent starts disabled
- no OpenAI call occurs without `OPENAI_API_KEY`
- session state is explicit and inspectable
- blocked and failed sessions stop instead of looping
- the runner does not call itself a PJM, Master, or first-class Worker
- no target repository is modified by the scheduler

## Planned next steps

1. validate the field dependency doctor on GitHub-hosted infrastructure
2. add `OPENAI_API_KEY`
3. enable field for one controlled agent cycle
4. verify session continuation on the next scheduled cycle
5. deploy the dashboard/control API
6. add guarded repair-PR mode for dependency failures
7. add event-driven wakeups in addition to schedules
8. add budgets and per-worker run limits
