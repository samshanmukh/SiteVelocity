import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { readIntegrationConfig } from "../../lib/config/env";
import {
  checkRocketRideConnection,
  resolveRocketRidePipelinePath,
} from "../../lib/providers/rocketride";
import { configuredWorkflowEngine } from "../../lib/providers/workflow";

test("RocketRide pipeline paths are constrained to the repository pipeline directory", () => {
  assert.equal(
    resolveRocketRidePipelinePath("pipelines/rocketride/research-site.pipe"),
    path.resolve(process.cwd(), "pipelines/rocketride/research-site.pipe"),
  );
  assert.throws(() => resolveRocketRidePipelinePath("../research-site.pipe"), /pipelines\/rocketride/);
  assert.throws(() => resolveRocketRidePipelinePath("pipelines/rocketride/research-site.json"), /\.pipe files/);
});

test("workflow selection chooses RocketRide only when its key and pipeline are configured", () => {
  const config = readIntegrationConfig({
    WORKFLOW_PROVIDER: "rocketride",
    ROCKETRIDE_APIKEY: "rr-test-key",
    ROCKETRIDE_URI: "https://api.rocketride.ai",
    ROCKETRIDE_RESEARCH_PIPELINE: "pipelines/rocketride/research-site.pipe",
  });
  const selected = configuredWorkflowEngine(config, "research-site");
  assert.equal(selected?.provider, "rocketride");
  assert.equal(configuredWorkflowEngine(config, "ingest-candidates"), null);
});

test("RocketRide diagnostics do not contact the network without a credential", async () => {
  const diagnostic = await checkRocketRideConnection();
  assert.equal(diagnostic.status, "unconfigured");
  assert.equal(diagnostic.id, "rocketride");
});
