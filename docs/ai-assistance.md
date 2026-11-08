# Optional live evaluation and AI-assisted review

The normal gate never uses an LLM or a provider key. `ai-assist.yml` is a separate, disabled-by-default manual workflow. It can also be called by a consumer's **manual default-branch** workflow at an immutable release SHA. Non-manual or non-default-branch callers are skipped, including PR-triggered calls.

Two modes share one narrow request step:

- `synthetic-evaluation`: ask one live model about an invented return-policy sentence; check grounding and abstention in one response. This is a tiny illustrative live evaluation, not evidence about your production product.
- `code-review`: send the last committed default-branch diff (maximum 12,000 characters, lockfile excluded) for advisory findings. It is not a PR review bot, never comments, never executes model output, and never changes merge decisions or files. Inspect findings as untrusted suggestions. A large/root-commit diff fails before any request.

## Explicit enablement

1. Review the workflow/runtime at the pinned release. Confirm that sending synthetic text or your committed source diff to the provider is allowed.
2. Configure a dedicated provider project/key with suitable project-level usage controls. Create the `ai-assist` GitHub environment, restrict it to the default branch, and add required reviewers if your plan supports them. Environment names alone do not impose approval; configure the protection rules explicitly.
3. Store `OPENAI_API_KEY` as an environment secret. Set repository variable `ENABLE_AI_ASSIST=true` only when ready. No provider key is needed for local unit tests or the deterministic PR workflow.
4. Manually dispatch **on the default branch** with `confirm=true`, `mode`, an explicit current model ID, its current uncached input/output USD-per-million prices, and `budget-usd` (default 0.05; maximum 1).

The job checks the event/ref/confirmation/variable before exposing the provider key. It checks out the default branch, uses Node built-ins, installs/runs no consumer dependencies, and keeps the secret only in the API step. No raw model response or source diff artifact is uploaded. Review summaries may include model findings; use a private consumer for private code and inspect your provider's data controls.

## Budget safeguards and limitations

There is at most **one request**, no retries, a fixed **512 output-token cap**, 60-second HTTP timeout, five-minute job limit, bounded input, explicit confirmation, and serialized workflow concurrency. A byte-based preflight estimate plus overhead uses the **prices supplied by the operator** and blocks above the requested budget. Unknown/zero/invalid prices block before a request. `store: false` is set.

This is not a hard provider dollar cap: supplied prices can be wrong, models have different tokenization/billing, incomplete or failed responses may still be billed, and GitHub reruns are new requests. A timeout does not guarantee provider cancellation. Verify [current model pricing](https://developers.openai.com/api/docs/pricing) before dispatch, use a restricted provider project, and enforce any provider-side controls your account supports. Do not represent an estimate as an actual charge. Token usage is reported when the API supplies it.

No live provider call is part of the release acceptance suite. The verification record states whether one was actually attempted. To adapt this to a real product, replace synthetic assertions with versioned project-owned cases and keep provider evaluation separate from cheap fixture contracts. Model output and PR content are data, never executable instructions.

For a consumer, create a manual caller, pin `ai-assist.yml` to the release SHA, pass the same typed inputs, and explicitly map only `OPENAI_API_KEY` (or use the called job's configured environment secret). Never use `secrets: inherit`, a pull_request trigger, a PR checkout ref, or provider credentials in the normal quality gate.
