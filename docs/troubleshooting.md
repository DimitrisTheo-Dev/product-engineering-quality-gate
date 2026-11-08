# Troubleshooting and interpreting evidence

| Symptom                                            | Meaning and action                                                                                                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workflow not found before a runner starts          | Verify full SHA/path, public/private access, caller Actions policy, and repo renames. GitHub does not redirect reusable workflow references.                                                |
| Oxfmt/Oxlint unavailable                           | Install exact project devDependencies and commit a matching lockfile. Do not let npx download a fallback.                                                                                   |
| Dependency version range rejected                  | Pin your chosen version explicitly and update the lockfile with the existing package manager. Onboarding will not silently replace it.                                                      |
| Missing typecheck/build                            | Add real project commands or select existing script names. A no-op script would undermine the gate.                                                                                         |
| Tests NOT CONFIGURED                               | No `test:ci`/`test` was detected, or explicitly disabled. Add/select a meaningful test script. This is not a passed test suite.                                                             |
| Fallow/E2E/security SKIPPED                        | Enabled but deferred because `deep` is false. Run a manual/deep invocation when relevant.                                                                                                   |
| All checks SKIPPED after prerequisites fail        | Dependency/runtime/configuration setup was unavailable. Read the first failing step; no code-quality conclusion can be made.                                                                |
| Native dependency or generated client missing      | Install hooks are disabled. Add a reviewed consumer `extra-script` to rebuild/generate only what is needed; do not pass provider/registry secrets to PR code.                               |
| Formatting differs after adoption                  | Existing formatter/config is preserved. Review differences and deliberately migrate or configure Oxfmt. Make a baseline separately; do not automatically reformat unrelated source.         |
| Linter checks generated files                      | Add precise consumer ignores for generated output; node_modules is already excluded by the runtime. Do not hide real source defects with broad ignores.                                     |
| React Doctor enabled on Node package               | Remove the React option or select the React workspace directory. Each selected package must declare React.                                                                                  |
| Fallow reports false dead code/architecture issues | Fix consumer entry points, boundaries, generated paths, and baselines before refactoring. Do not restructure arbitrary code to reduce a metric.                                             |
| Playwright missing browser/system libraries        | Install exact `@playwright/test`, set `playwright: true`, select a browser script; v1 installs Chromium only. Other browsers need consumer setup.                                           |
| Artifact upload name conflict                      | Give each matrix/repeated invocation a unique `report-name`. Artifact upload failure is not silently ignored.                                                                               |
| Reports absent                                     | Cancellation, runner termination, or Node/checkout failure can prevent final report creation. The actual GitHub job conclusion/logs take precedence.                                        |
| npm install/manager bootstrap unavailable          | Check registry/network and the lockfile. Corepack is pinned, not globally installed. A failed install must fail CI.                                                                         |
| AI workflow NOT CONFIGURED/SKIPPED                 | Requires default-branch manual dispatch, confirm=true, ENABLE_AI_ASSIST=true, protected environment, and an explicitly supplied key/model/prices. Normal PRs never trigger it.              |
| Provider HTTP/incomplete/JSON failure              | The opt-in check fails without retry. Output caps and provider compatibility can affect completion; a failure may still be billed. Review supplied prices/budget before manually rerunning. |

## Reading a report

Example: Oxfmt PASS, Oxlint PASS, Typecheck PASS, Tests PASS, Build PASS, Product behavior NOT CONFIGURED means code-quality commands and the existing tests completed. It establishes no product behavior beyond those tests. Add a consumer behavior script to cover the main user outcome.

Example: Oxfmt FAIL, Build PASS means the build completed while formatting failed. The **job fails**. Running independent checks after a failure improves diagnostics; a later PASS never cancels an earlier FAIL.

Example: Fallow SKIPPED on a fast PR means it was deferred, not passed. Example: Prerequisites FAIL followed by Oxfmt SKIPPED means Oxfmt could not run, not that formatting was acceptable. Detailed test counts and assertions are in step logs; the report links its downloadable JSON/Markdown artifact.

Browser artifacts may contain application content, URL parameters, console logs, network headers, and screenshots. Opt in only for sanitized fixtures/test accounts; do not include auth storage state, real documents, or sensitive production data. If a leak occurs, remove the affected artifact/log and rotate the exposed secret through your incident process.

For rollback, revert only the adoption commit or caller SHA and deliberate dependency changes. Remove/adjust the required-check rule before disabling the workflow. Preserve unrelated pending work and the repository's original CI.
