# Security

Do not include credentials, private code, or sensitive CI artifacts in a public issue. For a sensitive report, contact the maintainer through GitHub's available private reporting channel or published profile contact method.

The deterministic gate uses read-only repository contents access, does not persist checkout credentials, passes no provider secrets, and runs untrusted PR code only on ephemeral hosted runners. Consumers must preserve those boundaries. Protect workflow/script changes through review, use immutable workflow SHAs, and do not use pull_request_target or a self-hosted runner for untrusted contributions.

Optional browser artifacts and AI review can expose data deliberately supplied by the consumer. They are disabled by default. Read the configuration and AI guidance before enabling them. A clean scanner result is not a guarantee against secrets or vulnerabilities.

Security fixes are published as new versioned releases; existing release tags are never intentionally moved. See the release guide for safe pilot upgrades and rollback.
