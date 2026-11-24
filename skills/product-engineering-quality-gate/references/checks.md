# Local command contract

The checkout root owns the lockfile. The package selected by `working-directory` owns its `package.json` and `quality-gate.config.json`. The default config filename can be overridden with `config`. The caller should pin the reusable workflow to a reviewed commit SHA.

| Workflow input          | Purpose                                        |
| ----------------------- | ---------------------------------------------- |
| `working-directory`     | Package path relative to the checkout root.    |
| `config`                | Config path relative to the selected package.  |
| `deep`                  | Enable checks declared with `tier: deep`.      |
| `node-version`          | Node version used by the workflow.             |
| `check-timeout-seconds` | Per-script timeout.                            |
| `report-name`           | Artifact name, unique within a run.            |
| `browser-evidence`      | Opt in to uploading browser failure artifacts. |

Use the existing package scripts. For example, a check with `"script": "test:ci"` runs as `pnpm run test:ci` in a pnpm consumer. Formatter, lint, product, smoke, browser, and security checks are also package scripts when the config declares them. A check that opts into `runner: "node"` can use `node --run` with npm when the script has no pre/post hooks. Use the report to confirm what ran.

Check the artifact named by `report-name` for the gate's verdict, selected script bodies, tool versions, timings and skip reasons. A skipped row with `waived` records an explicit policy decision. A failed prerequisite can cause downstream rows to be skipped while the overall verdict remains failed.

To reproduce the whole gate, run its runtime from the consumer's package with a checkout of the pinned gate commit. It writes the same `.quality-gate/report.json` and `summary.md` as CI:

```sh
node /path/to/product-engineering-quality-gate/runtime/gate.mjs
QG_OPTIONS='{"deep":true}' node /path/to/product-engineering-quality-gate/runtime/gate.mjs --no-install
```

A local run checks every eligible row (no changed-path selection) with the local Node and package manager. On Node 25 or later, install Corepack first (`npm install --global corepack`).

[Configuration and schema](https://github.com/DimitrisTheo-Dev/product-engineering-quality-gate/blob/main/docs/configuration.md) · [Onboarding and local runs](https://github.com/DimitrisTheo-Dev/product-engineering-quality-gate/blob/main/docs/onboarding.md)
