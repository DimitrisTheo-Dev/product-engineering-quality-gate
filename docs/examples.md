# Adoption examples

## React and TypeScript

Use your existing build and a non-watch test command. Select the product check and optional React
analysis during onboarding.

```sh
node scripts/onboard.mjs --repo /path/to/product --preset biome --test-script test:ci --product-script test:product --react-doctor
```

Provide real assertions for the user outcome in `test:product`. The Node and React fixtures in
`examples/` exercise the adoption and verdict contract.

## Monorepo

Use one root lockfile. Run root aggregate scripts for one install, or give each matrix entry its own
working directory and report name. Each package keeps the config it owns.

```yaml
jobs:
  quality:
    strategy:
      fail-fast: false
      matrix:
        package: [apps/web, apps/api]
        include:
          - package: apps/web
            report: quality-web
          - package: apps/api
            report: quality-api
    uses: DimitrisTheo-Dev/product-engineering-quality-gate/.github/workflows/quality-gate.yml@RELEASE_SHA # v2.0.0
    with:
      working-directory: ${{ matrix.package }}
      report-name: ${{ matrix.report }}
```

## Browser setup and deep checks

Put browser installation and client generation in `setup`. Set `tier: "deep"` on a browser check
that runs only when the caller sets `deep: true`. A smoke check can use `paths` with the relevant
source/test globs. For trace uploads opt into `browser-evidence` and keep the generated files free
of sensitive data. [Config examples and reference](configuration.md).
