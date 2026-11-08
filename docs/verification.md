# v1 verification record

This file records observed evidence, not a promise that every optional integration has run. Fixture tests never establish real model/provider behavior.

## Local checkpoints

- Environment: clean new standalone project; existing repositories were not modified. Node 26.10.0/npm 11.19.1 on macOS arm64; GitHub runtime defaults to pinned Node 24.22.2 on Ubuntu 24.04.
- Oxfmt 0.77.0, Oxlint 1.92.0, TypeScript 7.0.2: actual format/lint/typecheck/build executed. Generated workflows checked against their runtime source.
- actionlint 1.7.12: actual workflow syntax validation, checksum-verified release binary.
- Runner/onboarding tests: actual passing and failing tool invocations, missing prerequisites/scripts, deferred checks, immutable versions, traversal/symlink rejection, and timeout behavior. Final counts and remote conclusions are recorded below when available.
- Node/TS and React/TS adoption: isolated temporary Git repositories; dry run changed no target files, apply preserved source/existing CI, repeated apply was byte-idempotent, and actual locked install plus format/lint/typecheck/tests/build passed.
- Synthetic Q&A contract: five tests, no provider calls; exact supporting excerpts, abstention, citation rejection, stale responses, recoverable request failure.
- Chromium smoke: one synthetic browser-plumbing test passed locally; it is not a product E2E suite.

## Remote verification

Pending initial publication and actual GitHub execution. The release will record exact run URLs and conclusions. Self-consuming workflows demonstrate the central repository running itself; they do not prove cross-repository access or enrollment.

## Limits

No existing repository was enrolled. No organization policy or branch protection was changed. Provider-backed evaluation/review is disabled and has not been run. Private dependency installs, Bun, Yarn PnP, Windows, GHES, and production product behavior are outside the verified v1 contract. Public cross-repository execution requires a separate consumer and is not inferred from self-testing.
