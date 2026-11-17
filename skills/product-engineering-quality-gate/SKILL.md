---
name: product-engineering-quality-gate
description: Verify focused changes in JavaScript or TypeScript repositories using product-engineering-quality-gate v2 and diagnose its CI failures.
---

# Product engineering quality gate

Use this skill to reproduce and diagnose the checks a consumer repository selected for its v2 quality gate. Read its repository instructions, caller workflow, lockfile, package manifests, and `quality-gate.config.json` before running commands.

1. Follow the caller's `working-directory` and `config` inputs to find the selected package and config. In a matrix, inspect each affected package. The checkout root owns the lockfile and dependency installation.
2. Read `setup`, `tools`, `checks`, and `policy.waive` in the config. Run configured setup in order, then each eligible package script using the repository's locked package manager. Check exact dependency pins under `tools` and avoid fetching fallback executables. The workflow disables dependency lifecycle hooks during installation.
3. Follow CI eligibility. Include checks with `tier: deep` when the caller sets `deep: true`; run them locally when they directly exercise the change. Explain skips caused by tiers, waivers, prerequisites, or path selection. If setup fails, resolve that failure before evaluating downstream checks.
4. Exercise the changed user behavior with an existing test, smoke check, or direct reproduction. Use synthetic results as fixture evidence. Review browser artifacts for sensitive content before enabling `browser-evidence`.
5. Diagnose failures from the command, exit status, and uploaded JSON report. Fix relevant defects and rerun affected checks. Preserve unrelated product scripts, formatting and linting rules, and waivers.
6. Report a table with `Check | Status | Evidence`. Give the command and exit result for executed checks, and the reason for skips. Report the user behavior you observed and any limits of the evidence.

Use [the command reference](references/checks.md) for v2 inputs and local commands.
