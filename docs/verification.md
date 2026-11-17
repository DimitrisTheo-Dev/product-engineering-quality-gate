# Verification

## v2 release candidate

Local Linux x64 on 2026-11-16 with Node 24.22.1 and npm 11.9.0.

| Check                              | Actual result                                                                                                                                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format, lint, typecheck, and build | PASS. Generated workflows match their tested sources.                                                                                                                                                                               |
| Unit and product checks            | PASS. 44 unit/workflow tests and five synthetic product contracts.                                                                                                                                                                  |
| Workflow validation                | PASS. The central and canary workflows passed actionlint 1.7.12 using the checksum-pinned official archive. GitHub CLI authentication was unavailable locally.                                                                      |
| Standalone workflow execution      | PASS. The generated planner, gate, report verifier, and artifact-link step ran in a separate local checkout. The clean run passed and the broken build failed with the matching JSON verdict. A missing report failed verification. |
| Adoption                           | PASS. npm roots and npm, pnpm 12.18.0, Yarn 1.22.22, Yarn 4.18.1, and Bun 1.4.4 workspaces. Verified dry run, preservation, idempotency, frozen install, and targeted checks.                                                       |
| Presets and add-ons                | PASS. Biome 2.6.8 ran clean, then failed on separate formatting and lint probes with native GitHub diagnostics. Fallow and React Doctor passed their optional npm fixtures.                                                         |
| Bun                                | PASS. Exact Bun 1.4.4 used a committed text lockfile. Install hooks stayed disabled, Node scripts still ran on Node, and an intentionally broken check produced a FAIL row.                                                         |
| Speed                              | PASS on the warm install and path-skip targets. The default npm launch exceeds the 50 ms target. The opted-in Node launch met it locally. [Benchmark evidence](benchmarks.md).                                                      |

### Review findings

The initial red tests reproduced timing and command-behavior defects. Final review also reproduced the legacy caller, package scope, report upload, and heredoc defects in the Phase 0 checkout.

| #   | Finding                                                                    | Verification or decision                                                                                                                                                       |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Browser setup ordering                                                     | `setup executes before test and product checks and a failure prevents checks`                                                                                                  |
| 2   | Auto script selection leaked                                               | `auto is a literal script name and missing named scripts are FAIL`. Migration resolves the old test selector once.                                                             |
| 3   | Misleading status labels                                                   | `strict policy requires explicit waivers and deep skips carry a reason` and the exhaustive command-outcome test. Configuration success is metadata.                            |
| 4   | Missing timings                                                            | `locked install skips lifecycle hooks and records durations on success and failure` plus the before/after benchmark. The original timing regression was reproduced in Phase 0. |
| 5   | Immediate hard kill                                                        | `timeout allows a consumer to flush on SIGTERM and still fails` and `signal sent to the gate reaches the running script and still yields failure evidence`                     |
| 6   | Child environment leaks step handles                                       | `child environment hides workflow file commands and gate options`                                                                                                              |
| 7   | Markdown injection                                                         | `summary displays untrusted text as code and omits fixture commentary`                                                                                                         |
| 8   | Repeated Corepack wrapper                                                  | Fresh local Corepack provisioning checked exact npm, pnpm and both Yarn versions. The gate invokes the resolved binary directly. Modern Yarn requires a verified digest.       |
| 9   | Duplicated manager and lock logic                                          | Shared detection and install arguments in the runtime. Adoption uses the same manager resolution and its manager matrix exercises the actual gate install.                     |
| 10  | Caller test selection, cancellation, merge queue, version comment, upgrade | `generated caller pins v2, includes merge queues and keeps default-branch runs` and `migration records an explicit test script and upgrade only rewrites the pin`              |
| 11  | Catalog and workspace tool versions                                        | Reject indirection for listed tools to require an auditable exact pin. `listed tools reject catalog and workspace indirection`                                                 |
| 12  | Missing or conflicting report                                              | `report assertion rejects missing, contradictory and substituted reports` and the standalone embedded-step test.                                                               |
| 13  | Heredoc delimiter collision                                                | `generator refuses a delimiter that occurs on its own embedded line`                                                                                                           |
| 14  | Wrong package inspection and writes                                        | `nested presets update the selected package and detect its existing tools` and the workspace matrix.                                                                           |
| 15  | Fixture commentary in job summary                                          | `summary displays untrusted text as code and omits fixture commentary`                                                                                                         |

### Release checks still pending

Run the public and private canaries against an accessible release candidate SHA. Observe artifact upload, merge queue behavior, and actual GitHub cache restore/save and transfer time. Dispatch the hosted benchmark and the standalone browser workflow. Pilot one product before tagging. The local CLI, embedded-shell checks, and parsed workflow checks provide evidence up to that point. [Canary commands](../examples/canary/README.md) · [Release checklist](releases.md).

## v1 verification record

Observed on 2026-11-08. Fixtures establish fixture contracts, not production behavior or provider reliability. The [repository is public](https://github.com/DimitrisTheo-Dev/product-engineering-quality-gate) by explicit owner authorization.

## v2 Phase 0 checkpoint

Local Linux x64, Node 24.22.1 and npm 11.9.0 on 2026-11-16. The v1.0.1 timing regressions reproduced missing Configuration and install row durations and a missing timing breakdown on prerequisite failure. The focused tests pass with instrumentation, including a real locked install and an intentionally invalid lockfile.

| Check                                                    | Actual result                                                                                                                                                                                        |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format, lint, typecheck and build                        | PASS. The generated quality workflow embeds the tested runtime.                                                                                                                                      |
| `npm test` and `npm run test:product`                    | PASS. 29 unit and workflow tests and five synthetic product contracts.                                                                                                                               |
| `npm run test:adoption` with and without `-- --managers` | PASS. npm, pnpm 12.18.0, Yarn 1.22.22 and Yarn 4.18.1.                                                                                                                                               |
| Workflow syntax                                          | PASS with the official actionlint 1.7.12 binary and the repository's pinned archive checksum. The `npm run check:workflows` download path requires GitHub CLI authentication, which was unavailable. |

Hosted benchmark execution and cross-repository runs remain pending. [Local timings and benchmark method](benchmarks.md).

## v1.0.1 correction

A fresh public v1.0.0 clone under a symlinked filesystem path exposed an entrypoint comparison bug: the local CLI/runner could exit without running because Node canonicalizes module URLs. v1.0.1 resolves the invoked file before comparing it, adds two regression tests, and updates new-adoption guidance. The original v1.0.0 tag is retained unchanged. Patch-release notes record its exact CI and published-checkout verification.

## Local checkpoints

| Check                                 | Actual result                                                                                                                                                                                                                                             |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Oxfmt 0.77.0 / Oxlint 1.92.0          | PASS with local exact dependencies; actual formatting errors and lint warnings fail in tests.                                                                                                                                                             |
| TypeScript 7.0.2 / build              | PASS; emitted build and generated workflow/source consistency checks.                                                                                                                                                                                     |
| `npm test`                            | **27 passed**: real tool failures, missing prerequisites/scripts, tests cannot be disabled, deferred checks, version pins, traversal/symlink rejection, process-group timeout, adoption conflicts, skill installation, and workflow security contracts.   |
| `npm run test:product`                | **5 passed**, explicitly synthetic Q&A contracts; no provider calls.                                                                                                                                                                                      |
| Full local gate                       | PASS, including locked install with dependency hooks disabled, required checks, and `test:product`.                                                                                                                                                       |
| `npm run test:adoption`               | PASS: isolated Node/TS and React/TS repositories; dry run writes nothing, source/existing CI preserved, repeat apply byte-idempotent, locked install and actual gate pass.                                                                                |
| `npm run test:adoption -- --managers` | PASS: npm, pnpm 12.18.0, Yarn 1.22.22, and Yarn 4.18.1 with node_modules.                                                                                                                                                                                 |
| `npm run test:adoption -- --advanced` | PASS: actual Fallow dead code/duplication/complexity/architecture on both npm fixtures; React Doctor on React only.                                                                                                                                       |
| pnpm policy rejection                 | PASS: restrictive release-age policy refused adoption; package, policy, source, and workflows remained byte-identical. No security exception added. Newly released optional tools may legitimately be blocked by consumer age policies.                   |
| Chromium                              | PASS safe-text smoke; intentional mismatch exits nonzero and creates screenshot/trace. Screenshot inspected: synthetic text only.                                                                                                                         |
| actionlint 1.7.12                     | PASS on every workflow; official archive checksum verified.                                                                                                                                                                                               |
| npm audit                             | 0 vulnerabilities reported for the central lockfile at verification time; not a blanket security guarantee.                                                                                                                                               |
| Codex skill                           | Validator PASS; installed in `~/.agents/skills/product-engineering-quality-gate`; repeat install no-op, conflicts preserve user content. No global instructions/config edited.                                                                            |
| Publication review                    | Full Git history scanned with checksum-verified Gitleaks 8.30.1: no findings. Tracked content/history reviewed manually; generic examples and public-safe noreply attribution only. No artifacts, secrets, company material, or local user paths tracked. |

Local host: macOS arm64, Node 26.10.0/npm 11.19.1. Hosted runs use Ubuntu 24.04 and exact Node 24.22.2. Verification exposed and corrected a lint warning, Yarn's singular `skip-build` option, a skill-copy bug, a Fallow flag incompatibility, and pnpm policy side effects. Failures were corrected rather than suppressed.

## Real GitHub execution

These are **self-consuming runs in the central repository**; they do not prove cross-repository access. The tested implementation commit is [`0d8342a987258374344e31cdd04f685ee9307912`](https://github.com/DimitrisTheo-Dev/product-engineering-quality-gate/commit/0d8342a987258374344e31cdd04f685ee9307912). Optional demonstrations ran at its predecessor with the same optional-tool/reporting contract. Release notes also link the final release-commit CI run.

| Run                                                                                                                              | Observed result                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Implementation CI](https://github.com/DimitrisTheo-Dev/product-engineering-quality-gate/actions/runs/42479202505)               | **SUCCESS**: required gate, 25 tests, five product fixtures, build, actionlint, and both adoption fixtures.                                                       |
| [Expected missing-script failure](https://github.com/DimitrisTheo-Dev/product-engineering-quality-gate/actions/runs/42479057787) | **FAILURE as intended**: nonexistent Typecheck script; JSON passed=false, Typecheck FAIL, other verdicts retained, report upload succeeded.                       |
| [Browser smoke](https://github.com/DimitrisTheo-Dev/product-engineering-quality-gate/actions/runs/42479059948)                   | **SUCCESS**: actual hosted Chromium install and safe-text smoke.                                                                                                  |
| [Browser failure/artifacts](https://github.com/DimitrisTheo-Dev/product-engineering-quality-gate/actions/runs/42479167893)       | **FAILURE as intended**: synthetic text mismatch; quality report and screenshot/trace artifacts uploaded successfully.                                            |
| [Advanced tools and managers](https://github.com/DimitrisTheo-Dev/product-engineering-quality-gate/actions/runs/42479062275)     | **SUCCESS**: advanced npm fixtures and separate npm/pnpm/Yarn adapter fixtures.                                                                                   |
| [AI disabled path](https://github.com/DimitrisTheo-Dev/product-engineering-quality-gate/actions/runs/42479064597)                | Workflow completed; summary NOT CONFIGURED/SKIPPED; provider job **SKIPPED**. No provider request or paid evaluation. This is not a passed live-model evaluation. |
| [Initial CI](https://github.com/DimitrisTheo-Dev/product-engineering-quality-gate/actions/runs/42478583322)                      | **FAILURE**: a lint warning was caught and reporting preserved failure. Fixed before release.                                                                     |

Downloaded JSON reports confirmed passing/failing verdicts and NOT CONFIGURED rows. Browser failure artifacts were downloaded and checked for screenshot/trace presence. Artifacts have short retention (seven days for reports, three for browsers); run logs and this record remain after artifact expiry.

## Limits

No existing repository was enrolled. No organization policy, branch protection, or unrelated repository was changed. No separate remote consumer was created; cross-repository adoption remains unverified. No live-model evaluation or provider-backed code review was attempted. Private dependency installs, Bun, Yarn PnP, Windows, GHES, full manager/optional-tool combinations, production data, and production product behavior are outside the verified v1 contract. Optional analysis respects consumer configuration; it is not proof of architecture correctness or complete coverage.
