import assert from "node:assert/strict";
import test from "node:test";
import { privacyLogger } from "../src/logging.js";

test("request logs do not serialize IP, User-Agent or headers", () => {
  const req = {
    method: "POST",
    url: "/collect",
    ip: "203.0.113.10",
    hostname: "example.com",
    headers: {
      "user-agent": "ExampleBrowser/1.0",
      "x-forwarded-for": "198.51.100.20",
    },
    socket: {
      remoteAddress: "203.0.113.10",
      remotePort: 12345,
    },
  };

  const serialized = privacyLogger.serializers.req(req as never);
  const text = JSON.stringify(serialized);

  assert.deepEqual(serialized, { method: "POST", url: "/collect" });
  assert.equal(text.includes("203.0.113.10"), false);
  assert.equal(text.includes("198.51.100.20"), false);
  assert.equal(text.includes("ExampleBrowser"), false);
  assert.equal(text.includes("headers"), false);
});

test("response logs serialize only status code", () => {
  const serialized = privacyLogger.serializers.res({ statusCode: 204 } as never);

  assert.deepEqual(serialized, { statusCode: 204 });
});
