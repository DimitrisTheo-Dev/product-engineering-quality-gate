# Local command contract

Use the detected package manager to run package scripts: `npm run NAME`, `pnpm run NAME`, or `yarn run NAME`. Read `packageManager` and the lockfile; do not substitute a manager. In an adopted root, `quality:format` runs Oxfmt check mode and `quality:lint` runs Oxlint with warnings blocking.

Required workflow commands are local Oxfmt `--check`, local Oxlint `--deny-warnings --ignore-pattern '**/node_modules/**'`, selected typecheck (default `typecheck`), selected tests (`test:ci` then `test`), and selected build (default `build`). A test script with watch mode needs an explicit CI alternative.

Optional commands from the caller:

- `extra-script`, `product-script`, `smoke-script`: run when selected.
- React Doctor: `react-doctor . --yes --no-score --no-supply-chain --blocking error`; use only on React packages. Its separate license applies.
- Fallow, deep runs: `fallow dead-code --fail-on-issues --fail-on-parse-error`, `fallow dupes --fail-on-issues`, `fallow health --fail-on-issues --fail-on-parse-error`, `fallow architecture --fail-on-issues --fail-on-parse-error`.
- `e2e-script`, `security-script`: deep runs only.

Prefer existing project scripts over recreating test logic. If native dependencies need setup, inspect the explicit `extra-script`; dependency lifecycle hooks are disabled during CI installation. The normal gate never runs paid AI work.

See the central repository's [configuration](https://github.com/DimitrisTheo-Dev/product-engineering-quality-gate/blob/main/docs/configuration.md) for updated inputs. Consumer workflows should use an immutable release SHA.
