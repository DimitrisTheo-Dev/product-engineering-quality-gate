import test from "node:test";
import assert from "node:assert/strict";
import { document, grounded, validEvidence, fixtureSession } from "./fixture.mjs";

test("SYNTHETIC: grounded answer carries a valid supporting excerpt", () => {
  assert.equal(validEvidence(grounded, document), true);
  assert.match(grounded.text, /7 days/);
  assert.match(grounded.citations[0].excerpt, /7 days/);
});

test("SYNTHETIC: a question outside the document is explicitly unanswerable", async () => {
  const session = fixtureSession(document);
  const question = "What is the international shipping price?";
  assert.equal(document.text.includes("shipping"), false);
  await session.ask(async () => ({
    kind: "unanswerable",
    text: `The document cannot answer: ${question}`,
    documentId: document.id,
    revision: document.revision,
    citations: [],
  }));
  assert.equal(session.state.response.kind, "unanswerable");
  assert.deepEqual(session.state.response.citations, []);
});

test("SYNTHETIC: fabricated, empty, and mismatched citations are rejected", () => {
  assert.equal(
    validEvidence(
      { ...grounded, citations: [{ excerpt: "Returns accepted for 90 days." }] },
      document,
    ),
    false,
  );
  assert.equal(validEvidence({ ...grounded, documentId: "different-document" }, document), false);
  assert.equal(validEvidence({ ...grounded, citations: [{ excerpt: "" }] }, document), false);
  assert.equal(validEvidence({ ...grounded, citations: [] }, document), false);
});

test("SYNTHETIC: replacing a document invalidates a late response and displayed answer", async () => {
  const session = fixtureSession(document);
  /** @type {(value: any) => void} */
  let finish = () => {};
  const pending = session.ask(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  session.replaceDocument({ ...document, revision: "fixture-v2", text: "No returns accepted." });
  finish(grounded);
  await pending;
  assert.equal(session.state.status, "idle");
  assert.equal(session.state.response, null);
  await session.ask(async () => grounded);
  assert.equal(session.state.status, "error");
  assert.equal(session.state.response, null);
});

test("SYNTHETIC: a request failure is recoverable by retry", async () => {
  const session = fixtureSession(document);
  await session.ask(async () => {
    throw new Error("fixture transport offline");
  });
  assert.equal(session.state.status, "error");
  assert.match(session.state.error ?? "", /retry/);
  await session.ask(async () => grounded);
  assert.equal(session.state.status, "ready");
  assert.deepEqual(session.state.response, grounded);
});
