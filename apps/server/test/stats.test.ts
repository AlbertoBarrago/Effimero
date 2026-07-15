import assert from "node:assert/strict";
import test from "node:test";
import { cappedField, OVERFLOW_FIELD } from "../src/stats.js";

test("cappedField keeps a value already present in the hash, even at the cap", () => {
  assert.equal(cappedField("/pricing", true, 2000, 2000), "/pricing");
});

test("cappedField keeps new values while under the cap", () => {
  assert.equal(cappedField("/new", false, 1999, 2000), "/new");
});

test("cappedField folds new values into the overflow bucket at the cap", () => {
  assert.equal(cappedField("/flood-123", false, 2000, 2000), OVERFLOW_FIELD);
  assert.equal(cappedField("/flood-124", false, 5000, 2000), OVERFLOW_FIELD);
});

test("cappedField treats a non-positive cap as disabled", () => {
  assert.equal(cappedField("/anything", false, 999999, 0), "/anything");
});
