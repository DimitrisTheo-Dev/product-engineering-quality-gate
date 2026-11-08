# Releases and safe upgrades

Release tags use semantic versions, starting with `v1.0.0`. Treat published version tags as permanent: never move or reuse one. Consumers should pin the full release commit SHA; tags are for discovery and readable release history. There is deliberately no moving `v1` alias in v1.

```sh
git clone --branch v1.0.0 --depth 1 https://github.com/DimitrisTheo-Dev/product-engineering-quality-gate.git quality-gate-tools
git -C quality-gate-tools rev-parse HEAD
```

That commit is the immutable reference the onboarding CLI writes into callers. Resolve annotated tags to their commit (`git rev-parse 'v1.0.0^{commit}'`) rather than copying the tag object's SHA. You can also inspect the release/commit on GitHub. Full SHAs pin code; repository policies/Actions allowlists can still affect execution.

## Consumer upgrade

1. Read the release notes and compare the workflow/runtime and action pins against your current SHA.
2. In one pilot repository, change only the caller's SHA and any explicitly documented input changes. Do not let onboarding overwrite a customized caller.
3. Review tool version changes separately. Consumers own exact dependencies/lockfiles; a workflow update does not silently upgrade Oxfmt/Oxlint/React Doctor/Fallow in their package.json.
4. Run local checks, a normal PR, and the applicable optional/deep checks. Inspect report statuses, test assertions, durations, and artifacts. Test one intentional failure in an isolated branch if changing gate semantics.
5. Roll out repository by repository. Preserve the observed required-check names or update protection deliberately. Revert the SHA to roll back workflow behavior; revert dependency/lock changes separately if needed.

Patch releases fix defects without intentionally changing the input/report contract. Minor releases add optional capabilities; they do not turn paid work on or require new optional tools. Major releases can change defaults/contracts and need a migration note. Security fixes receive a new release rather than changing an existing tag.

## Maintainer release checklist

Run `npm ci --ignore-scripts`, `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:product`, `npm run build`, `npm run check:workflows`, and `npm run test:adoption`. Regenerate workflows after editing either runtime. Run the applicable optional-tool/browser tests. Inspect action/tool pins and third-party licenses.

Commit with public-safe attribution, scan **all Git history** with `npm run scan:secrets`, review tracked content/paths/artifacts manually, and verify that only intended files are tracked. A clean secret scan does not prove confidentiality. Publish the repository only with owner authorization. Run CI and the explicit expected-failure workflow on GitHub; record actual URLs/conclusions in `docs/verification.md`. Distinguish self-consumption from cross-repository verification.

After successful verification, create a new annotated tag and GitHub release at the exact reviewed commit. Record its SHA in the release notes. Example maintainer commands:

```sh
git tag -a v1.0.0 -m 'product-engineering-quality-gate v1.0.0'
git push origin v1.0.0
gh release create v1.0.0 --verify-tag --title 'v1.0.0' --notes-file /path/to/reviewed-release-notes.md
```

Do not run those commands for an existing tag. Never force-push a release, automatically enroll consumers, or change organization policies as part of release publication.
