import { NextResponse } from "next/server";
import { z } from "zod";
import { getIntegrationConfig } from "@/lib/config/env";
import { synthesizeScoutSpeech } from "@/lib/providers/elevenlabs";
import { requestContextErrorResponse, resolveRequestContext } from "@/lib/security/request-context";

export const dynamic = "force-dynamic";

const VoiceRequestSchema = z.object({
  text: z.string().trim().min(1).max(1_000),
});

const STATUS_BY_CODE = {
  invalid_text: 400,
  unconfigured: 503,
  unauthorized: 502,
  rate_limited: 429,
  provider_error: 502,
} as const;

export async function POST(request: Request) {
  try {
    await resolveRequestContext(request, "write");
  } catch (error) {
    return requestContextErrorResponse(error);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = VoiceRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_text" }, { status: 400 });
  }

  const config = getIntegrationConfig();
  const result = await synthesizeScoutSpeech(parsed.data.text, {
    apiKey: config.ELEVENLABS_API_KEY,
    voiceId: config.ELEVENLABS_VOICE_ID,
    modelId: config.ELEVENLABS_MODEL_ID,
  });

  if (result.status === "rejected") {
    return NextResponse.json(
      { error: result.code },
      { status: STATUS_BY_CODE[result.code], headers: { "Cache-Control": "no-store" } },
    );
  }

  return new Response(result.audio, {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "no-store, private",
      "Content-Disposition": "inline; filename=scout-brief.mp3",
    },
  });
}
