# Safe repository onboarding

Run the helper from a release checkout with Node 24. The dry run reads the target Git repository and prints prospective changes without writing or fetching dependencies.

```sh
node product-engineering-quality-gate/scripts/onboard.mjs --repo /path/to/product
node product-engineering-quality-gate/scripts/onboard.mjs --repo /path/to/product --apply
```

The helper writes scripts and dependency declarations into the checked package. It updates the root lockfile when dependencies change, writes the package-local config, and creates `.github/workflows/product-quality.yml`. Use `--working-directory apps/web` for a package inside the install root. Apply preserves existing source and formatter configs, stops on conflicts before writing, and restores the previous bytes of touched manifests, lockfile, config, and caller on failure. It uses the central checkout's HEAD as the workflow revision unless you pass a full `--ref SHA`, so clone the release tag (`git clone --branch v2.0.0`), not `main`. Onboarding also adds `.quality-gate/` to `.gitignore`, because every run writes its report there.

## Run the gate locally

Run the same runtime from the product repository. It reads the same config and writes the same `.quality-gate/report.json` and `summary.md`:

```sh
cd /path/to/product
node /path/to/product-engineering-quality-gate/runtime/gate.mjs
QG_OPTIONS='{"deep":true}' node /path/to/product-engineering-quality-gate/runtime/gate.mjs --no-install
```

`QG_OPTIONS` takes the workflow inputs as JSON (`working-directory`, `config`, `deep`, `check-timeout-seconds`). `--no-install` skips the locked install. Run it from the checkout root, which owns the lockfile, and set `working-directory` for a package inside a workspace. A local run differs from CI in three ways: it runs every eligible check (no changed-path selection), it uses your Node, and no report verifier runs after it. A pinned npm, pnpm or Yarn comes from Corepack, as in CI, and the gate writes a small shim for it under `$COREPACK_HOME/quality-gate-bin` (by default `~/.cache/node/corepack`) so package scripts that call the manager again get the same version. Node 25 and later do not ship Corepack, so run `npm install --global corepack` first or use Node 24.

`--upgrade` changes only the workflow pin. It does not add `.quality-gate/` to `.gitignore`; add it yourself when upgrading from an earlier v2 commit.

## Presets

| Option              | Effect                                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `--preset oxc`      | Default. Exact Oxfmt and Oxlint pins, checked through local package scripts. Oxfmt skips the generated gate config and `.quality-gate/`.      |
| `--preset biome`    | Exact Biome pin and `biome ci` with Git ignore files enabled. Keep your existing Biome config and fix its findings before requiring the gate. |
| `--preset existing` | Uses existing lint and format-check scripts when found. Adds no tools or package scripts.                                                     |
| `--react-doctor`    | Adds React Doctor for a package that declares React.                                                                                          |
| `--fallow`          | Adds a deep Fallow check.                                                                                                                     |
| `--playwright`      | Adds the local Playwright Chromium setup script. Select your browser test separately.                                                         |

The helper resolves `test:ci` or `test` into an explicit config entry. Use `--test-script`, `--typecheck-script`, or `--build-script` to select a different existing command. Use `--waive test`, `--waive typecheck`, or `--waive build` when the product intentionally omits a required check. The waiver appears in every report.

## Package managers

| Manager | Install root and requirements                                                                                                                                                                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| npm     | `package-lock.json` or `npm-shrinkwrap.json`. An exact `packageManager` declaration is optional.                                                                                                                                                                                                 |
| pnpm    | `pnpm-lock.yaml` and exact `packageManager: pnpm@x.y.z`. Apply uses a lockfile-only update, respects release-age policy, and rolls back unexpected workspace policy edits.                                                                                                                       |
| Yarn    | `yarn.lock` and exact `packageManager`. Yarn 1 workspaces require a package version. Modern Yarn requires `nodeLinker: node-modules` and a manager integrity hash. The verified Yarn 4.18.1 version has a built-in digest. Yarn Classic may refresh its installed dependency state during apply. |
| Bun     | `bun.lock` and exact `packageManager: bun@x.y.z`. Provision that Bun version locally first. Apply updates the text lockfile with lifecycle scripts disabled.                                                                                                                                     |

Convert a legacy Bun lockfile with the project's pinned version before adopting. Review and commit the text lockfile after removing the binary one.

```sh
bun install --save-text-lockfile --frozen-lockfile --lockfile-only --ignore-scripts
git rm bun.lockb
git add bun.lock
```

Use one supported lockfile at the install root. For a workspace, run the gate per package or call root aggregate scripts. [Package manager sources](sources.md#v2-package-managers-and-workflows).

## Updating or rolling back

Use `--migrate` for a managed v1 caller and `--upgrade --ref SHA` to update only a managed v2 workflow pin and version comment. Both default to dry run. [Migration walkthrough](../MIGRATION.md).

Inspect the patch before committing. After adoption merges, rollback by reverting that adoption commit and updating the required-check rule if the workflow is disabled.
