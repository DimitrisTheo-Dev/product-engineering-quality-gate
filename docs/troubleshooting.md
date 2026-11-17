# Troubleshooting

| Symptom                  | What to check                                                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Workflow cannot start    | Confirm the full SHA, workflow path, caller policy, and access to the central repository.                                                      |
| Tool pin rejected        | Find the listed tool in the selected package or an ancestor. Use an exact registry version and a matching lockfile.                            |
| Missing package script   | Match the config to the actual script name. Add the intended command or explicitly waive an omitted policy kind.                               |
| Setup failed             | Read the first FAIL row. Configure native builds, code generation, or browser provisioning explicitly in `setup`.                              |
| Deep check skipped       | Set `deep: true` for the relevant caller invocation.                                                                                           |
| Path-filtered check ran  | The gate runs the full eligible set when Git history is unavailable or a control file changed. Check the configured repository-relative globs. |
| Package manager mismatch | Match `packageManager` to the install-root lockfile. For Bun, convert a binary lockfile to `bun.lock`.                                         |
| Artifact upload failed   | Use a unique `report-name` per call and check the workflow logs for a missing report or invalid path.                                          |

When one row fails and a later build passes, the job still fails. Detailed test output lives in the check log. A missing report or a report that disagrees with the check step also fails verification. [Reporting reference](configuration.md#reporting-model).

For browser evidence, review traces, screenshots, console logs, and captured requests before enabling uploads. Use synthetic data or scrub sensitive application content. For the AI workflow, use its separate [troubleshooting and controls](ai-assistance.md).
