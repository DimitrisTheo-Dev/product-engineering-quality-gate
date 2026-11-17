# Quality gate benchmarks

The baseline uses v1.0.1 (`87f6ed7`) with Phase 0 timing instrumentation. It runs npm with the v1 commands and verdicts. Run the same harness after each optimization to record the before and after measurements.

## Method

Run on Node 24 with npm. Install the browser and its system prerequisites before the benchmark. The root lockfile and the benchmark fixture pin the same version of Playwright.

```sh
npm ci --ignore-scripts --no-audit --no-fund
./node_modules/.bin/playwright install --with-deps chromium
node scripts/bench.mjs
```

Use `--samples N` for more than five pairs. Use `--fixture node-ts` or `--fixture bench-vite-react` to run a single fixture. **Quality gate benchmark** (`benchmark.yml`) provides a manual dispatch on Ubuntu 24.04 with Node 24.22.2. It publishes results in the job summary and as a Markdown artifact. A maintainer can dispatch it when the workflow is on the default branch. [GitHub manual workflow documentation](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

- The small fixture is `examples/node-ts`. The medium fixture is `examples/bench-vite-react` with React, Vite, Vitest and Playwright. The browser checks a search interaction against the production build. Both fixtures have committed npm lockfiles.
- Each of five pairs uses a fresh npm cache and two independent copies of the fixture. Cold fills the download cache. Warm shares it and still performs a fresh locked install. Browser setup happens before both runs. Hosted cache restore and save latency remains to be measured.
- After the warm run, the harness adds a script with body `node -e ""` to the temporary fixture. It times each script-backed gate row with that script, as well as direct `node -e ""`, `npm run` and `node --run` launches. The overhead is the paired difference between a gate no-op row and bare Node. The runtime continues to run the local Oxc tools during the probe.
- Table values are in milliseconds, shown as medians with minimum and maximum in parentheses. Startup is internal to the Node process. Gate wall time includes process launch and exit. Manager detection covers the lockfile and declaration lookup. In v1 the npm/Corepack wrapper, when selected, runs inside install or script timings. The harness measures local report writes. A reusable-workflow run also times appending to the GitHub job summary. [Reporting model](configuration.md#reporting-model).

## Local baseline

Measured on 2026-11-16 on local Linux x64 with Node 24.22.1, npm 11.9.0 and nine CPUs visible to Node. There are five cold and five warm observations for each fixture. The medium fixture installed 67 packages on this host and ran the Playwright smoke check in all ten runs. The Playwright CDN returned truncated archives here, so the exact Chrome Headless Shell 158.0.8127.18 expected by Playwright 1.65.0 came from the Chrome for Testing distribution and was provisioned before timing. Hosted measurements are pending.

The medium fixture's median locked install fell from 7.28 s to 1.31 s with the warm download store, a 5.5× improvement before hosted cache transfer costs. Its total gate time fell from 10.66 s to 4.54 s. Median no-op overhead was 107–114 ms per scripted check, above the 50 ms target. Direct `node --run` took 58.53 ms compared with 53.14 ms for bare Node and 160.20 ms for `npm run` on this fixture.

### Node and TypeScript

| Phase                                      |                      Cold |                      Warm |
| ------------------------------------------ | ------------------------: | ------------------------: |
| Gate wall time                             | 6780.41 (5980.18–7717.45) | 2227.69 (2126.26–2315.38) |
| Runtime start                              |       47.15 (44.52–62.88) |       51.83 (44.31–81.97) |
| Configuration (includes manager detection) |          0.60 (0.53–0.86) |          0.58 (0.54–1.35) |
| Package-manager detection                  |          0.15 (0.15–0.22) |          0.15 (0.15–0.47) |
| Locked install                             | 5425.18 (4508.26–6356.39) |    843.43 (797.20–933.39) |
| Oxfmt                                      |       72.67 (66.39–78.26) |       71.26 (64.35–89.29) |
| Oxlint                                     |      69.99 (64.73–144.58) |       66.16 (60.09–78.29) |
| Typecheck                                  |    461.92 (410.26–558.96) |    424.91 (407.39–522.60) |
| Tests                                      |    287.38 (268.55–304.85) |    270.84 (262.75–279.26) |
| Build                                      |    440.65 (411.41–544.91) |    427.24 (414.09–466.90) |
| Reporting                                  |          0.37 (0.31–0.58) |          0.34 (0.31–0.41) |

| Launch probe                          |               Duration |
| ------------------------------------- | ---------------------: |
| Bare Node                             |    54.56 (48.68–87.17) |
| npm run noop                          | 161.13 (159.24–166.87) |
| node --run noop                       |    58.26 (52.29–60.34) |
| Gate noop (Typecheck)                 | 173.59 (160.56–226.69) |
| Gate noop minus bare Node (Typecheck) |  121.25 (77.24–169.89) |
| Gate noop (Tests)                     | 166.79 (160.28–237.83) |
| Gate noop minus bare Node (Tests)     |  112.73 (77.47–189.15) |
| Gate noop (Build)                     | 180.79 (166.94–186.64) |
| Gate noop minus bare Node (Build)     |  117.70 (93.62–133.47) |

### Vite, React, Vitest and Playwright

| Phase                                      |                        Cold |                      Warm |
| ------------------------------------------ | --------------------------: | ------------------------: |
| Gate wall time                             | 10660.56 (9062.60–11254.81) | 4542.63 (4455.06–4784.30) |
| Runtime start                              |         46.65 (45.50–49.94) |      49.94 (44.19–184.30) |
| Configuration (includes manager detection) |            0.59 (0.54–0.71) |          0.71 (0.57–0.92) |
| Package-manager detection                  |            0.15 (0.14–0.28) |          0.16 (0.15–0.27) |
| Locked install                             |   7278.91 (5707.44–7907.07) | 1313.10 (1278.13–1556.20) |
| Oxfmt                                      |         71.05 (67.63–76.16) |       70.31 (67.46–89.37) |
| Oxlint                                     |         70.38 (64.53–80.00) |       71.97 (65.25–82.45) |
| Typecheck                                  |      326.05 (289.20–601.75) |    300.78 (292.80–408.90) |
| Tests                                      |      578.32 (563.62–905.54) |    561.74 (544.37–633.27) |
| Build                                      |      487.12 (378.36–604.40) |    410.37 (398.79–446.07) |
| Smoke                                      |   1739.72 (1587.48–1770.17) | 1664.67 (1585.96–1776.15) |
| Reporting                                  |            0.35 (0.33–0.76) |          0.38 (0.32–0.44) |

| Launch probe                          |               Duration |
| ------------------------------------- | ---------------------: |
| Bare Node                             |    53.14 (52.27–54.83) |
| npm run noop                          | 160.20 (158.23–179.86) |
| node --run noop                       |    58.53 (53.37–60.44) |
| Gate noop (Typecheck)                 | 162.56 (157.16–165.57) |
| Gate noop minus bare Node (Typecheck) | 108.62 (104.29–112.42) |
| Gate noop (Tests)                     | 167.04 (152.09–184.14) |
| Gate noop minus bare Node (Tests)     |  113.64 (99.21–129.31) |
| Gate noop (Build)                     | 161.98 (159.78–183.27) |
| Gate noop minus bare Node (Build)     | 109.72 (104.96–128.44) |
| Gate noop (Smoke)                     | 160.30 (157.92–183.54) |
| Gate noop minus bare Node (Smoke)     | 107.42 (103.10–128.71) |

## Implementation plan for v2

1. **Make the verdict and evidence explicit.** Add the strict package-local config and schema, generic setup and checks, and onboarding presets. Keep configuration success as metadata so PASS rows correspond to command exits. Give a reported policy waiver its own machine-readable `waived` reason. Preserve install and setup failures, write the report before exit, and assert in an embedded workflow step that its verdict agrees with the checks step. Add focused regressions for each review finding before changing behavior or record the decision where the finding is a design choice.
2. **Resolve managers once and measure download caching first.** Share detection and locked-install arguments across the runtime, onboarding, and verification. Verify the selected manager and its integrity before consumer scripts run. Key the download store by OS, architecture, actual manager version, Node major and lockfile hash. Restore in PR context. Save only on a default-branch push after an exact-key miss and a successful install. GitHub scopes PR-written caches to the PR merge ref. Measure cache transfer before claiming a hosted speedup. [GitHub cache scoping](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching#restrictions-for-accessing-a-cache).
3. **Reduce unnecessary execution.** Add Git-based `paths` with a full-run fallback for unknown changes and control-file edits, then measure headless browser setup and opt-in concurrent batches. Keep package-manager script behavior by default. Evaluate `node --run` only where the package can opt into its execution contract, since scripts can depend on manager variables even when they have no hooks. Compare using the no-op probes and fixtures with hooks and environment-dependent scripts. [Node 24 CLI documentation](https://nodejs.org/download/release/v24.22.2/docs/api/cli.html#--run).
4. **Add Bun and verify the release candidate.** Verify exact-version Bun provisioning and frozen installs with scripts disabled. Run the full checklist plus Biome and Bun failure fixtures. Document migration, version pin upgrades, and design choices. Provide public and private consumer canary commands that exercise the embedded runtime from a pinned release candidate. Record cross-repository and hosted results when a maintainer can run them.
