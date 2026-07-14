import assert from "node:assert/strict";
import test from "node:test";
import { normalizePath, normalizeReferrer } from "../src/normalization.js";

test("normalizePath keeps only the absolute path", () => {
  assert.equal(normalizePath("/pricing?plan=pro#faq"), "/pricing");
  assert.equal(normalizePath("docs/getting-started?utm=1"), "/docs/getting-started");
  assert.equal(normalizePath("?utm=1"), "/");
  assert.equal(normalizePath(""), "/");
});

test("normalizeReferrer stores only hostnames", () => {
  assert.equal(normalizeReferrer("https://example.com/articles/x?utm=1"), "example.com");
  assert.equal(normalizeReferrer("https://sub.example.com:8443/path"), "sub.example.com");
  assert.equal(normalizeReferrer("not a url"), null);
  assert.equal(normalizeReferrer(undefined), null);
});
