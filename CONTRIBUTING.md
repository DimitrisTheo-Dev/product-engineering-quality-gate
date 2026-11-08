# Contributing

Keep the consumer contract small and errors observable. Do not add paid work, writable permissions, fallback executable downloads, or implicit repository enrollment to the default gate.

```sh
npm ci --ignore-scripts
npm run format
npm run generate
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:product
npm run build
npm run check:workflows
npm run test:adoption
```

The workflow validator requires authenticated `gh` (or `GH_TOKEN` in CI) to fetch a pinned, checksum-verified actionlint binary. No global tooling install is performed. `npm run scan:secrets` similarly scans all local Git refs with a pinned Gitleaks binary. Run it before release and manually inspect content/history too.

Optional maintainer checks: `npm run test:adoption -- --managers` covers npm, pnpm 12.18.0, Yarn 1.22.22, and Yarn 4.18.1; `npm run test:adoption -- --advanced` covers real Fallow and React Doctor on isolated npm fixtures. The manual `Optional advanced tool verification` workflow runs these separately. Combining both flags also tests that cross-product, but freshly released optional dependencies can be blocked by a package manager's release-age policy; never bypass that policy for a green run.

Edit `runtime/gate.mjs` or `runtime/ai-assist.mjs` and the generator, then regenerate the workflow. The generated YAML is intentionally excluded from Oxfmt; exact source embedding is verified in tests/build. Add behavior-oriented failure tests when changing verdicts or onboarding boundaries. Keep synthetic fixtures explicitly labeled. Optional browser verification uses `npm run test:smoke` after installing the pinned local Playwright Chromium.

Review changes on a branch. Do not move published tags, auto-merge contributions, or update consumers without their owners' authorization. Use new release versions and document migration/rollback.
