# Product engineering quality gate

A reusable GitHub Actions workflow for JS and TS repositories. It runs your own package scripts on
every pull request (format, lint, typecheck, tests, build and anything else you list) and reports
each one as PASS, FAIL or SKIPPED. One failure fails the job.

[![Seven passing checks in a real v2 pull request](docs/images/quality-gate-pr-report.png)](https://github.com/DimitrisTheo-Dev/product-engineering-quality-gate/actions/runs/44051548625)

## Adopt it

You need Node 24 and one lockfile (npm, pnpm, Yarn or Bun) at the repository root.

```sh
git clone --branch v2.0.0 https://github.com/DimitrisTheo-Dev/product-engineering-quality-gate.git
cd product-engineering-quality-gate
node scripts/onboard.mjs --repo /path/to/your-repo          # dry run, writes nothing
node scripts/onboard.mjs --repo /path/to/your-repo --apply
```

Onboarding adds pinned Oxfmt and Oxlint (`--preset existing` keeps your own tools), then writes
`quality-gate.config.json` and a workflow pinned to the v2.0.0 commit. Run the same gate locally
before you push:

```sh
node /path/to/product-engineering-quality-gate/runtime/gate.mjs
```

## What it reports

| Check                          | Status      | Evidence                                     |
| ------------------------------ | ----------- | -------------------------------------------- |
| Locked dependency installation | **PASS**    | `pnpm-lock.yaml; lifecycle scripts disabled` |
| Typecheck                      | **PASS**    | `Package script typecheck completed.`        |
| Tests                          | **FAIL**    | `Exit 1. Fix the diagnostics and rerun.`     |
| Design rules                   | **PASS**    | `Package script design:check completed.`     |
| Build                          | **PASS**    | `Package script build completed.`            |
| Browser                        | **SKIPPED** | `Enable deep to run this check.`             |

The job summary shows this table. `.quality-gate/report.json` adds the script bodies, tool versions,
skip reasons and timings. A check is any package script:
[dtheo/ui](https://github.com/DimitrisTheo-Dev/dtheo-ui) runs its design linter as one.

[Configuration](docs/configuration.md) · [Onboarding and local runs](docs/onboarding.md) ·
[v1 migration](MIGRATION.md) · [Releases](docs/releases.md) · [Architecture](docs/architecture.md) ·
[Troubleshooting](docs/troubleshooting.md)
