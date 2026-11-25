# Cross-repository canary

The fixture installs one exact dependency and runs tests and a build. A manual run can select an
intentionally missing build command. The same fixture works for a public consumer and a private
consumer that is allowed to call the public central workflow.

From the central checkout, use the reviewed release candidate SHA once it is reachable on GitHub.
The following commands use Bash and an authenticated GitHub CLI account with permission to create
both repositories.

```bash
export RC_SHA="$(git rev-parse HEAD)"
[[ "$RC_SHA" =~ ^[a-f0-9]{40}$ ]] || exit 1
owner="$(gh api user --jq .login)"
stamp="$(date -u +%Y%m%d%H%M%S)"
canary_root="$(mktemp -d)"

for visibility in public private; do
  name="quality-gate-v2-canary-$visibility-$stamp"
  dir="$canary_root/$name"
  mkdir "$dir"
  cp -R examples/canary/. "$dir/"
  node --input-type=module -e '
    import { readFileSync, writeFileSync } from "node:fs";
    const path = process.argv[1];
    const placeholder = "a".repeat(40);
    const workflow = readFileSync(path, "utf8");
    if (!workflow.includes(placeholder)) throw new Error("Missing release SHA placeholder");
    writeFileSync(path, workflow.replace(placeholder, process.env.RC_SHA));
  ' "$dir/.github/workflows/product-quality.yml"
  git -C "$dir" init -b main
  git -C "$dir" add .
  git -C "$dir" commit -m "Add pinned quality gate canary"
  gh repo create "$owner/$name" "--$visibility" --source "$dir" --remote origin --push
done
```

For each repository, inspect the default-branch run, dispatch the failure case, then download each
report. Use the names created above and the run IDs shown by `gh run list`.

```sh
gh run list --repo "$CANARY_REPO" --workflow product-quality.yml
gh run watch "$PASS_RUN_ID" --repo "$CANARY_REPO" --exit-status
gh workflow run product-quality.yml --repo "$CANARY_REPO" --ref main -f expect-failure=true
gh run list --repo "$CANARY_REPO" --workflow product-quality.yml
gh run watch "$FAIL_RUN_ID" --repo "$CANARY_REPO" --exit-status
gh run download "$PASS_RUN_ID" --repo "$CANARY_REPO" --name canary-quality-report --dir pass-report
gh run download "$FAIL_RUN_ID" --repo "$CANARY_REPO" --name canary-quality-report --dir fail-report
```

Expect success for the push and failure for the manual probe. Confirm `passed: true` and
`passed: false` in the two reports. Confirm the probe failed because Build names a missing script.
Open a docs-only PR after the successful push to observe cache restore without a save. Record run
URLs, conclusions, artifacts, and cache behavior before piloting one product.
[GitHub CLI repository creation](https://cli.github.com/manual/gh_repo_create).
