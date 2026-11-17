# Releases and safe upgrades

Publish release tags at reviewed commits. Consumers pin the full commit SHA. Existing tags keep their original commits. Resolve an annotated tag with `git rev-parse 'TAG^{commit}'`.

## v2 release steps

1. Run the full [contribution checklist](../CONTRIBUTING.md) and review pins, licenses, and tracked content. Scan Git history with the pinned Gitleaks binary.
2. Make the reviewed release candidate SHA available to GitHub Actions. Run [the public and private canaries](../examples/canary/README.md) against that candidate. Record actual runs and conclusions in the release notes.
3. Pilot the same SHA in one product repository. Review the migration, run a normal PR and applicable deep checks, and inspect the job verdict and report.
4. Tag and publish the exact candidate commit once verification and the pilot pass. Roll out repository by repository. Revert the adoption patch to roll back.

```sh
git tag -a v2.0.0 "$RC_SHA" -m 'product-engineering-quality-gate v2.0.0'
git push origin v2.0.0
gh release create v2.0.0 --verify-tag --title v2.0.0 --notes-file /path/to/reviewed-release-notes.md
```

The v1 migration changes both caller inputs and the report contract. Future v2 pin-only updates use `onboard --upgrade`. [Migration steps](../MIGRATION.md).

[Review the v2.0.0 release notes](releases/v2.0.0.md).
