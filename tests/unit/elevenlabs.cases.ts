import assert from "node:assert/strict";
import test from "node:test";
import { synthesizeScoutSpeech, transcribeScoutAudio } from "../../lib/providers/elevenlabs";

test("rejects missing configuration and invalid text without a request", async () => {
  let calls = 0;
  const request = async () => {
    calls += 1;
    return new Response();
  };

  assert.deepEqual(await synthesizeScoutSpeech("Hello", {}, request), { status: "rejected", code: "unconfigured" });
  assert.deepEqual(await synthesizeScoutSpeech("", { apiKey: "secret" }, request), { status: "rejected", code: "invalid_text" });
  assert.deepEqual(await synthesizeScoutSpeech("x".repeat(1_001), { apiKey: "secret" }, request), { status: "rejected", code: "invalid_text" });
  assert.equal(calls, 0);
});

test("sends the key only in the ElevenLabs header and returns MP3 bytes", async () => {
  const audio = new Uint8Array([73, 68, 51]);
  const result = await synthesizeScoutSpeech(
    "Evidence-backed answer.",
    { apiKey: "private-key", voiceId: "voice-id", modelId: "eleven_flash_v2_5" },
    async (input, init) => {
      const url = String(input);
      assert.match(url, /\/v1\/text-to-speech\/voice-id/);
      assert.match(url, /output_format=mp3_44100_128/);
      assert.match(url, /enable_logging=false/);
      assert.equal(new Headers(init?.headers).get("xi-api-key"), "private-key");
      assert.doesNotMatch(url, /private-key/);
      assert.deepEqual(JSON.parse(String(init?.body)), {
        text: "Evidence-backed answer.",
        model_id: "eleven_flash_v2_5",
      });
      return new Response(audio, { status: 200, headers: { "content-type": "audio/mpeg" } });
    },
  );

  assert.equal(result.status, "generated");
  if (result.status === "generated") assert.deepEqual(new Uint8Array(result.audio), audio);
});

test("maps provider failures to stable codes without response bodies", async () => {
  for (const [status, code] of [[401, "unauthorized"], [429, "rate_limited"], [500, "provider_error"]] as const) {
    const result = await synthesizeScoutSpeech(
      "Hello",
      { apiKey: "secret" },
      async () => new Response("sensitive provider body", { status }),
    );
    assert.deepEqual(result, { status: "rejected", code });
  }
});

test("transcribes browser audio with Scribe v2 without exposing the API key", async () => {
  const audio = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });
  const result = await transcribeScoutAudio(
    audio,
    "question.webm",
    { apiKey: "private-key" },
    async (input, init) => {
      assert.equal(String(input), "https://api.elevenlabs.io/v1/speech-to-text");
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("xi-api-key"), "private-key");
      assert.equal(headers.get("content-type"), null, "the runtime must add the multipart boundary");
      assert.doesNotMatch(String(input), /private-key/);
      assert.ok(init?.body instanceof FormData);
      assert.equal(init.body.get("model_id"), "scribe_v2");
      assert.equal(init.body.get("tag_audio_events"), "false");
      const uploaded = init.body.get("file");
      assert.ok(uploaded instanceof Blob);
      assert.equal(uploaded.type, "audio/webm");
      return Response.json({ text: "What is the biggest risk?", language_code: "en" });
    },
  );

  assert.deepEqual(result, {
    status: "transcribed",
    text: "What is the biggest risk?",
    languageCode: "en",
  });
});

test("rejects invalid recordings and empty transcripts", async () => {
  let calls = 0;
  const request = async () => {
    calls += 1;
    return Response.json({ text: "" });
  };

  assert.deepEqual(
    await transcribeScoutAudio(new Blob([], { type: "audio/webm" }), "empty.webm", { apiKey: "secret" }, request),
    { status: "rejected", code: "invalid_audio" },
  );
  assert.deepEqual(
    await transcribeScoutAudio(new Blob(["hello"], { type: "text/plain" }), "bad.txt", { apiKey: "secret" }, request),
    { status: "rejected", code: "invalid_audio" },
  );
  assert.equal(calls, 0);

  assert.deepEqual(
    await transcribeScoutAudio(new Blob(["audio"], { type: "audio/webm" }), "question.webm", { apiKey: "secret" }, request),
    { status: "rejected", code: "empty_transcript" },
  );
  assert.equal(calls, 1);
});
