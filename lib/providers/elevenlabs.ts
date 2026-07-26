import "server-only";
import { fetchWithTimeout } from "./http";

const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
const DEFAULT_MODEL_ID = "eleven_flash_v2_5";
const DEFAULT_STT_MODEL_ID = "scribe_v2";
const MAX_SPEECH_CHARACTERS = 1_000;
export const MAX_TRANSCRIPTION_BYTES = 15 * 1024 * 1024;

export interface ElevenLabsSpeechConfig {
  apiKey?: string;
  voiceId?: string;
  modelId?: string;
}

export interface ElevenLabsTranscriptionConfig {
  apiKey?: string;
  modelId?: string;
}

export type ElevenLabsSpeechRequest = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type SpeechResult =
  | { status: "generated"; audio: ArrayBuffer; contentType: string }
  | { status: "rejected"; code: "invalid_text" | "unconfigured" | "unauthorized" | "rate_limited" | "provider_error" };

export type TranscriptionResult =
  | { status: "transcribed"; text: string; languageCode?: string }
  | { status: "rejected"; code: "invalid_audio" | "empty_transcript" | "unconfigured" | "unauthorized" | "rate_limited" | "provider_error" };

export async function synthesizeScoutSpeech(
  text: string,
  config: ElevenLabsSpeechConfig,
  request: ElevenLabsSpeechRequest = fetchWithTimeout,
): Promise<SpeechResult> {
  const normalizedText = text.trim();
  if (!normalizedText || normalizedText.length > MAX_SPEECH_CHARACTERS) {
    return { status: "rejected", code: "invalid_text" };
  }
  if (!config.apiKey) return { status: "rejected", code: "unconfigured" };

  const voiceId = config.voiceId?.trim() || DEFAULT_VOICE_ID;
  const modelId = config.modelId?.trim() || DEFAULT_MODEL_ID;
  const url = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`);
  url.searchParams.set("output_format", "mp3_44100_128");
  url.searchParams.set("enable_logging", "false");

  try {
    const response = await request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": config.apiKey,
      },
      body: JSON.stringify({ text: normalizedText, model_id: modelId }),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) return { status: "rejected", code: "unauthorized" };
      if (response.status === 429) return { status: "rejected", code: "rate_limited" };
      return { status: "rejected", code: "provider_error" };
    }

    return {
      status: "generated",
      audio: await response.arrayBuffer(),
      contentType: response.headers.get("content-type") || "audio/mpeg",
    };
  } catch {
    return { status: "rejected", code: "provider_error" };
  }
}

export async function transcribeScoutAudio(
  audio: Blob,
  filename: string,
  config: ElevenLabsTranscriptionConfig,
  request: ElevenLabsSpeechRequest = (input, init) => fetchWithTimeout(input, init, 30_000),
): Promise<TranscriptionResult> {
  if (!audio.size || audio.size > MAX_TRANSCRIPTION_BYTES || !audio.type.startsWith("audio/")) {
    return { status: "rejected", code: "invalid_audio" };
  }
  if (!config.apiKey) return { status: "rejected", code: "unconfigured" };

  const form = new FormData();
  form.append("file", audio, filename || "scout-question.webm");
  form.append("model_id", config.modelId?.trim() || DEFAULT_STT_MODEL_ID);
  form.append("tag_audio_events", "false");

  try {
    const response = await request("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": config.apiKey },
      body: form,
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) return { status: "rejected", code: "unauthorized" };
      if (response.status === 429) return { status: "rejected", code: "rate_limited" };
      return { status: "rejected", code: "provider_error" };
    }

    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || !("text" in payload) || typeof payload.text !== "string") {
      return { status: "rejected", code: "provider_error" };
    }

    const text = payload.text.trim();
    if (!text) return { status: "rejected", code: "empty_transcript" };
    const languageCode = "language_code" in payload && typeof payload.language_code === "string"
      ? payload.language_code
      : undefined;
    return { status: "transcribed", text, languageCode };
  } catch {
    return { status: "rejected", code: "provider_error" };
  }
}
