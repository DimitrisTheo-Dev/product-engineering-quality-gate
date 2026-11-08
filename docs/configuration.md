# Configuration reference

Invoke `.github/workflows/quality-gate.yml` at a full release commit SHA. The generated caller supplies read-only permissions, PR/main triggers, and cancellation of obsolete runs. The workflow has no declared secrets. Do not add `secrets: inherit`.

| Input                        | Default          | Behavior                                                                                                                                              |
| ---------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node-version`               | `24.22.2`        | Runtime supplied to SHA-pinned setup-node. Prefer an exact supported version.                                                                         |
| `working-directory`          | `.`              | Relative package directory; must remain inside checkout, including symlinks. Root owns lockfile/install.                                              |
| `typecheck-script`           | `typecheck`      | Required package script; empty or missing fails.                                                                                                      |
| `build-script`               | `build`          | Required package script; empty or missing fails.                                                                                                      |
| `test-script`                | `auto`           | Chooses `test:ci` then `test`. Absent tests are NOT CONFIGURED; an explicitly selected missing script fails. Empty explicitly disables this check.    |
| `extra-script`               | empty            | Additional existing lint/CI setup script. Selected scripts must exist and pass. Onboarding retains an existing `lint` here.                           |
| `product-script`             | empty            | Consumer behavior tests, e.g. `test:product`; runs in fast gate when selected.                                                                        |
| `smoke-script`               | empty            | Fast consumer smoke tests; runs when selected.                                                                                                        |
| `react-doctor`               | `false`          | Run React Doctor only in a package declaring React. Missing local exact-version dependency fails.                                                     |
| `fallow`                     | `false`          | Enable dead code, duplication, complexity, architecture; runs only with `deep: true`.                                                                 |
| `e2e-script`                 | empty            | Runs only with `deep: true`.                                                                                                                          |
| `security-script`            | empty            | Consumer dependency/security command; runs only with `deep: true`.                                                                                    |
| `deep`                       | `false`          | Enables configured Fallow, E2E, and dependency/security checks.                                                                                       |
| `playwright`                 | `false`          | Installs Chromium with system dependencies from local pinned `@playwright/test` when selected browser tests will run.                                 |
| `upload-playwright-failures` | `false`          | On failure upload `test-results/` and `playwright-report/` in the package directory; three-day retention. Opt in only after reviewing their contents. |
| `check-timeout-seconds`      | `300`            | Per-command timeout, integer 1..1200; Unix child process groups are stopped. Job limit is 30 minutes.                                                 |
| `report-name`                | `quality-report` | Unique artifact name, seven-day retention. Set distinct names for matrix entries or multiple calls in a run.                                          |

Formatting and linting always run directly against local pinned tools:

```text
oxfmt --check
oxlint --deny-warnings --ignore-pattern **/node_modules/**
```

Existing Oxfmt/Oxlint configs are discovered normally. Node_modules are excluded explicitly from Oxlint. Generated output should be excluded in the consumer's own config. This workflow does not migrate ESLint/Prettier/Biome rules; keep existing CI and use `extra-script` for additional checks.

React Doctor runs `react-doctor . --yes --no-score --no-supply-chain --blocking error`. Errors block; warnings remain visible. Scoring/telemetry and separate supply-chain checks are disabled by these flags. Review its [license](../THIRD_PARTY_NOTICES.md).

Fallow runs each of `dead-code`, `dupes`, `health`, and `architecture` with `--fail-on-issues`. Dead-code, health, and architecture also use `--fail-on-parse-error`; the pinned dupes subcommand rejects that flag. Those graph-based checks supply the parse-error gate in a full deep run. Configure meaningful entry points, ignores, baselines, and boundaries in the consumer first. Thresholds are the tool's configured defaults; v1 does not invent an architecture policy or suppress existing findings. A configured deep check is SKIPPED in a shallow run.

## Reporting model

`.quality-gate/report.json` has `schemaVersion: 1`, a boolean `passed`, and `checks[]` with `name`, `status`, `required`, `detail`, and optional elapsed `seconds`. `summary.md` uses the same rows. In this model `required` means required **for this invocation**. Artifact links are added to the GitHub job summary after upload.

| Status         | Meaning                                            | Example                                                            |
| -------------- | -------------------------------------------------- | ------------------------------------------------------------------ |
| PASS           | An executed command exited zero                    | Build completed; examine logs for coverage of that build.          |
| FAIL           | Command or prerequisite failed                     | Missing typecheck script; fix script/input and rerun.              |
| SKIPPED        | Deferred or unavailable due to setup               | Fallow selected but `deep: false`; dependency install failed.      |
| NOT CONFIGURED | Optional capability has no selected implementation | No product behavior test script; no claim of product verification. |

Missing required configuration and every executed failed check produce a failing process/job. A failed upload can also fail the job. Test counts/assertions remain in command logs; v1 does not pretend to parse every test framework's output. Cancelled/timed-out runners may have no final report; the GitHub conclusion is authoritative.
