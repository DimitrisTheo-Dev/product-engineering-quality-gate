# Architecture

The reusable workflow checks out the consumer repository. It contains the exact tested Node runner as a compressed payload decoded in memory with Node built-ins. The generator and tests check the payload bytes and GitHub's 21,000-character per-step command limit. A final verifier also runs from embedded source, after the consumer scripts. [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsrun).

The install root holds one lockfile. The working directory selects the package and its config. The runtime plans the install, confirms listed exact tool versions, runs setup scripts and checks, and writes evidence. Compatible adjacent checks can run concurrently up to the available CPU count. Logs stay grouped and report order follows the config. Each check has its own timeout and receives SIGTERM before the gate sends SIGKILL.

The gate treats uncertainty as a full run. For a pull request it verifies the checked-out merge's base and head parent SHAs, then diffs the result against the base. For a merge group it verifies that the base is an ancestor of the checked-out group head. It uses Git and remains within the checkout's available history. Pushes, unknown diffs, and control-file changes bypass path filtering.

## Download cache trust

A planning step reads the lockfile and package manager before consumer code executes. It constructs an exact key from platform, architecture, manager and exact version, Node major, and lockfile SHA-256. The workflow chooses a fixed directory under runner temp. npm uses `_cacache`, pnpm its store, Yarn its download cache, and Bun its package download cache. The frozen install still resolves and installs against the checkout's committed lockfile. [Cache action](https://github.com/actions/cache/tree/v5.1.0).

PRs and merge queues use only the restore action. Only a successful push to the default branch saves after an exact-key miss. GitHub scopes entries by branch, key and cache version. Caches written from a normal PR run are scoped to its merge ref and cannot be restored by the base branch. The workflow also explicitly excludes PRs from the save condition. [GitHub cache scoping](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching#restrictions-for-accessing-a-cache).

Download stores contain third-party package data. Keep credentials and private content outside cache paths. Node modules, compiled output, and browser directories are excluded from the reusable workflow cache. The browser study records archive expansion locally. Hosted restore and transfer costs are pending. [Benchmarks](benchmarks.md).

## Execution boundary

The workflow uses read-only contents permissions, hosted ephemeral Ubuntu runners, an unpersisted checkout token, and no declared secrets. Consumer commands are script names passed to the package manager as arguments without a shell at the gate's spawn boundary. The manager then runs the selected package script. Dependency lifecycle hooks are disabled on install. Consumer code still controls its scripts and logs.

The gate strips GitHub file-command handles and gate options from child environments. Reports use plain-text code spans for consumer-controlled values. These measures reduce accidental writes and Markdown injection. Code in the same job still shares the filesystem and user account, which makes the report quality evidence for reviewed code rather than a tamper-proof attestation.

For declared npm, pnpm, and Yarn versions, Corepack from Node 24 provisions the exact manager once. The runtime resolves its entrypoint before running checks, writes an executable shim for each of its commands to the runner-local Corepack directory, and puts that directory first on PATH for the install and the package scripts. Corepack uses registry signatures for registry distributions, and Yarn 4 uses an integrity hash in the package manager pin or the built-in SHA-512 pin for the verified Yarn 4.18.1 fixture. Hosted Corepack bootstrap has a runner-local directory outside the consumer checkout. The manager payload is outside the dependency cache. The pinned official Bun setup action provisions the declared Bun version when the planner selects a text Bun lockfile. The runner itself remains on Node. [Corepack documentation](https://github.com/nodejs/corepack#when-authoring-packages).

The AI assist workflow runs separately under explicit manual consent and committed default-branch code. [AI assistance](ai-assistance.md).
