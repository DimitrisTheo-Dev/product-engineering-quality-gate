# GitHub access, plans, and required checks

The central repository is public by explicit author authorization. A public reusable workflow can be called by public or private repositories when their Actions policy allows it. The caller runs on its own runners/token/billing context. Public workflow code never gains access to the caller's provider secrets unless you explicitly pass them. This PR gate declares no secrets; keep it that way.

For a private fork of the central repository, GitHub requires an explicit Actions access policy on the workflow repository and permission to use it in the caller. Personal private repositories can share eligible actions/workflows with other repositories of the same user; organization access is bounded by its sharing/enterprise policies. A public repository cannot call a workflow hosted in a private repository. Do not solve this by attaching a broad PAT: the workflow reference must be accessible before jobs run. Private workflow access may expose its code to permitted callers' collaborators; review GitHub's restrictions before granting it. See [GitHub's access table](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations#access-to-reusable-workflows) and [private sharing guide](https://docs.github.com/en/actions/how-tos/reuse-automations/share-across-private-repositories).

Actions is generally available across GitHub plans, with exceptions such as legacy private per-repository plans. Standard public hosted-runner usage is free; private callers use their account's included usage/storage and applicable billing. Reusable-workflow usage is billed to the caller. Confirm current [billing and availability](https://docs.github.com/en/actions/concepts/billing-and-usage); this project does not assume an organization has a paid plan or unlimited minutes.

Protected branches are available for public repositories on GitHub Free. Private-repository protection requires an eligible paid plan, and organization/enterprise policies can impose additional restrictions. See [protected branch availability](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches). Environment approval/protection availability also varies by plan/visibility; inspect the `ai-assist` environment before enabling paid work.

## Required checks

1. Open a normal adoption PR and observe a green run. Find the actual check name under the reusable call; it usually includes the caller job and `Product engineering quality gate`.
2. In repository Settings → Rules/Branches, require the **observed, unique job check**. A monorepo matrix has multiple distinct names; require the intended entries. Do not require an optional manual/deep job that does not run on every PR.
3. Keep required workflows triggered on every PR. Path-filtered workflows can leave required checks pending. A separate scheduled/manual deep suite can remain optional.
4. Require review of `.github/workflows`, tool configs, and package scripts as appropriate. A contributor who can rewrite the gate can weaken its checks; read-only runtime permissions do not replace review.

No rules, org-wide policies, or branch protections are installed automatically. No PR auto-merge is enabled. If an org blocks public actions, ask its owner to allow the exact reviewed repository/action SHAs or host an approved private copy; do not broadly loosen policy.

## Token and runner contract

The caller and reusable workflow use `contents: read`. Checkout credentials are not persisted. Third-party/official actions are pinned to full commits. There is no write token, PR-comment permission, OIDC token, provider secret, pull_request_target execution, or dependency cache in the deterministic gate. Fork PRs may require a maintainer's first-run approval under GitHub settings. Never move untrusted PR execution to a privileged workflow or self-hosted runner to bypass that approval.

The repository release is published with the maintainer's authenticated `gh` CLI; the reusable gate does not receive those maintainer credentials. Protect immutable release tags from deletion/moving according to your normal repository policy. No organization policy change is required to use this public project.
