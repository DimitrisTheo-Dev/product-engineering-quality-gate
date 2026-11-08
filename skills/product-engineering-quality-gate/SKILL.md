---
name: product-engineering-quality-gate
description: Verify focused changes in repositories adopted into product-engineering-quality-gate, and diagnose its CI failures. Use when the caller workflow or quality scripts exist, or when explicitly invoked.
---

Inspect repository instructions, git status, package manager, scripts, and `.github/workflows/product-quality.yml` before changing files. Preserve unrelated work and existing formatting/linting configurations. This skill grants no permission to enroll, commit, publish, or change repository policies.

For adopted repositories:

1. Make the focused change needed for the user's outcome. Use the repository's locked dependencies. Do not fetch fallback lint/format executables with `npx`.
2. Run local `quality:format` and `quality:lint` scripts, then the caller's selected typecheck, tests, and build scripts. Retain existing ESLint or other checks selected by `extra-script`. For a monorepo, inspect root and package scripts and the caller matrix.
3. Run React Doctor only when enabled for a React package. Run Fallow only when enabled and relevant; understand configured baselines and entry points before changing code. Use the local pinned versions and the caller's documented arguments.
4. Verify the main user outcome with a behavior test, smoke test, or direct reproduction. Static checks alone do not establish the outcome. Keep project-specific behavior tests in the project. Synthetic fixtures establish only their fixture contract; never describe them as live provider evidence.
5. Fix relevant defects with at most two focused repair-and-rerun cycles per blocking issue. Do not restructure unrelated code to satisfy complexity or duplication metrics. If progress stops, report the reproduction, diagnostics, attempted fixes, and the decision needed from the user.
6. Report commands actually run, outcomes, skipped/unconfigured/unavailable checks, limitations, and remaining risks. A failed required check remains a failure after report generation.

Use [the command reference](references/checks.md) when translating workflow options into local commands. Read the repository's own configuration before using its examples. Provider-backed evaluation and AI review require separate explicit opt-in; never pass provider credentials to PR code.
