export const dynamic = "force-dynamic";

// Platform liveness for Render health checks (render-alpha-deployment R5).
// Performs no database, provider, or network access; the response is bounded,
// uncached, and safe to poll at high frequency. /api/integrations is a provider
// diagnostic surface and is never the platform health path (R15).
export function GET(): Response {
  const releaseId =
    process.env.RELEASE_SHA?.trim() || process.env.RENDER_GIT_COMMIT?.trim() || null;

  return Response.json(
    {
      status: "live",
      releaseId,
      uptimeSeconds: Math.round(process.uptime()),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
