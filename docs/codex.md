# Codex integration

The small `product-engineering-quality-gate` skill activates for adopted repositories or explicit invocation. It reads existing instructions/scripts, runs relevant checks, verifies the main user outcome, limits repair loops to two attempts per blocking issue, and reports evidence and gaps. It does not authorize enrollment, publication, or unrelated edits. Its reference carries the optional-tool command contract.

Current official Codex documentation identifies `.agents/skills` in repositories and `~/.agents/skills` for user-wide discovery. Local installations may also have a legacy `~/.codex/skills` or `$CODEX_HOME/skills`. The installer lists these paths before writing, defaults to the current documented user location, and never edits `AGENTS.md`, global instructions, or `config.toml`.

```sh
# From the released central checkout: inspect, then explicitly install.
node scripts/install-codex-skill.mjs --dry-run
node scripts/install-codex-skill.mjs --apply
```

The default destination is `~/.agents/skills/product-engineering-quality-gate`. It copies only the skill and its command reference, refuses to overwrite different content, and makes an identical repeat install a no-op. Restart Codex if it does not appear in `/skills`; invoke it with `$product-engineering-quality-gate`.

For repository-scoped integration, explicitly select `--destination /path/to/repo/.agents/skills/product-engineering-quality-gate`. Commit that small directory with your team if desired. For an older Codex installation, confirm its supported skill paths first and explicitly choose the legacy destination. Avoid duplicate copies with the same skill name; Codex does not merge them.

## Opt out and upgrades

To disable without deleting, add a narrow entry to your own `~/.codex/config.toml`, preserving existing content:

```toml
[[skills.config]]
path = "/absolute/path/to/product-engineering-quality-gate/SKILL.md"
enabled = false
```

Alternatively move only the installed skill folder out of the discovery directory. Restart Codex after configuration changes. No global `AGENTS.md` rollback is needed because the installer never changes it.

Upgrade by diffing the installed skill against a new release, preserving local edits, then copying the reviewed files explicitly. The installer stops on differing content to avoid overwriting a customized skill. Removing/turning off the skill affects local guidance only; GitHub enforcement is controlled by the caller and required-check settings.

See [official local-skill discovery and opt-out documentation](https://developers.openai.com/codex/skills/).
