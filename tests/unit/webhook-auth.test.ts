import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { authenticateWebhook } from "../../lib/security/webhook-auth";

const secret = "test-signing-secret";
const rawBody = '{"hello":"world"}';
const timestamp = "1785000000";
const now = () => 1_785_000_000_000;

test("accepts a constant-time bearer credential", () => {
  const headers = new Headers({ authorization: `Bearer ${secret}` });
  assert.deepEqual(authenticateWebhook({ headers, rawBody, secret, now }), {
    authenticated: true,
    method: "bearer",
  });
});

test("accepts a fresh HMAC signature bound to the exact body", () => {
  const signature = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
  const headers = new Headers({
    "x-sitevelocity-timestamp": timestamp,
    "x-sitevelocity-signature": signature,
  });
  assert.deepEqual(authenticateWebhook({ headers, rawBody, secret, now }), {
    authenticated: true,
    method: "hmac",
  });
  assert.deepEqual(authenticateWebhook({ headers, rawBody: `${rawBody} `, secret, now }), {
    authenticated: false,
    reason: "invalid",
  });
});

test("rejects stale signatures and invalid bearer credentials", () => {
  assert.deepEqual(authenticateWebhook({
    headers: new Headers({
      "x-sitevelocity-timestamp": "1784999000",
      "x-sitevelocity-signature": "sha256=invalid",
    }),
    rawBody,
    secret,
    now,
  }), { authenticated: false, reason: "expired" });
  assert.deepEqual(authenticateWebhook({
    headers: new Headers({ authorization: "Bearer wrong" }),
    rawBody,
    secret,
    now,
  }), { authenticated: false, reason: "invalid" });
});
