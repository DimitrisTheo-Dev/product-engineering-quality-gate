# Product engineering quality gate

A reusable GitHub Actions gate for JS and TS repositories. The central workflow handles locked installs, ordering, timeouts, and evidence. Each product keeps its own package scripts and decides which checks matter.

## Adopt it

Run onboarding from a reviewed release checkout with Node 24. Start with a dry run, then inspect the generated patch after applying.

```sh
node scripts/onboard.mjs --repo /path/to/product --preset oxc
node scripts/onboard.mjs --repo /path/to/product --preset oxc --apply
```

Choose `oxc`, `biome`, or `existing`. Onboarding writes the selected package's config and a caller pinned to the exact release commit. Replace the SHA placeholder when copying this example.

```yaml
name: Product quality
on:
  pull_request:
  merge_group:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
concurrency:
  group: product-quality-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.ref_name != github.event.repository.default_branch }}
jobs:
  quality:
    uses: DimitrisTheo-Dev/product-engineering-quality-gate/.github/workflows/quality-gate.yml@RELEASE_SHA # v2.0.0
```

`quality-gate.config.json` describes the commands in that product.

```json
{
  "tools": ["typescript"],
  "checks": [
    { "name": "Typecheck", "kind": "typecheck", "script": "typecheck" },
    { "name": "Tests", "kind": "test", "script": "test:ci" },
    { "name": "Build", "kind": "build", "script": "build" },
    { "name": "Browser", "kind": "e2e", "script": "test:e2e", "tier": "deep" }
  ]
}
```

## What CI reports

| Check                          | Status      | Evidence                   |
| ------------------------------ | ----------- | -------------------------- |
| Locked dependency installation | **PASS**    | Lifecycle scripts disabled |
| Typecheck                      | **PASS**    | `typecheck` exited zero    |
| Tests                          | **FAIL**    | `test:ci` exited 1         |
| Build                          | **PASS**    | `build` exited zero        |
| Browser                        | **SKIPPED** | `deep-tier`                |

The example fails the job. The JSON report records the script bodies, tool versions, skip reasons, and timings. An explicit waiver appears in the report when a product omits typecheck, testing, or a build.

[Configuration and schema](docs/configuration.md) · [Onboarding](docs/onboarding.md) · [v1 migration](MIGRATION.md) · [Benchmarks](docs/benchmarks.md) · [Verification and release](docs/verification.md) · [Architecture and cache trust](docs/architecture.md)
