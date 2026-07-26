# SiteVelocity RocketRide pipelines

RocketRide is an alternative durable workflow runtime; it does not replace the
SiteVelocity domain logic, evidence rules, or Supabase system of record.

Create and validate these two portable pipeline files with the RocketRide IDE
extension before setting `WORKFLOW_PROVIDER=rocketride`:

- `research-site.pipe` — accepts one `application/json` payload containing
  `organizationId`, `siteId`, and `workflowRunId`.
- `ingest-candidates.pipe` — accepts one `application/json` payload containing
  `organizationId` and `workflowRunId`.

Both pipelines must preserve the supplied workflow run identifier, use bounded
retries, and call the corresponding SiteVelocity workflow implementation. Keep
model and service credentials in RocketRide Cloud or environment variables;
never embed them in a `.pipe` file.

Runtime configuration:

```dotenv
WORKFLOW_PROVIDER=rocketride
ROCKETRIDE_APIKEY=
ROCKETRIDE_URI=https://api.rocketride.ai
ROCKETRIDE_RESEARCH_PIPELINE=pipelines/rocketride/research-site.pipe
ROCKETRIDE_INGEST_PIPELINE=pipelines/rocketride/ingest-candidates.pipe
```

Until both `.pipe` files and the API key are present, the integration is shown
as configured or unconfigured and Render remains the recommended default.
