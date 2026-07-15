import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOrigin, isOriginAllowed } from "../src/origins.js";

test("normalizeOrigin lowercases and strips trailing slashes", () => {
  assert.equal(normalizeOrigin("HTTPS://Example.com/"), "https://example.com");
  assert.equal(normalizeOrigin("  https://a.example//  "), "https://a.example");
});

test("isOriginAllowed accepts any origin when the list is empty", () => {
  assert.equal(isOriginAllowed("https://anything.example", []), true);
  assert.equal(isOriginAllowed(undefined, []), true);
});

test("isOriginAllowed matches an allowed origin, case- and slash-insensitively", () => {
  const allowed = ["https://example.com"];
  assert.equal(isOriginAllowed("https://example.com", allowed), true);
  assert.equal(isOriginAllowed("https://EXAMPLE.com/", allowed), true);
});

test("isOriginAllowed rejects an origin outside a non-empty list", () => {
  assert.equal(isOriginAllowed("https://evil.example", ["https://example.com"]), false);
});

test("isOriginAllowed rejects a missing Origin when a list is configured", () => {
  assert.equal(isOriginAllowed(undefined, ["https://example.com"]), false);
  assert.equal(isOriginAllowed("", ["https://example.com"]), false);
});

test("isOriginAllowed honors ports as part of the origin", () => {
  const allowed = ["http://localhost:3000"];
  assert.equal(isOriginAllowed("http://localhost:3000", allowed), true);
  assert.equal(isOriginAllowed("http://localhost:5173", allowed), false);
});
