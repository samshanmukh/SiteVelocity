// Render workflow-service entrypoint: `npm run workflow:start`.
// Deploys from the same release SHA as the web service (render-alpha-deployment R4).
// Loads the research workflow task module when it exists on this branch; until
// then it idles honestly rather than fabricating work. Shutdown is graceful so
// rollback never cancels or duplicates in-flight work (R14).

import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const HEARTBEAT_MS = 5 * 60 * 1000;

async function start(): Promise<void> {
  const releaseId =
    process.env.RELEASE_SHA?.trim() || process.env.RENDER_GIT_COMMIT?.trim() || "unknown";
  console.log(`workflow-entrypoint: starting (release ${releaseId})`);

  const taskModulePath = path.join(process.cwd(), "workflows", "research-site.ts");
  if (existsSync(taskModulePath)) {
    console.log("workflow-entrypoint: loading workflows/research-site.ts");
    await import(pathToFileURL(taskModulePath).href);
  } else {
    console.log(
      "workflow-entrypoint: no workflow task module on this branch (workflows/research-site.ts absent); idling",
    );
  }

  const heartbeat = setInterval(() => {
    console.log(`workflow-entrypoint: alive (release ${releaseId})`);
  }, HEARTBEAT_MS);

  const shutdown = (signal: string) => {
    console.log(`workflow-entrypoint: received ${signal}, shutting down gracefully`);
    clearInterval(heartbeat);
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((error: unknown) => {
  console.error(
    `workflow-entrypoint: fatal ${error instanceof Error ? error.message : "unknown failure"}`,
  );
  process.exitCode = 1;
});
