# Synthetic document-Q&A contract fixture

These tests use a short, invented return-policy document and hand-authored responses. They make no provider calls, implement no Q&A product, and provide no evidence of real retrieval, model quality, or production reliability.

Run `npm run test:product` from the central repository. The five tests cover supporting excerpts, explicit abstention, fabricated/mismatched citations, stale response invalidation after a document revision, and retry after a request failure.

`validEvidence` establishes document identity, revision freshness, and exact excerpt containment. It cannot establish semantic entailment: a correct excerpt can accompany a wrong answer. The grounded fixture explicitly checks its expected claim; a real product needs claim-level behavior tests and representative evaluation data.

Adapt the tests to your actual public interface. Reproduce document replacement while a request is in flight, verify that visible answers clear, and verify retry through the real network/UI boundary. Keep these tests in your own repository and pass its script with `product-script: test:product`.

The separate live workflow is a manual, budget-bounded demonstration against this synthetic material. It is disabled by default and is not part of the PR gate.
