import assert from "node:assert/strict";
import test from "node:test";
import { hashToken, resolveScope } from "../src/auth.js";

const ADMIN_KEY = "admin-secret-key";

/** Lookup stub: maps known token hashes to their site. */
function lookupFrom(entries: Record<string, string>) {
  return async (hash: string) => entries[hash] ?? null;
}

test("hashToken is a deterministic sha256 hex digest", () => {
  const a = hashToken("token-123");
  assert.equal(a, hashToken("token-123"));
  assert.notEqual(a, hashToken("token-124"));
  assert.match(a, /^[a-f0-9]{64}$/);
});

test("resolveScope grants full access to the admin key", async () => {
  const scope = await resolveScope(ADMIN_KEY, ADMIN_KEY, lookupFrom({}));
  assert.equal(scope, "all");
});

test("resolveScope treats a disabled key (null) as fully public", async () => {
  const scope = await resolveScope("", null, lookupFrom({}));
  assert.equal(scope, "all");
});

test("resolveScope rejects an empty credential when a key is set", async () => {
  const scope = await resolveScope("", ADMIN_KEY, lookupFrom({}));
  assert.equal(scope, null);
});

test("resolveScope maps a valid site token to its single site", async () => {
  const lookup = lookupFrom({ [hashToken("site-a-token")]: "site-a" });
  const scope = await resolveScope("site-a-token", ADMIN_KEY, lookup);
  assert.deepEqual(scope, ["site-a"]);
});

test("resolveScope rejects an unknown token", async () => {
  const scope = await resolveScope("bogus-token", ADMIN_KEY, lookupFrom({}));
  assert.equal(scope, null);
});
