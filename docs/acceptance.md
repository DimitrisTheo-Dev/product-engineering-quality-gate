# v1 acceptance criteria

The implementation is complete only when these have observable evidence:

1. The reusable workflow parses with actionlint, embeds the tested runner exactly, and runs on GitHub.
2. Project-local, exact-version Oxfmt and Oxlint run without downloading fallback executables. Formatting errors and lint warnings fail the gate.
3. Missing typecheck/build scripts, lockfiles, enabled tools, and explicitly selected tests fail with an actionable report.
4. Tests run when configured; absent optional checks appear as NOT CONFIGURED. Disabled deep checks appear as SKIPPED.
5. A failed check survives summary/artifact steps and produces a failed job. Local failure injection and an isolated remote failure run demonstrate this.
6. React/TS and Node/TS fixtures can be onboarded, installed, and gated. Dry run changes no target files; a second apply changes no files. Existing scripts, CI, and source survive.
7. Synthetic document-Q&A tests exercise grounding, abstention, citation validation, stale responses, and recoverable failure without a provider.
8. PR jobs have contents:read, ephemeral hosted runners, no provider secrets, no persisted checkout credentials, no pull_request_target, no writable dependency cache, and time limits.
9. Advanced checks are explicit; project behavior stays in consumer scripts. Live-provider work is manual, trusted-branch only, bounded, and disabled by default.
10. A concise Codex skill, configuration reference, rollout/rollback instructions, sources, and actual release/verification records exist.

Scope: npm, pnpm, and Yarn with node_modules on Linux hosted runners; Node/React JS/TS first. Bun and Yarn PnP are detected and require manual migration or a future adapter. No automatic enrollment, commits, pushes, or branch-policy changes in consumer repositories.
