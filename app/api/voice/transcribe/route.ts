import { NextResponse } from "next/server";
import { getIntegrationConfig } from "@/lib/config/env";
import { MAX_TRANSCRIPTION_BYTES, transcribeScoutAudio } from "@/lib/providers/elevenlabs";
import { requestContextErrorResponse, resolveRequestContext } from "@/lib/security/request-context";

export const dynamic = "force-dynamic";

const STATUS_BY_CODE = {
  invalid_audio: 400,
  empty_transcript: 422,
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
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_audio" }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof File) || !audio.size || audio.size > MAX_TRANSCRIPTION_BYTES || !audio.type.startsWith("audio/")) {
    return NextResponse.json({ error: "invalid_audio" }, { status: 400 });
  }

  const config = getIntegrationConfig();
  const result = await transcribeScoutAudio(audio, audio.name, {
    apiKey: config.ELEVENLABS_API_KEY,
    modelId: config.ELEVENLABS_STT_MODEL_ID,
  });

  if (result.status === "rejected") {
    return NextResponse.json(
      { error: result.code },
      { status: STATUS_BY_CODE[result.code], headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { text: result.text, languageCode: result.languageCode },
    { headers: { "Cache-Control": "no-store, private" } },
  );
}
