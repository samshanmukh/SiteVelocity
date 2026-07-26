import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ManagedIngestionBatchSchema } from "@/lib/ingestion/managed-batch";
import { getIntegrationConfig } from "@/lib/config/env";
import {
  acceptManagedIngestionBatch,
  ManagedIngestionError,
} from "@/lib/persistence/managed-ingestion-store";
import { authenticateWebhook } from "@/lib/security/webhook-auth";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const PRIVATE_HEADERS = { "Cache-Control": "no-store, private" };

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id")?.trim() || randomUUID();
  const headers = { ...PRIVATE_HEADERS, "X-Request-Id": requestId };
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload exceeds the 2 MiB limit." }, { status: 413, headers });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload exceeds the 2 MiB limit." }, { status: 413, headers });
  }

  const config = getIntegrationConfig();
  if (!config.WEBHOOK_SIGNING_SECRET || !config.SITEVELOCITY_ORGANIZATION_ID) {
    return NextResponse.json({ error: "Managed ingestion is not configured." }, { status: 503, headers });
  }
  const authentication = authenticateWebhook({
    headers: request.headers,
    rawBody,
    secret: config.WEBHOOK_SIGNING_SECRET,
  });
  if (!authentication.authenticated) {
    return NextResponse.json({ error: "Webhook authentication failed." }, { status: 401, headers });
  }

  let input: unknown;
  try {
    input = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400, headers });
  }
  const parsed = ManagedIngestionBatchSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Managed ingestion payload failed schema validation.", issues: parsed.error.issues },
      { status: 422, headers },
    );
  }
  if (parsed.data.organizationId !== config.SITEVELOCITY_ORGANIZATION_ID) {
    return NextResponse.json({ error: "Webhook tenant does not match this deployment." }, { status: 403, headers });
  }

  try {
    const accepted = await acceptManagedIngestionBatch(parsed.data, rawBody);
    return NextResponse.json({
      batchId: accepted.batch.id,
      externalBatchId: accepted.batch.batchId,
      datasetKey: accepted.batch.datasetKey,
      recordCount: accepted.batch.records.length,
      replayed: accepted.replayed,
      authentication: authentication.method,
    }, { status: accepted.replayed ? 200 : 202, headers });
  } catch (error) {
    if (error instanceof ManagedIngestionError && error.code === "batch_conflict") {
      return NextResponse.json(
        { error: "This provider batch ID was already accepted with different content." },
        { status: 409, headers },
      );
    }
    console.error("managed Nexla ingestion failed", { requestId, error });
    return NextResponse.json({ error: "Managed ingestion could not be persisted." }, { status: 503, headers });
  }
}
