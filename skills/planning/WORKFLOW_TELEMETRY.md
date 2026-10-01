# Workflow-time telemetry

Relay derives workflow timing from canonical events/checkpoints rather than worker-authored timesheets.

Classify time into active execution, external wait, recoverable stall/retry, blocked authority/client/scope wait, human intervention, and verification/deploy. Aggregate by task class, capability/skill, tool family, failure/recovery reason and workflow phase.

Staff identity may be used as a filter when debugging one workflow, but Relay never emits staff productivity scores or rankings.

Recurring bottlenecks become planning finding candidates only after evidence repeats. External wait findings should target caching/concurrency/provider behavior; recoverable stalls should feed validated recovery lessons; blocked time should surface explicit authority/client/scope repair.
