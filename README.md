# product-engineering-quality-gate

[![CI](https://github.com/DimitrisTheo-Dev/product-engineering-quality-gate/actions/workflows/ci.yml/badge.svg)](https://github.com/DimitrisTheo-Dev/product-engineering-quality-gate/actions/workflows/ci.yml)

A reusable GitHub Actions gate for JS/TS repositories, with safe onboarding and honest evidence about what was checked. Start with Oxfmt, Oxlint, typecheck, configured tests, and build. Add behavior tests and deeper analysis when they serve the product.

Consumers keep their package scripts and tool configuration. One small caller invokes the central workflow at an immutable commit. There is no hosted service, automatic enrollment, auto-merge, or paid AI work in the PR gate.

## Five-minute quickstart

Requires Node 24+, Git, and a target repository with `package.json`. Start on a reviewable branch. Existing typecheck/build scripts and a lockfile are required for a green gate; onboarding reports gaps without inventing successful checks.

```sh
git clone --branch v1.0.0 --depth 1 https://github.com/DimitrisTheo-Dev/product-engineering-quality-gate.git quality-gate-tools
node quality-gate-tools/scripts/onboard.mjs --repo /path/to/your-repo --dry-run
node quality-gate-tools/scripts/onboard.mjs --repo /path/to/your-repo --apply
```

The CLI detects React, the package manager, and scripts, then pins the generated caller to the cloned release's exact commit. Apply adds `quality:format`, `quality:lint`, exact dev dependencies, a lockfile update, and `.github/workflows/product-quality.yml`. It preserves existing scripts, CI, configs, and source; conflicting files stop adoption. It does not commit or push.

From the target repository, using npm (see [other managers](docs/onboarding.md)):

```sh
npm ci --ignore-scripts
npm run quality:format
npm run quality:lint
npm run typecheck
npm test                       # when configured; use a non-watch CI script
npm run build
git diff
```

Resolve reported gaps, review the diff, and commit/push through your normal process. Make the observed quality job required only after a green baseline. Existing formatter differences may need a separate, reviewed migration; the CLI never reformats your source.

## What runs

| Layer                      | Checks                                                                                   | Default                                       |
| -------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------- |
| Deterministic code quality | Local pinned Oxfmt check, Oxlint with warnings blocking, existing typecheck and build    | Required                                      |
| Existing tests             | `test:ci`, then `test`, or an explicitly selected script                                 | Run when configured                           |
| Product behavior           | Your `test:product`, `ci:smoke`, or other script                                         | Explicit opt-in                               |
| React                      | Local pinned React Doctor, blocking errors, external scoring/supply-chain calls disabled | Explicit opt-in, React only                   |
| Deeper analysis            | Fallow dead code, duplication, complexity, architecture; E2E; dependency/security script | Explicit opt-in + `deep: true`                |
| AI assistance              | One bounded live synthetic evaluation or advisory review of a committed diff             | Separate manual workflow, disabled by default |

Static checks protect consistency and classes of defects. Behavior tests protect the user outcome only to the extent their assertions and test data represent it. The [document-Q&A fixture](examples/document-qa/README.md) is explicitly synthetic; it proves no real provider behavior.

## Reports you can trust

Each check appears as **PASS**, **FAIL**, **SKIPPED**, or **NOT CONFIGURED** in the job summary. Missing enabled tools and required scripts fail. Every invocation uploads a small versioned JSON/Markdown report with artifact links; reporting never converts failure to success. Detailed test counts remain in command logs. Browser failure traces/screenshots require explicit artifact opt-in and a privacy review.

## Adopt and extend

- [Configuration reference](docs/configuration.md): input defaults, required/optional behavior, report schema.
- [Onboarding](docs/onboarding.md): dry-run/apply, conflicts, supported managers, rollback.
- [React, Node, monorepo, and custom-script examples](docs/examples.md).
- [Architecture and tradeoffs](docs/architecture.md): security boundary, cost, no-cache decision.
- [GitHub access and required checks](docs/github-access.md): public/private restrictions, plans, permissions.
- [Codex integration](docs/codex.md): a small scoped skill, safe installation, opt-out.
- [Optional live evaluation and AI review](docs/ai-assistance.md): explicit consent and spending limits.
- [Release and upgrade policy](docs/releases.md), [troubleshooting](docs/troubleshooting.md), and [verification evidence](docs/verification.md).
- [Official sources and pinned tools](docs/sources.md), [third-party notices](THIRD_PARTY_NOTICES.md), [contribution guide](CONTRIBUTING.md).

MIT licensed. Optional tools retain their own licenses; React Doctor has additional restrictions. No proprietary project material is included.
