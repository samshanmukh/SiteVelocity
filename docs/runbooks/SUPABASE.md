# Supabase Operations Runbook

This runbook covers SiteVelocity's local Supabase workflow, safe remote migration procedure, credential boundaries, tenant isolation, and research-data invariants. Run commands from the repository root. Never paste project-specific URLs, references, database passwords, or API keys into source control, issues, logs, or chat.

## Current blocker

Remote operations are blocked: the account currently signed in to the Supabase Dashboard does not have access to the project referenced by the local `.env` configuration.

Do not link, pull, push, rotate keys, or create a replacement project until the intended project owner grants that account access or explicitly approves a different target. After access is granted, verify that the Dashboard project, CLI link, `SUPABASE_URL`, and credentials all belong to the same approved project. Keep every actual identifier and credential out of this runbook.

## Credential boundaries

| Variable | Allowed location | Rules |
| --- | --- | --- |
| `SUPABASE_PUBLISHABLE_KEY` | Server; browser only when browser-side Supabase access is intentionally implemented | Low-privilege and browser-safe, but it is not authorization. All exposed data still requires correct grants and RLS policies. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser bundle | Enable only with an intentional browser Auth/Data API path. Treat it as public. Never substitute a secret or service-role key. |
| `SUPABASE_SECRET_KEY` | Trusted server runtime or secret manager only | Preferred elevated server credential. It uses the `service_role` database role and bypasses RLS. Never expose it in a browser, including localhost, or place it in URLs, logs, fixtures, or client-visible errors. |
| `SUPABASE_SERVICE_ROLE_KEY` | Trusted server runtime or secret manager only | Legacy elevated credential for compatibility only. It bypasses RLS and follows the same restrictions as the secret key. Prefer `SUPABASE_SECRET_KEY`. |
| `SUPABASE_URL` | Server configuration | Not a credential, but keep the project-specific value out of documentation and logs. |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser bundle | Configure only when browser-side Supabase access is implemented. |
| `DATABASE_URL` | Trusted server, migration runner, or secret manager only | Contains database connection material. Never expose it to the browser or commit it. |

Additional rules:

- Keep real values only in ignored local environment files and managed deployment secrets. `.env.example` documents names and boundaries only.
- Authorize and tenant-scope every server operation before using an elevated key; bypassing RLS does not bypass the application's authorization responsibility.
- Use a publishable key for the repository's read-only readiness probe whenever possible.
- Rotate a credential immediately if it may have reached source control, a browser bundle, logs, screenshots, or chat. Do not log even a rejected credential.

## Local workflow

The Supabase CLI is a project development dependency. A Docker-compatible runtime must be running. The local stack is development-only and must not be exposed to external traffic.

Local analytics and Vector Bucket services are disabled in `supabase/config.toml` because the Alpha does not use them. Enable either only when an implemented feature and its tests require it; Postgres, Auth, Storage, Realtime, and Studio remain available for normal development.

```bash
npm install
npm run db:start
npm run db:reset
npm run db:lint
npm run db:test
npm run db:types
npm run db:stop
```

Command behavior:

- `db:start` starts local Postgres, Auth, Storage, and Studio.
- `db:reset` destroys **only the local database**, replays every file under `supabase/migrations/`, then runs `supabase/seed.sql`. Confirm the CLI is targeting local before running it.
- `db:lint` lints the local schema at warning level.
- `db:test` runs local pgTAP database tests.
- `db:types` regenerates `lib/persistence/database.types.ts` from the local `public` schema. The target directory must exist. Regenerate after every accepted schema change.
- `db:stop` stops the local stack while preserving its local data by default.

The committed seed is deterministic configuration only. Keep seed files insert-only, idempotent where practical, and free of production users, personal data, secrets, parcels, evidence, findings, scores, or fabricated property facts.

## Creating migrations

This repository uses forward, imperative SQL migrations as the schema source of truth.

```bash
npx supabase migration new <descriptive-name>
```

Then:

1. Write the change in the new migration; include constraints, indexes, grants, RLS enablement, and policies together.
2. Do not edit or reorder a migration already applied to a shared remote. Add a forward corrective migration.
3. Run `npm run db:reset`, `npm run db:lint`, `npm run db:test`, and `npm run db:types`.
4. Review generated types and the full SQL diff before commit.
5. Avoid Dashboard-only schema changes. If remote drift occurs, capture it with `db pull`, review it, and commit the resulting migration.

Never use a production data dump as a seed. Do not use remote seed deployment for production.

## First remote link and deployment

Resolve the account-access blocker first. This procedure never resets the remote database; the only reset described is the explicit local verification step.

1. Authenticate and confirm the signed-in account can see the approved target project:

   ```bash
   npx supabase login
   npx supabase projects list
   ```

2. Link using the approved project reference without recording its real value in documentation:

   ```bash
   npx supabase link --project-ref <approved-project-ref>
   npx supabase migration list --linked
   ```

3. If the remote already contains schema or Dashboard changes, pull a baseline before pushing:

   ```bash
   npx supabase db pull
   git diff -- supabase/migrations
   ```

   Review every generated statement. Investigate unexpected drops, grants, extensions, ownership changes, or managed `auth`/`storage` changes. Do not accept a pull mechanically.

4. Reproduce the resulting state locally:

   ```bash
   npm run db:start
   npm run db:reset
   npm run db:lint
   npm run db:test
   npm run db:types
   ```

5. Preview the exact pending remote migrations:

   ```bash
   npm run db:push:dry-run
   ```

6. Obtain review of the target project and dry-run output. Apply only after the output contains the expected forward migrations:

   ```bash
   npm run db:push
   npx supabase migration list --linked
   ```

7. Run the verification checklist below. Do not use a linked database reset, force migration-history repair, or `--include-seed` as a shortcut. Migration repair requires a separate reviewed recovery plan.

## RLS and database expectations

- Every table reachable through an exposed schema, including each new `public` table, must have RLS enabled and explicit least-privilege grants and policies.
- Tenant-owned rows carry `organization_id`. Authenticated reads require organization membership; edits are restricted by membership role.
- `anon` receives no application-table access. Do not add public data policies without an approved product requirement and security review.
- Research lineage, workflow, evidence, finding, score, action, and snapshot records are service-write/member-read. Browser clients do not write these records directly.
- An RLS policy and a table grant are both required. Test `anon`, authenticated member, non-member, cross-organization, and elevated-server behavior separately.
- A secret or legacy service-role key bypasses RLS. Server code must still validate the acting user, organization, and requested resource.
- New views must use an approved RLS-safe design, such as `security_invoker` where appropriate, or remain in an unexposed schema with client access revoked.
- Review Supabase Security Advisor findings before release; do not dismiss an alert without understanding it.

## Storage expectations

The migrations create two private buckets:

- `sitevelocity-evidence` for evidence documents and derived evidence artifacts.
- `sitevelocity-raw-sources` for preserved raw source payloads and source files.

Both buckets must remain private. Never convert them to public buckets or publish permanent object URLs.

- Object names begin with the owning organization UUID: `<organization-id>/<stable-object-path>`.
- Authenticated reads are membership-scoped by the `storage.objects` policy.
- No authenticated upload, update, or delete policy is granted. Writes are server-only through an authorized elevated component.
- Return a short-lived signed URL or perform an authenticated download only after authorization. Do not expose bucket listings.
- Treat stored raw sources and evidence as append-only. A correction creates a new object and database row with supersession metadata; do not overwrite or delete the prior artifact.
- Preserve checksums, media type, source identity, retrieval time, and database-to-object path linkage.
- Database backups do not include Storage objects. Define and test a separate object backup, retention, and recovery process before production.

## Evidence and snapshot invariants

The database enforces these invariants; application and operational work must preserve them:

- Source records, source links, evidence, findings, finding links, research snapshots, snapshot manifests, events, scores, and next actions reject update and delete operations.
- Correct evidence or findings by appending a new row and setting its supersession reference. Never rewrite history.
- A Research Snapshot is an immutable manifest over evidence, findings, agent runs, events, scores, and next actions.
- Only an accepted snapshot with evidence may become active. A stale snapshot cannot replace a newer active snapshot, and a partial snapshot cannot replace a complete one.
- A failed refresh remains diagnostic output and never changes `sites.current_snapshot_id`.
- Use the database activation function for the active-snapshot transition; do not update the pointer ad hoc.

## Verification checklist

Before a remote push:

- [ ] Dashboard access is resolved and the approved target matches the CLI link and local environment configuration.
- [ ] No project identifier, database password, secret key, service-role key, or production data appears in the diff or terminal capture.
- [ ] `npm run db:reset`, `npm run db:lint`, `npm run db:test`, and `npm run db:types` pass locally.
- [ ] `npm run typecheck`, `npm test`, and `npm run build` pass.
- [ ] Every new exposed table has RLS, grants, and explicit tenant-scoped policies.
- [ ] Cross-organization and unauthenticated access tests fail closed.
- [ ] Immutable-record update and delete attempts are rejected.
- [ ] Both SiteVelocity buckets exist, remain private, and enforce organization-prefixed reads.
- [ ] The seed contains configuration only and no production or fabricated property data.
- [ ] `npm run db:push:dry-run` shows only reviewed forward migrations.

After a remote push:

- [ ] Local and remote migration histories agree.
- [ ] The application readiness probe succeeds without exposing a credential or enumerating private data.
- [ ] Authenticated member and non-member RLS checks behave as expected.
- [ ] Private-object access works only through an authorized download or short-lived signed URL.
- [ ] Snapshot activation and failed-refresh fallback behavior remain intact.

## Troubleshooting

### HTTP 401

- Confirm the URL and key were issued by the same approved project.
- Confirm a publishable key was not placed in a secret variable or vice versa.
- A secret key intentionally returns 401 when used from a browser; move the operation to a trusted server and rotate the exposed key.
- Check whether the key was revoked or rotated. Never print the key while diagnosing.

### Permission denied or unexpectedly empty results

- Confirm the request carries the intended authenticated user's current JWT.
- Confirm the user has an `organization_memberships` row for the target organization.
- Check both table grants and RLS policies; satisfying only one is insufficient.
- For Storage, confirm the bucket and that the first object-path segment is the owning organization UUID.
- Do not work around a policy failure by moving a secret key into the client.

### Dashboard project mismatch

- Stop all remote commands.
- Confirm the signed-in Dashboard and CLI accounts belong to the organization that owns the intended project.
- Ask the project owner to grant access, or obtain explicit approval for a different project.
- Once resolved, relink deliberately and update the local environment through the approved secret channel. Never copy the actual project reference, URL, or key into documentation or an issue.

### Migration history or schema drift

- Run `npx supabase migration list --linked` and compare local files with remote history.
- Pull Dashboard-originated schema changes with `npx supabase db pull`, inspect the generated migration, and replay locally.
- Do not run migration repair, edit applied migrations, or reset a linked database without a reviewed recovery plan and backup.

## Official references

- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Local development workflow](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Database seeding](https://supabase.com/docs/guides/local-development/seeding-your-database)
- [Database testing and linting](https://supabase.com/docs/guides/local-development/cli/testing-and-linting)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Private Storage buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)
