// SYNTHETIC CONTRACT FIXTURE. No provider, retrieval system, or Q&A product is implemented here.
export const document = {
  id: "synthetic-return-policy",
  revision: "fixture-v1",
  text: "Unopened items may be returned within 7 days. Contact support to start a return.",
};

export const grounded = {
  kind: "answer",
  text: "Unopened items can be returned within 7 days.",
  documentId: document.id,
  revision: document.revision,
  citations: [{ excerpt: "Unopened items may be returned within 7 days." }],
};

/** Validate citation identity, freshness, and verbatim containment; this does not prove semantic entailment. */
export function validEvidence(response, source) {
  if (response.documentId !== source.id || response.revision !== source.revision) return false;
  if (response.kind === "unanswerable") return response.citations.length === 0;
  return (
    response.kind === "answer" &&
    response.citations.length > 0 &&
    response.citations.every(
      (citation) =>
        typeof citation.excerpt === "string" &&
        citation.excerpt.trim().length > 0 &&
        source.text.includes(citation.excerpt),
    )
  );
}

/** Tiny state contract for adapters to a real product. No model or UI is simulated. */
export function fixtureSession(initialDocument) {
  let source = initialDocument;
  let request = 0;
  /** @type {{status: string, response: any, error: string | null}} */
  let state = { status: "idle", response: null, error: null };
  return {
    get state() {
      return state;
    },
    replaceDocument(next) {
      source = next;
      request++;
      state = { status: "idle", response: null, error: null };
    },
    async ask(transport) {
      const id = ++request;
      const snapshot = source;
      state = { status: "loading", response: null, error: null };
      try {
        const response = await transport(snapshot);
        if (id !== request || snapshot.revision !== source.revision) return;
        state = validEvidence(response, source)
          ? { status: "ready", response, error: null }
          : { status: "error", response: null, error: "Invalid or stale citations; retry." };
      } catch {
        if (id === request)
          state = { status: "error", response: null, error: "Request failed; retry." };
      }
    },
  };
}
