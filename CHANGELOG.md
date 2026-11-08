# Changelog

## v1.0.1

- Fix onboarding and local gate entrypoints silently exiting when invoked through a symlinked checkout/script path. Resolve the invoked file before comparing it with Node's canonical module URL.
- Add regression coverage for both symlinked entrypoints. v1.0.0 remains unchanged; use v1.0.1 for new adoptions.

## v1.0.0

- Reusable, self-contained workflow_call gate for local pinned Oxfmt/Oxlint, existing typecheck/tests/build, and consumer behavior scripts.
- Optional React Doctor, deep Fallow/E2E/dependency checks, Chromium smoke, and explicitly opted-in failure artifacts.
- Accurate PASS/FAIL/SKIPPED/NOT CONFIGURED reports with retained failure exit status.
- Safe dry-run/apply onboarding, isolated React/TS and Node/TS adoption verification, and a small Codex skill.
- Separate manual, trusted-branch-only AI assistance with one request, output/input/time caps, explicit prices/consent, and no PR credentials.
- Public-release security review, immutable release references, and documented rollout/rollback.
