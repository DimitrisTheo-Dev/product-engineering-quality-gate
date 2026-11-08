# Adoption examples

All `uses` examples below are templates: replace `RELEASE_SHA` with the exact commit from the [v1.0.0 release](https://github.com/DimitrisTheo-Dev/product-engineering-quality-gate/releases/tag/v1.0.0). The onboarding CLI does this automatically from a release checkout. Do not paste the placeholder literally.

## New React/TypeScript repository

Create the product with your preferred starter and keep its build/test/typecheck setup. Add a real `typecheck` script if the starter only typechecks as part of build. Run onboarding with `--react-doctor` only if you want that additional check. Oxfmt/Oxlint are always installed by apply; React Doctor is optional and separately licensed.

```yaml
name: Product quality
on: [pull_request, workflow_dispatch]
permissions:
  contents: read
concurrency:
  group: product-quality-${{ github.ref }}
  cancel-in-progress: true
jobs:
  quality:
    uses: DimitrisTheo-Dev/product-engineering-quality-gate/.github/workflows/quality-gate.yml@RELEASE_SHA
    with:
      react-doctor: true
      product-script: test:product
```

`test:product` must exist and actually exercise the intended user outcome. Omit that input while unconfigured; the report will say NOT CONFIGURED. `examples/react-ts` is a tiny compilable fixture with React 19 and a tested label helper, not a complete React app or UI coverage claim.

## Existing React/TypeScript repository

Run dry-run before apply. Preserve ESLint/Prettier/Biome and existing CI; the generated caller includes an existing `lint` script as `extra-script`. Inspect Oxfmt differences before establishing a baseline. Pin existing Oxc versions manually if they are ranges; onboarding refuses to overwrite a chosen dependency version. Keep supported ESLint rules that Oxlint does not replace.

For Vitest/Jest, select a non-watch script such as `test:ci`. For native/code-generated dependencies, combine the existing extra checks and explicit setup in a consumer script, e.g. `ci:prepare-and-lint`, and select that as `extra-script`. It runs before typecheck/tests/build, after Oxfmt/Oxlint.

## Node/TypeScript backend

Use the same caller with no React inputs. Keep `tsc --noEmit` (or your current typechecker), the existing production build, and existing tests. Add API behavior tests through `product-script` or `smoke-script`. `examples/node-ts` is an isolated Node/TS fixture tested by `npm run test:adoption`.

## Monorepo

Prefer root aggregate typecheck/build/test scripts for one install and one required check. Tools run at the root and honor nested configurations. Do not enable React Doctor at the root unless the root declares React; select a React package instead.

When packages need independent check inputs, use one root lockfile plus a small caller matrix. Each invocation installs from the root, then runs scripts inside its selected package. This repeats installs; use it only when useful. Provide a unique artifact name per entry.

```yaml
jobs:
  quality:
    strategy:
      fail-fast: false
      matrix:
        include:
          - name: web
            directory: apps/web
            react: true
          - name: api
            directory: apps/api
            react: false
    uses: DimitrisTheo-Dev/product-engineering-quality-gate/.github/workflows/quality-gate.yml@RELEASE_SHA
    with:
      working-directory: ${{ matrix.directory }}
      react-doctor: ${{ matrix.react }}
      report-name: quality-${{ matrix.name }}
```

Install tool dependencies at the workspace root or selected package. React packages must declare React themselves. Configure Fallow workspace/entry-point rules in the consumer; arbitrary metrics are not a reason to restructure your domain model.

## Custom behavior and deeper checks

Keep command logic in package scripts:

```json
{
  "scripts": {
    "check:types": "tsc --noEmit",
    "test:ci": "vitest run",
    "test:product": "vitest run tests/product",
    "ci:smoke": "playwright test --project=smoke",
    "test:e2e": "playwright test --project=e2e",
    "security:dependencies": "npm audit --audit-level=high"
  }
}
```

These illustrate an existing Vitest/Playwright project; install exact versions intentionally rather than copying unused commands. In the reusable caller:

```yaml
with:
  typecheck-script: check:types
  test-script: test:ci
  product-script: test:product
  smoke-script: ci:smoke
  playwright: true
  upload-playwright-failures: true
  e2e-script: test:e2e
  security-script: security:dependencies
  fallow: true
  deep: ${{ github.event_name == 'workflow_dispatch' }}
```

Smoke runs on every invocation; Fallow/E2E/security run only on manual dispatch in this example. Keep heavy suites out of PR smoke. Configure Playwright webServer/ports in the consumer, use synthetic accounts and data, set trace to `retain-on-failure` and screenshot to `only-on-failure`, and exclude auth/storage state from reports. Opt-in uploads include the entire named report directories; do not put secrets or real documents there. The central `Optional browser smoke` workflow demonstrates browser plumbing on safe text, not product E2E coverage.
