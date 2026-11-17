# Configuration

Place `quality-gate.config.json` in the package that owns the checks. The checkout root owns the install and lockfile. Use a pinned workflow commit SHA from a reviewed release.

```json
{
  "tools": ["typescript"],
  "setup": ["generate:types"],
  "checks": [
    { "name": "Typecheck", "kind": "typecheck", "script": "typecheck" },
    { "name": "Tests", "kind": "test", "script": "test:ci" },
    { "name": "Build", "kind": "build", "script": "build" },
    { "name": "Browser", "kind": "e2e", "script": "test:e2e", "tier": "deep" }
  ]
}
```

| Field                    | Meaning                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `setup`                  | Existing package scripts in execution order. A failure prevents checks from running.                                                             |
| `tools`                  | Exact-pinned dependencies to verify, including their installed versions. A pin can be in the checked package or an ancestor within the checkout. |
| `checks`                 | Required check definitions. Each name is unique. A kind is a lowercase identifier. A script is an exact package script name.                     |
| `tier`                   | Set `deep` on a check to run it only when the caller sets `deep: true`.                                                                          |
| `concurrent` and `paths` | Optional execution hints for opt-in batches and repository-relative file selection.                                                              |
| `policy.waive`           | An explicit list of omitted `typecheck`, `test`, or `build` kinds. A fast check or a waiver is required for each kind.                           |

The runtime rejects unknown keys. The [JSON Schema](../schema/quality-gate.schema.json) supplies editor completion and structural validation. The runner also enforces unique names, safe paths, and the required-kind policy. Use exact registry versions for listed tools. A catalog or workspace reference delegates version selection elsewhere and is rejected for a listed tool.

| Workflow input          | Default                    | Meaning                                                                                            |
| ----------------------- | -------------------------- | -------------------------------------------------------------------------------------------------- |
| `working-directory`     | `.`                        | Package path within the checkout.                                                                  |
| `config`                | `quality-gate.config.json` | Config path within that package.                                                                   |
| `deep`                  | `false`                    | Enables deep checks.                                                                               |
| `node-version`          | `24.22.2`                  | Node version used for the gate.                                                                    |
| `check-timeout-seconds` | `300`                      | Per-script limit from 1 to 1200 seconds. Installs have a separate 600-second limit.                |
| `report-name`           | `quality-report`           | Unique artifact name. Set distinct names for multiple calls in a run.                              |
| `browser-evidence`      | `false`                    | Opt-in upload of browser traces and screenshots on failure. Review their contents before enabling. |

## Reporting model

The report at `.quality-gate/report.json` records the gate version, tool versions, manager, a boolean `passed`, and rows with `PASS`, `FAIL`, or `SKIPPED`. A row passes only after a command exits zero. Script rows include the selected script name and the body read from the package manifest before execution. Failures emit GitHub error annotations. Skipped rows carry a reason such as `deep-tier`, `prerequisite-failed`, or `waived`. The workflow publishes `passed` and the `report` artifact name as outputs.

The matching summary uses the same verdicts. Timings are in milliseconds and cover startup, configuration, package-manager resolution, locked install, attempted scripts, and reporting. A phase that could not start has a null duration. The final JSON write is counted in the external wall time. [Benchmark method](benchmarks.md).
