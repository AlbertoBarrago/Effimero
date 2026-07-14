import assert from "node:assert/strict";
import test from "node:test";
import { visitorHash } from "../src/hash.js";

test("visitorHash is deterministic for the same daily inputs", () => {
  const first = visitorHash("203.0.113.10", "ExampleBrowser/1.0", "salt-a", "site-a");
  const second = visitorHash("203.0.113.10", "ExampleBrowser/1.0", "salt-a", "site-a");

  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("visitorHash changes when privacy boundaries change", () => {
  const base = visitorHash("203.0.113.10", "ExampleBrowser/1.0", "salt-a", "site-a");

  assert.notEqual(base, visitorHash("203.0.113.10", "ExampleBrowser/1.0", "salt-b", "site-a"));
  assert.notEqual(base, visitorHash("203.0.113.10", "ExampleBrowser/1.0", "salt-a", "site-b"));
  assert.notEqual(base, visitorHash("203.0.113.11", "ExampleBrowser/1.0", "salt-a", "site-a"));
});
