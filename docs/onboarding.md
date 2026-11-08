# Safe repository onboarding

Onboarding is local and reviewable. Use a release checkout and a target Git repository root. Node 24+ is required; no dependencies need to be installed in the central checkout just to run onboarding.

```sh
node quality-gate-tools/scripts/onboard.mjs --repo /path/to/repo --dry-run
node quality-gate-tools/scripts/onboard.mjs --repo /path/to/repo --apply
```

Dry run is also the default. It reads Git/package metadata and produces a JSON adoption plan without writing target files or fetching dependencies. It detects package manager/lockfile, React, scripts, monorepo indicators, conflicts, and missing required commands. Apply updates package scripts, exact development dependencies, the lockfile, and one caller workflow. It never commits, pushes, formats source, changes global tooling, or modifies existing CI/configs. All prospective destination paths reject symlinks. Lockfile update failure restores the package/lock/caller bytes it touched.

Missing typecheck/build/tests are reported. The CLI cannot infer your production build or fabricate a meaningful test. Add real commands before making the gate required. Existing `test:ci` is preferred over `test`; avoid watch mode. Existing formatter differences need an intentional baseline/migration. An apply conflict stops before writes; review conflicting `quality:*` scripts or `product-quality.yml` manually.

Apply requires registry/network access to update the lockfile. Dependency lifecycle hooks are disabled. npm/pnpm apply generally updates metadata and lockfile only; Yarn may also populate its own dependency state/cache. Install the locked dependencies separately and review all changed files. Native/code-generation dependencies can use a reviewed CI setup script through `extra-script`.

## Options and presets

```sh
# React-specific checks are detected as applicable but enabled only explicitly.
node quality-gate-tools/scripts/onboard.mjs --repo /path/to/react-repo --apply --react-doctor

# Add optional Fallow; the generated fast caller leaves it deferred until deep=true.
node quality-gate-tools/scripts/onboard.mjs --repo /path/to/repo --apply --fallow

# Select a package and existing commands.
node quality-gate-tools/scripts/onboard.mjs --repo /path/to/monorepo --dry-run --working-directory apps/web --typecheck-script check:types --build-script build:ci --test-script test:ci --product-script ci:smoke
```

`--ref FULL_SHA` overrides the workflow revision. The default is the **central checkout's HEAD**, so clone the release tag and avoid running an uncommitted development checkout for production adoption. It never resolves a moving workflow ref during CI. `--help` prints every option.

## Package managers

- npm: `package-lock.json` or `npm-shrinkwrap.json`; an absent lockfile is created in apply mode. An exact `packageManager: npm@x.y.z` is honored through pinned Corepack; absent declaration uses setup-node's npm.
- pnpm: one root `pnpm-lock.yaml` and exact `packageManager: pnpm@x.y.z`; use `pnpm install --frozen-lockfile --ignore-scripts` locally.
- Yarn: one root `yarn.lock`, exact `packageManager: yarn@x.y.z`, and node_modules linking. Use `--frozen-lockfile --ignore-scripts` for Yarn 1, `--immutable --mode=skip-build` for modern Yarn. Set `nodeLinker: node-modules` for modern Yarn.
- Bun and Yarn PnP: detected, not modified by this v1. Keep existing CI and use a supported install layout or wait for a tested adapter. No silent conversion to npm.

For pinned package managers the runner uses `npm exec --yes --package=corepack@0.36.0 -- corepack MANAGER ...`; Corepack downloads only the explicitly declared manager. Quality executables come from the project's locked installation. No local global package manager is installed by onboarding.

pnpm dependency-age/trust policy remains authoritative. Apply uses noninteractive strict release-age resolution and refuses/rolls back workspace policy changes. A newly released pinned optional tool may need to age into your policy or be replaced with a manually selected eligible exact version. Onboarding never adds a minimum-release-age exception to make installation pass.

Run onboarding again with identical options: it reports no changes. It refuses a different existing caller rather than guessing how to upgrade it. A caller matrix is a manual, small edit; see [examples](examples.md). Onboarding never crawls or enrolls your other repositories.

## Rollback

Before committing, inspect `git diff` and undo only the generated caller and the specific script/dependency/lockfile additions using your editor or interactive Git restore. Preserve unrelated pending edits. After merging adoption, revert that adoption commit through your normal review process. Remove the required-check rule first if disabling the workflow, so PRs do not wait for a check that no longer runs. Existing CI/configs remain available.
