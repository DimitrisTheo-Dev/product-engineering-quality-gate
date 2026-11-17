# v2 acceptance

1. The reusable workflow validates with actionlint and embeds the exact tested runtime. It declares read-only permissions, runs on GitHub-hosted runners with time limits, and leaves checkout credentials unpersisted.
2. Configuration is strict and package-local. The default policy requires typecheck, test, and build or explicit reported waivers. Consumers own commands through exact script names and locked dependencies.
3. A PASS row represents an executed command that exited zero. Missing scripts and failed prerequisites fail the gate. An embedded verifier rejects missing or contradictory reports and outputs the verdict.
4. Presets install exact tool versions. Oxc and Biome fixtures exercise real commands. Biome reports formatting and lint errors. Onboarding is a dry run by default, updates only planned files, and preserves user configuration.
5. Adoption runs against the root or a workspace package. Supported managers install from the committed lockfile with dependency lifecycle hooks disabled. Binary Bun lockfiles and Yarn PnP are rejected when applicable.
6. A cold and warm benchmark records method, spread and changes to wall time. Git-sensitive skips fall back to a full run on ambiguous changes and control-file edits.
7. The dependency download cache restores for pull requests. Saves are limited to successful default-branch pushes after an exact-key miss. The workflow never caches node_modules.
8. The AI assistance workflow remains manual, trusted-branch only, bounded, and disabled by default.
9. The release record identifies what ran, results, and unverified areas. Use the public and private cross-repository canaries before publishing v2.
