import { createHmac, timingSafeEqual } from "node:crypto";

export type WebhookAuthenticationResult =
  | { authenticated: true; method: "bearer" | "hmac" }
  | { authenticated: false; reason: "missing" | "invalid" | "expired" };

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function authenticateWebhook(input: {
  headers: Headers;
  rawBody: string;
  secret: string;
  now?: () => number;
  toleranceSeconds?: number;
}): WebhookAuthenticationResult {
  const authorization = input.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return safeEqual(authorization.slice(7), input.secret)
      ? { authenticated: true, method: "bearer" }
      : { authenticated: false, reason: "invalid" };
  }

  const timestamp = input.headers.get("x-sitevelocity-timestamp");
  const signature = input.headers.get("x-sitevelocity-signature");
  if (!timestamp || !signature) return { authenticated: false, reason: "missing" };
  if (!/^\d{10}$/.test(timestamp)) return { authenticated: false, reason: "invalid" };

  const nowSeconds = Math.floor((input.now ?? Date.now)() / 1000);
  const requestSeconds = Number(timestamp);
  if (Math.abs(nowSeconds - requestSeconds) > (input.toleranceSeconds ?? 300)) {
    return { authenticated: false, reason: "expired" };
  }

  const expected = `sha256=${createHmac("sha256", input.secret)
    .update(`${timestamp}.${input.rawBody}`)
    .digest("hex")}`;
  return safeEqual(signature, expected)
    ? { authenticated: true, method: "hmac" }
    : { authenticated: false, reason: "invalid" };
}
