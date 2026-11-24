# Changelog

## v2.0.0

- Move checks and tool pins into package-local config, with explicit policy waivers and Oxc, Biome, and existing-script presets.
- Record script bodies, installed tool versions, timings, and skip reasons in schema v2. Verify the report against the job outcome.
- Cache package downloads under a default-branch write policy. Add Git path selection, explicit concurrent batches, and opt-in Node script launches.
- Support Bun text lockfiles and exact toolchain pins. Add workspace adoption, v1 migration, pin-only upgrades, and cross-repository canaries.
- Put the pinned package manager on PATH for package scripts, so a script that calls `pnpm` or `yarn` again uses the same version. Found by the dtheo-ui pilot.
- Onboarding adds `.quality-gate/` to `.gitignore` and keeps added dev dependencies sorted, so the Oxc preset passes its own format check. Document local runs.
- Name the fix when Corepack is missing (Node 25 and later). Generate the same workflow on macOS and Linux.
- **Breaking from v1:** inputs move into `quality-gate.config.json`, and the `NOT CONFIGURED` status is replaced by `SKIPPED` rows with a reason. See [MIGRATION.md](MIGRATION.md).

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
