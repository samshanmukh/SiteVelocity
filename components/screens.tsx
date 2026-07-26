"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  agentLabel,
  runStatusColor,
  siteStatus,
  type AppData,
  type NavItem,
  type PaneMode,
  type UiState,
} from "./model";
import { MapboxOpportunityMap } from "./mapbox-opportunity-map";
import { developmentEventsFromAppData } from "@/lib/view/development-events";
import { commandId, waitForWorkflow } from "./workflow-client";

type Patch = (partial: Partial<UiState>) => void;
type OpenPane = (mode: PaneMode, extra?: Partial<UiState>) => void;

function scoreOf(data: AppData, siteId: string, key: "strategyFit" | "developmentReadiness" | "evidenceConfidence"): number | null {
  const snapshot = data.snapshots[siteId];
  if (key === "strategyFit") {
    return data.candidates?.sites.find((s) => s.id === siteId)?.strategyFit.output.score ?? null;
  }
  const run = snapshot?.scores[key];
  return run ? run.output.score : null;
}

/* ------------------------------------------------------------------ */
export function CommandCenter({ data, patch, openPane }: { data: AppData; ui: UiState; patch: Patch; openPane: OpenPane }) {
  const sites = data.candidates?.sites ?? [];
  const researched = sites.filter((s) => data.snapshots[s.id]);
  const allRuns = Object.values(data.snapshots).flatMap((s) => s.agentRuns);
  const actions = Object.values(data.snapshots).map((s) => s.nextAction).filter((a) => a !== null);
  const developmentEvents = developmentEventsFromAppData(data);
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div>
      <h1 className="sv-h1">What needs my attention?</h1>
      <p className="sv-sub">{today} · San José Multifamily / Mixed-Use Redevelopment · {data.candidates ? `${data.candidates.funnel.shortlisted} candidates on the board` : "no candidates ingested yet"}</p>

      <div className="sv-grid2" style={{ marginTop: 18 }}>
        <div className="sv-cards">
          <section className="sv-panel">
            <div className="sv-panel-pad" style={{ borderBottom: "1px solid var(--border-section)" }}>
              <div className="sv-section-label" style={{ marginBottom: 0 }}>Priority Opportunities</div>
            </div>
            {researched.slice(0, 3).map((site) => {
              const status = siteStatus(site, data.snapshots[site.id]);
              const fit = scoreOf(data, site.id, "strategyFit");
              const ready = scoreOf(data, site.id, "developmentReadiness");
              const conf = scoreOf(data, site.id, "evidenceConfidence");
              const risk = data.snapshots[site.id]?.findings.find((f) => f.status === "unknown" || f.status === "conflicting");
              return (
                <div key={site.id} className="sv-row" onClick={() => patch({ siteId: site.id, module: "dossier", dossierTab: "snapshot" })}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <strong style={{ fontSize: 12.5 }}>{site.address ?? `APN ${site.apnFormatted}`}</strong>
                      <span className="sv-pill" style={{ background: status.bg, color: status.color }}>{status.label}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>{site.jurisdiction} · {site.strategyFit.output.drivers[0]?.reason ?? ""}</div>
                    {risk ? <div style={{ fontSize: 11, color: "var(--amber-text)", marginTop: 2 }}>⚠ {risk.note?.split(".")[0] ?? risk.field.replace(/_/g, " ")}</div> : null}
                  </div>
                  <div className="sv-score" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    FIT {fit ?? "—"}<br />RDY {ready ?? "—"}<br />CONF {conf ?? "—"}
                  </div>
                </div>
              );
            })}
            {researched.length === 0 ? <div className="sv-empty">Run `npm run ingest` and `npm run research` to populate real candidates.</div> : null}
          </section>

          <section className="sv-panel">
            <div className="sv-panel-pad" style={{ borderBottom: "1px solid var(--border-section)", display: "flex", alignItems: "center", gap: 8 }}>
              <div className="sv-section-label" style={{ marginBottom: 0 }}>Development Events</div>
              <span className="sv-badge" style={{ background: "var(--green-bg)", color: "var(--green-text)" }}>{developmentEvents.length} OBSERVED</span>
            </div>
            {developmentEvents.slice(0, 4).map((event) => (
              <div className="sv-row" key={event.id} onClick={() => patch({ module: "devevents", siteId: event.siteId })}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{event.title}</div>
                  <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>{event.year} · {event.siteName}</div>
                </div>
              </div>
            ))}
            {developmentEvents.length === 0 ? <div className="sv-panel-pad sv-note">No evidence-backed development events have been observed yet.</div> : null}
          </section>
        </div>

        <div className="sv-cards">
          <section className="sv-panel">
            <div className="sv-panel-pad" style={{ borderBottom: "1px solid var(--border-section)" }}>
              <div className="sv-section-label" style={{ marginBottom: 0 }}>Next Actions</div>
            </div>
            {actions.slice(0, 4).map((action) => (
              <div key={action.id} className="sv-row" onClick={() => { patch({ siteId: action.siteId }); openPane("nextstep"); }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{action.title}</div>
                  <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>{action.role}</div>
                </div>
              </div>
            ))}
            {actions.length === 0 ? <div className="sv-empty">No researched sites yet.</div> : null}
          </section>

          <section className="sv-panel sv-panel-pad">
            <div className="sv-section-label">Research Activity</div>
            <div style={{ display: "flex", gap: 18 }} className="mono">
              {(["complete", "queued", "failed"] as const).map((status) => (
                <div key={status}>
                  <div style={{ fontSize: 19, fontWeight: 600 }}>{allRuns.filter((r) => r.status === status).length}</div>
                  <div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-label)" }}>{status}</div>
                </div>
              ))}
            </div>
            <button className="sv-btn2" style={{ marginTop: 12 }} onClick={() => openPane("agents")}>View agent runs</button>
          </section>

          <section className="sv-panel sv-panel-pad" style={{ background: "var(--navy)", border: "none", color: "#C7D2E4" }}>
            <div style={{ fontWeight: 700, color: "#fff", marginBottom: 6 }}>Ask Scout</div>
            <div style={{ fontSize: 11.5, lineHeight: 1.5 }}>Why is a site ranked where it is? What is the biggest unresolved risk? Scout answers from the evidence graph — never from thin air.</div>
            <button className="sv-btn" style={{ marginTop: 10 }} onClick={() => openPane("scout")}>Open Scout</button>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
export function DevelopmentEvents({ data, patch, openPane }: { data: AppData; patch: Patch; openPane: OpenPane }) {
  const events = developmentEventsFromAppData(data);
  return (
    <div>
      <h1 className="sv-h1">Development Events</h1>
      <p className="sv-sub">Evidence-backed planning, entitlement, permit, and development events found during site research.</p>
      <section className="sv-panel" style={{ marginTop: 14 }}>
        {events.map((event) => (
          <div className="sv-row" key={event.id} onClick={() => { patch({ siteId: event.siteId }); openPane("history", { siteId: event.siteId }); }}>
            <div className="mono" style={{ minWidth: 54, color: "var(--accent)", fontWeight: 700 }}>{event.year}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 650, fontSize: 12.5 }}>{event.title}</div>
              <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>{event.siteName}</div>
              <div className="sv-note" style={{ marginTop: 4 }}>{event.description}</div>
            </div>
            <span className="sv-pill" style={{ background: event.evidenceId ? "var(--green-bg)" : "var(--amber-bg)", color: event.evidenceId ? "var(--green-text)" : "var(--amber-text)" }}>
              {event.evidenceId ? "EVIDENCE LINKED" : "VERIFY"}
            </span>
          </div>
        ))}
        {events.length === 0 ? <div className="sv-empty">No development events are present in the accepted research snapshots.</div> : null}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
export function Watchlists({ data, patch, openPane }: { data: AppData; patch: Patch; openPane: OpenPane }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setIssue(null);
    const response = await fetch("/api/watchlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (response.ok) {
      setName("");
      router.refresh();
    } else {
      setIssue("The watchlist could not be created. Use a unique name and try again.");
    }
    setBusy(false);
  };

  const addSite = async (watchlistId: string, siteId: string) => {
    if (busy) return;
    setBusy(true);
    setIssue(null);
    const response = await fetch(`/api/watchlists/${encodeURIComponent(watchlistId)}/sites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId }),
    });
    if (response.ok) router.refresh();
    else setIssue("The site could not be added to the watchlist.");
    setBusy(false);
  };

  const sites = data.candidates?.sites ?? [];
  const alerts = data.watchlists.flatMap((watchlist) => watchlist.siteIds.flatMap((siteId) => {
    const changes = data.snapshots[siteId]?.changes;
    if (!changes?.fromSnapshotId) return [];
    return changes.changes.filter((change) => change.material).map((change) => ({ watchlist, siteId, change }));
  }));
  return (
    <div>
      <h1 className="sv-h1">Watchlists</h1>
      <p className="sv-sub">Create standing monitoring sets for sites. Accepted snapshot changes become evidence-backed Development Events.</p>
      <section className="sv-panel sv-panel-pad" style={{ marginTop: 14 }}>
        <div className="sv-section-label">New watchlist</div>
        <div style={{ display: "flex", gap: 8, maxWidth: 560 }}>
          <input className="sv-search" aria-label="Watchlist name" placeholder="e.g. Downtown entitlement targets" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void create(); }} />
          <button className="sv-btn" disabled={!name.trim() || busy} onClick={() => void create()}>{busy ? "SAVING…" : "CREATE"}</button>
        </div>
        {issue ? <p style={{ color: "var(--red)", marginTop: 8, fontSize: 11 }}>{issue}</p> : null}
      </section>

      <div className="sv-grid2" style={{ marginTop: 14 }}>
        {data.watchlists.map((watchlist) => (
          <section className="sv-panel" key={watchlist.id}>
            <div className="sv-panel-pad" style={{ borderBottom: "1px solid var(--border-section)" }}>
              <div style={{ fontWeight: 700 }}>{watchlist.name}</div>
              <div className="sv-note">{watchlist.siteIds.length} monitored site{watchlist.siteIds.length === 1 ? "" : "s"}</div>
            </div>
            {watchlist.siteIds.map((siteId) => {
              const site = sites.find((candidate) => candidate.id === siteId);
              return (
                <div className="sv-row" key={siteId} onClick={() => { patch({ siteId, module: "dossier", dossierTab: "snapshot" }); openPane("overview", { siteId }); }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{site?.address ?? siteId}</div>
                    <div className="mono" style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{site?.apnFormatted ?? "Site identity retained"}</div>
                  </div>
                </div>
              );
            })}
            <div className="sv-panel-pad" style={{ borderTop: watchlist.siteIds.length ? "1px solid var(--border-section)" : undefined }}>
              <select aria-label={`Add site to ${watchlist.name}`} defaultValue="" disabled={busy} onChange={(event) => { if (event.target.value) void addSite(watchlist.id, event.target.value); }}>
                <option value="" disabled>Add a site…</option>
                {sites.filter((site) => !watchlist.siteIds.includes(site.id)).map((site) => <option value={site.id} key={site.id}>{site.address ?? site.apnFormatted}</option>)}
              </select>
            </div>
          </section>
        ))}
        {data.watchlists.length === 0 ? <section className="sv-panel sv-empty">No watchlists yet. Create one to start a standing monitoring set.</section> : null}
      </div>
      <section className="sv-panel" style={{ marginTop: 14 }}>
        <div className="sv-panel-pad" style={{ borderBottom: "1px solid var(--border-section)" }}>
          <div className="sv-section-label" style={{ marginBottom: 0 }}>Recent watchlist alerts</div>
        </div>
        {alerts.map(({ watchlist, siteId, change }) => (
          <div className="sv-row" key={`${watchlist.id}:${siteId}:${change.key}`} onClick={() => { patch({ siteId, module: "dossier", dossierTab: "history" }); openPane("history", { siteId }); }}>
            <span className="sv-dot" style={{ background: change.current?.impact === "fatal_constraint" ? "var(--red)" : "var(--amber)" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 650, fontSize: 12 }}>{change.field.replace(/_/g, " ")} · {change.kind.replace(/_/g, " ")}</div>
              <div className="sv-note">{watchlist.name} · {change.summary}</div>
            </div>
          </div>
        ))}
        {alerts.length === 0 ? <div className="sv-empty">No material changes have been detected after a baseline snapshot yet.</div> : null}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
export function ScoutForm({ data, patch }: { data: AppData; patch: Patch }) {
  const router = useRouter();
  const funnel = data.candidates?.funnel;
  const [thesis, setThesis] = useState(data.thesis);
  const [state, setState] = useState<"idle" | "saving" | "ingesting" | "done" | "error">("idle");
  const [issue, setIssue] = useState<string | null>(null);

  const scout = async () => {
    if (state === "saving" || state === "ingesting") return;
    setIssue(null);
    setState("saving");
    const saved = await fetch("/api/thesis", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: thesis.name,
        market: thesis.market,
        county: thesis.county,
        strategy: thesis.strategy,
        minAcres: thesis.minAcres,
        maxAcres: thesis.maxAcres,
        preferredMinCapacity: thesis.preferredMinCapacity,
      }),
    });
    if (!saved.ok) {
      setIssue("Check the acreage window and development target, then try again.");
      setState("error");
      return;
    }
    setThesis(await saved.json() as AppData["thesis"]);
    setState("ingesting");
    const response = await fetch("/api/candidates/ingest", {
      method: "POST",
      headers: { "Idempotency-Key": commandId() },
    });
    if (!response.ok) {
      setIssue("The thesis was saved, but candidate ingestion could not be started.");
      setState("error");
      return;
    }
    if (response.status === 202) {
      const queued = await response.json() as { id?: unknown };
      if (typeof queued.id !== "string" || (await waitForWorkflow(queued.id)).status !== "succeeded") {
        setIssue("The durable ingestion workflow did not complete successfully.");
        setState("error");
        return;
      }
    }
    setState("done");
    router.refresh();
    patch({ module: "map" });
  };
  return (
    <div>
      <h1 className="sv-h1">What do you want to build?</h1>
      <p className="sv-sub">Define the Development Buy Box. Scout filters and ranks real government-derived candidates — deterministically, with reasons.</p>

      <div className="sv-grid2" style={{ marginTop: 18 }}>
        <section className="sv-panel sv-panel-pad">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div className="sv-field"><label>Development Type (Alpha source scope)</label><input value={thesis.strategy} readOnly /></div>
            <div className="sv-field"><label>Geography (Alpha source scope)</label><input value={`${thesis.market} · ${thesis.county} County`} readOnly /></div>
            <div className="sv-field"><label>Site Size (acres)</label><div style={{ display: "flex", gap: 8 }}><input aria-label="Minimum site acres" type="number" min="0.01" step="0.01" value={thesis.minAcres} onChange={(event) => setThesis({ ...thesis, minAcres: Number(event.target.value) })} /><input aria-label="Maximum site acres" type="number" min="0.02" step="0.01" value={thesis.maxAcres} onChange={(event) => setThesis({ ...thesis, maxAcres: Number(event.target.value) })} /></div></div>
            <div className="sv-field"><label>Preferred Minimum Units</label><input type="number" min="1" step="1" value={thesis.preferredMinCapacity} onChange={(event) => setThesis({ ...thesis, preferredMinCapacity: Number(event.target.value) })} /></div>
          </div>
          <div className="sv-callout" style={{ marginTop: 16 }}>
            <strong>Current live source universe</strong>
            <p className="sv-note">San José AB 2011 opportunity inventory, enriched with Santa Clara County parcels. The acreage and unit preferences above directly drive deterministic qualification and ranking.</p>
          </div>
          <button className="sv-btn" style={{ marginTop: 18 }} disabled={state === "saving" || state === "ingesting"} onClick={() => void scout()}>{state === "saving" ? "SAVING THESIS…" : state === "ingesting" ? "INGESTING…" : "SAVE & SCOUT SITES"}</button>
          {issue ? <p style={{ color: "var(--red)", fontSize: 11, marginTop: 8 }}>{issue}</p> : null}
          {state === "done" ? <p style={{ color: "var(--green-text)", fontSize: 11, marginTop: 8 }}>Thesis saved and candidate set refreshed.</p> : null}
        </section>

        <section className="sv-panel sv-panel-pad">
          <div className="sv-section-label">Live Funnel — Real Sources</div>
          {funnel ? (
            <div className="sv-mono-block">
              {funnel.rawRecords} raw city records (AB 2011 screening, Apr 2024)<br />
              → {funnel.enriched} enriched with county parcel records<br />
              → {funnel.qualified} qualified against the buy box<br />
              → {funnel.shortlisted} shortlisted candidates<br />
              → {Object.keys(data.snapshots).length} deep-researched
            </div>
          ) : (
            <div className="sv-empty">No ingestion run yet.</div>
          )}
          <p className="sv-note" style={{ marginTop: 10 }}>
            Every record keeps its agency, dataset, source URL, and retrieval timestamp. A candidate is not called a
            &ldquo;development opportunity&rdquo; until the evidence supports it.
          </p>
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function matchesSiteSearch(site: NonNullable<AppData["candidates"]>["sites"][number], query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [site.address, site.apn, site.apnFormatted, site.jurisdiction, site.county]
    .some((value) => value?.toLocaleLowerCase().includes(needle));
}

export function OpportunityMap({ data, ui, patch, openPane, query }: { data: AppData; ui: UiState; patch: Patch; openPane: OpenPane; query: string }) {
  const sites = (data.candidates?.sites ?? []).filter((site) => matchesSiteSearch(site, query));
  const located = sites.filter((s) => s.coordinates);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
        <h1 className="sv-h1">Opportunity Map</h1>
        <span className="sv-sub">{located.length} located candidates · real parcel centroids on Mapbox</span>
      </div>
      <div className="sv-map-wrap">
        <div className="sv-map-list">
          {sites.map((site) => {
            const status = siteStatus(site, data.snapshots[site.id]);
            const conf = scoreOf(data, site.id, "evidenceConfidence");
            return (
              <div
                key={site.id}
                className={`sv-map-card${ui.siteId === site.id ? " on" : ""}`}
                style={{ borderLeftColor: ui.siteId === site.id ? status.edge : "transparent" }}
                onClick={() => { patch({ siteId: site.id }); openPane("overview", { siteId: site.id }); }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                  <strong style={{ fontSize: 12 }}>{site.address ?? `APN ${site.apnFormatted}`}</strong>
                  <span className="sv-pill" style={{ background: status.bg, color: status.color }}>{status.label}</span>
                </div>
                <div style={{ fontSize: 10.5, color: "var(--text-2)", marginTop: 3 }}>
                  #{site.rank} · {site.acresDerived ? `${site.acresDerived.value} ac` : "acreage unknown"} · zoning {site.zoningAbbr ?? "—"}
                </div>
                <div className="sv-score" style={{ marginTop: 4 }}>
                  Fit {site.strategyFit.output.score}{conf !== null ? ` · Conf ${conf}` : ""}
                </div>
              </div>
            );
          })}
          {sites.length === 0 ? <div className="sv-empty">No candidates yet.</div> : null}
        </div>
        <div className="sv-map-canvas">
          <MapboxOpportunityMap
            sites={located}
            selectedSiteId={ui.siteId}
            onSelectSite={(siteId) => { patch({ siteId }); openPane("overview", { siteId }); }}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
export function SitesList({ data, patch, openPane, query }: { data: AppData; patch: Patch; openPane: OpenPane; query: string }) {
  void openPane;
  const sites = (data.candidates?.sites ?? []).filter((site) => matchesSiteSearch(site, query));
  return (
    <div>
      <h1 className="sv-h1">Sites</h1>
      <p className="sv-sub">{sites.length} shortlisted candidates from {data.candidates?.funnel.rawRecords ?? 0} raw government records · generated {data.candidates ? new Date(data.candidates.generatedAt).toLocaleString() : "—"}</p>
      <section className="sv-panel" style={{ marginTop: 14 }}>
        <table className="sv-table">
          <thead>
            <tr><th>#</th><th>Address</th><th>APN</th><th>Acres*</th><th>Zoning</th><th>Status</th><th>Fit</th><th>Conf</th></tr>
          </thead>
          <tbody>
            {sites.map((site) => {
              const status = siteStatus(site, data.snapshots[site.id]);
              const conf = scoreOf(data, site.id, "evidenceConfidence");
              return (
                <tr key={site.id} onClick={() => patch({ siteId: site.id, module: "dossier", dossierTab: "snapshot" })}>
                  <td className="mono">{site.rank}</td>
                  <td style={{ fontWeight: 600 }}>{site.address ?? "—"}</td>
                  <td className="mono">{site.apnFormatted}</td>
                  <td className="mono">{site.acresDerived?.value ?? "unknown"}</td>
                  <td className="mono">{site.zoningAbbr ?? "—"}</td>
                  <td><span className="sv-pill" style={{ background: status.bg, color: status.color }}>{status.label}</span></td>
                  <td className="mono">{site.strategyFit.output.score}</td>
                  <td className="mono">{conf ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sites.length === 0 ? <div className="sv-empty">Run `npm run ingest` to load real candidates.</div> : null}
      </section>
      <p className="sv-note" style={{ marginTop: 8 }}>*Acreage is GIS-derived from county parcel geometry (state-plane area ÷ 43,560) — not a legal survey. Click any row to open the dossier; every value traces to its source in the Evidence tab.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
export function ResearchRuns({ data, ui, openPane }: { data: AppData; ui: UiState; openPane: OpenPane }) {
  const router = useRouter();
  const [refreshState, setRefreshState] = useState<"idle" | "queued" | "running" | "done" | "error">("idle");
  const site = data.candidates?.sites.find((s) => s.id === ui.siteId) ?? data.candidates?.sites[0];
  const snapshot = site ? data.snapshots[site.id] : undefined;
  const providersReady = data.providers.filter((p) => p.status === "connected" || p.status === "configured").length;
  const refresh = async () => {
    if (!site || refreshState === "running") return;
    setRefreshState("running");
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(site.id)}/research`, {
        method: "POST",
        headers: { "Idempotency-Key": commandId() },
      });
      if (!response.ok) throw new Error("research_failed");
      if (response.status === 202) {
        const queued = await response.json() as { id?: unknown };
        if (typeof queued.id !== "string") throw new Error("workflow_id_missing");
        setRefreshState("queued");
        const terminal = await waitForWorkflow(queued.id);
        if (terminal.status !== "succeeded" && terminal.status !== "partial") throw new Error("research_failed");
      }
      setRefreshState("done");
      router.refresh();
    } catch {
      setRefreshState("error");
    }
  };

  return (
    <div>
      <h1 className="sv-h1">Research Runs</h1>
      <p className="sv-sub">{site ? `${site.address ?? site.apnFormatted} · six-agent research roster` : "No site selected"}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
        <button className="sv-btn" disabled={!site || refreshState === "running" || refreshState === "queued"} onClick={() => void refresh()}>
          {refreshState === "queued" ? "QUEUED…" : refreshState === "running" ? "RESEARCHING…" : snapshot ? "REFRESH RESEARCH" : "RUN RESEARCH"}
        </button>
        <span className="sv-note">
          {refreshState === "done" ? "Snapshot refreshed." : refreshState === "error" ? "Refresh failed; the last valid snapshot remains active." : `${data.runtime.persistence.toUpperCase()} persistence · live web research ${data.runtime.liveResearch ? "enabled" : "disabled"}`}
        </span>
      </div>

      <div className="sv-grid2" style={{ marginTop: 14 }}>
        <section className="sv-panel">
          {snapshot?.agentRuns.map((run) => {
            const c = runStatusColor(run.status);
            return (
              <div key={run.id} className="sv-row" onClick={() => openPane("agents")}>
                <span className="sv-dot" style={{ background: c.dot, animation: c.anim ? "svpulse 1.4s ease-in-out infinite" : "none" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 12.5 }}>{agentLabel(run.agent)}</div>
                  <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>{run.summary ?? "—"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: c.text }}>{run.status.toUpperCase()}</div>
                  <div className="mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>{run.sourcesUsed} sources</div>
                </div>
              </div>
            );
          })}
          {!snapshot ? <div className="sv-empty">No research run for this site yet — POST /api/sites/&lt;id&gt;/research or `npm run research`.</div> : null}
          {snapshot && (!data.runtime.liveResearch || providersReady < 3) ? (
            <div className="sv-panel-pad" style={{ background: "var(--amber-bg)", borderTop: "1px solid var(--border-section)", fontSize: 11, color: "var(--amber-text)" }}>
              Development History is waiting on explicit live mode and its providers ({providersReady}/4 configured). Set LIVE_RESEARCH=true with Rtrvr + MiniMax configured, then refresh; free GIS agents still run in partial mode.
            </div>
          ) : null}
        </section>

        <div className="sv-cards">
          <section className="sv-panel sv-panel-pad">
            <div className="sv-section-label">Research Snapshots</div>
            {snapshot ? (
              <div className="sv-callout">
                <div className="mono" style={{ fontSize: 11 }}>{snapshot.snapshot.id}</div>
                <div style={{ fontSize: 11.5, marginTop: 4 }}>
                  {new Date(snapshot.snapshot.createdAt).toLocaleString()} · {snapshot.evidence.length} evidence · {snapshot.findings.length} findings ·{" "}
                  <strong style={{ color: snapshot.snapshot.status === "complete" ? "var(--green-text)" : "var(--amber-text)" }}>{snapshot.snapshot.status.toUpperCase()}</strong>
                </div>
                <p className="sv-note" style={{ marginTop: 6 }}>
                  Snapshots are immutable. A failed refresh records diagnostics and never replaces this one — that is what makes the demo resilient and change-detection possible.
                </p>
              </div>
            ) : <div className="sv-empty">None yet.</div>}
          </section>
          <section className="sv-panel sv-panel-pad">
            <div className="sv-section-label">What changed</div>
            {snapshot?.changes?.fromSnapshotId ? (
              snapshot.changes.changes.length > 0 ? snapshot.changes.changes.map((change) => (
                <div key={change.key} className="sv-callout" style={{ marginTop: 7, borderLeft: `3px solid ${change.material ? "var(--amber)" : "var(--border-accent)"}` }}>
                  <div style={{ fontWeight: 650, fontSize: 11.5 }}>{change.field.replace(/_/g, " ")} · {change.kind.replace(/_/g, " ")}</div>
                  <div className="sv-note" style={{ marginTop: 3 }}>{change.summary}</div>
                </div>
              )) : <p className="sv-note">No finding values or verification states changed from the prior accepted snapshot.</p>
            ) : (
              <p className="sv-note">This is the baseline snapshot. Change cards appear after the next accepted research run.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
export function NextSteps({ data, patch, openPane }: { data: AppData; patch: Patch; openPane: OpenPane }) {
  const entries = Object.entries(data.snapshots)
    .map(([siteId, snap]) => ({ siteId, action: snap.nextAction, site: data.candidates?.sites.find((s) => s.id === siteId) }))
    .filter((e) => e.action && e.site);
  const hero = entries[0];

  return (
    <div>
      <h1 className="sv-h1">Next Steps</h1>
      <p className="sv-sub">The most consequential unresolved question per site — and exactly how to resolve it.</p>

      {hero?.action && hero.site ? (
        <section className="sv-panel" style={{ marginTop: 14, overflow: "hidden" }}>
          <div style={{ background: "var(--accent)", color: "#fff", padding: "8px 14px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em" }}>
            NEXT BEST ACTION · {hero.site.address ?? hero.site.apnFormatted}
          </div>
          <div className="sv-panel-pad">
            <h2 style={{ fontSize: 15, fontWeight: 700 }}>{hero.action.title}</h2>
            <p style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 6 }}>{hero.action.why}</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 12 }}>
              <div>
                <div className="sv-section-label">Who</div>
                <div style={{ fontSize: 12 }}>{hero.action.role}</div>
                <div className="sv-section-label" style={{ marginTop: 12 }}>What we already know</div>
                <div className="sv-mono-block">{hero.action.knownFacts.map((f) => <div key={f}>· {f}</div>)}</div>
              </div>
              <div>
                <div className="sv-section-label">What to ask</div>
                <ol style={{ paddingLeft: 18, fontSize: 12, lineHeight: 1.7 }}>
                  {hero.action.questions.map((q) => <li key={q}>{q}</li>)}
                </ol>
                <div className="sv-section-label" style={{ marginTop: 10 }}>Documents to request</div>
                <div style={{ fontSize: 11.5, color: "var(--text-2)" }}>{hero.action.documents.join(" · ")}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="sv-btn2" onClick={() => { patch({ siteId: hero.siteId }); openPane("nextstep"); }}>Open in pane</button>
              <button className="sv-btn2" onClick={() => patch({ siteId: hero.siteId, module: "dossier", dossierTab: "snapshot" })}>Open dossier</button>
            </div>
          </div>
        </section>
      ) : (
        <div className="sv-empty">Research a site to generate its Next Best Action.</div>
      )}

      <div className="sv-section-label" style={{ marginTop: 18 }}>Queue</div>
      <section className="sv-panel">
        {entries.slice(1).map(({ siteId, action, site }) => (
          <div key={siteId} className="sv-row" onClick={() => { patch({ siteId }); openPane("nextstep"); }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 12 }}>{action!.title}</div>
              <div style={{ fontSize: 11, color: "var(--text-2)" }}>{site!.address ?? site!.apnFormatted} · {action!.role}</div>
            </div>
          </div>
        ))}
        {entries.length <= 1 ? <div className="sv-empty">Research more sites to fill the queue.</div> : null}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
export function PreviewModule({ item }: { item: NavItem }) {
  const roadmap = item.status === "roadmap";
  return (
    <div style={{ maxWidth: 760 }}>
      <span className="sv-badge" style={{ background: roadmap ? "rgba(0,0,0,0.06)" : "var(--bg-chip)", color: roadmap ? "var(--text-label)" : "var(--accent)", fontSize: 10 }}>
        {roadmap ? "ROADMAP" : "PREVIEW"}
      </span>
      <h1 className="sv-h1" style={{ marginTop: 10 }}>{item.label}</h1>
      <p className="sv-sub" style={{ maxWidth: 620 }}>{item.desc}</p>
      <div className="sv-placeholder" style={{ marginTop: 16 }}>
        {item.label} — capability preview. No site-specific results are shown here because none have been computed:
        preview modules never display fabricated data.
      </div>
      {item.bullets?.length ? (
        <section className="sv-panel sv-panel-pad" style={{ marginTop: 14 }}>
          <div className="sv-section-label">Planned capabilities</div>
          <ul style={{ paddingLeft: 18, fontSize: 12.5, lineHeight: 1.8 }}>
            {item.bullets.map((b) => <li key={b}>{b}</li>)}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
export function DataSources({ data }: { data: AppData }) {
  const router = useRouter();
  const [refreshState, setRefreshState] = useState<"idle" | "running" | "done" | "error">("idle");
  const researchSources = Array.from(
    Object.values(data.snapshots)
      .flatMap((snapshot) => snapshot.evidence)
      .reduce((sources, evidence) => {
        const key = `${evidence.source.agency}:${evidence.source.dataset}`;
        const existing = sources.get(key);
        sources.set(key, {
          dataset: evidence.source.dataset,
          agency: evidence.source.agency,
          recordCount: (existing?.recordCount ?? 0) + 1,
          retrievedAt: existing && existing.retrievedAt > evidence.source.retrievedAt ? existing.retrievedAt : evidence.source.retrievedAt,
        });
        return sources;
      }, new Map<string, { dataset: string; agency: string; recordCount: number; retrievedAt: string }>())
      .values(),
  ).sort((a, b) => a.agency.localeCompare(b.agency) || a.dataset.localeCompare(b.dataset));
  const refreshCandidates = async () => {
    if (refreshState === "running") return;
    setRefreshState("running");
    try {
      const response = await fetch("/api/candidates/ingest", {
        method: "POST",
        headers: { "Idempotency-Key": commandId() },
      });
      if (!response.ok) throw new Error("ingestion_failed");
      if (response.status === 202) {
        const queued = await response.json() as { id?: unknown };
        if (typeof queued.id !== "string") throw new Error("workflow_id_missing");
        const terminal = await waitForWorkflow(queued.id);
        if (terminal.status !== "succeeded") throw new Error("ingestion_failed");
      }
      setRefreshState("done");
      router.refresh();
    } catch {
      setRefreshState("error");
    }
  };
  return (
    <div>
      <h1 className="sv-h1">Data Sources</h1>
      <p className="sv-sub">Live provider connections and the government source registry. Truthful states only — nothing is marked connected without a verified probe.</p>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
        <button className="sv-btn" disabled={refreshState === "running"} onClick={() => void refreshCandidates()}>
          {refreshState === "running" ? "REFRESHING…" : "REFRESH GOVERNMENT DATA"}
        </button>
        <span className="sv-note">
          {refreshState === "done" ? "Candidate ingestion completed." : refreshState === "error" ? "Refresh failed or requires an organization admin; existing candidates remain active." : "Runs through the durable ingestion task in production."}
        </span>
      </div>

      <div className="sv-section-label" style={{ marginTop: 16 }}>Runtime providers</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
        {data.providers.map((provider) => (
          <section className="sv-panel sv-panel-pad" key={provider.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <strong style={{ fontSize: 12.5 }}>{provider.name}</strong>
              <span className={`status status-${provider.status}`}>{provider.status === "unconfigured" ? "Needs credentials" : provider.status}</span>
            </div>
            <p className="sv-note" style={{ marginTop: 6 }}>{provider.message}</p>
            {provider.latencyMs !== undefined ? <div className="mono" style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>{provider.latencyMs} ms probe</div> : null}
          </section>
        ))}
      </div>

      <div className="sv-section-label" style={{ marginTop: 20 }}>Government sources (used in this build)</div>
      <section className="sv-panel">
        {(data.candidates?.sources ?? []).map((source) => (
          <div key={source.dataset} className="sv-row" style={{ cursor: "default" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 12 }}>{source.dataset}</div>
              <div style={{ fontSize: 11, color: "var(--text-2)" }}>{source.agency}</div>
            </div>
            <div className="mono" style={{ fontSize: 10.5, color: "var(--text-muted)", textAlign: "right" }}>
              {source.recordCount} records<br />retrieved {new Date(source.retrievedAt).toLocaleString()}
            </div>
          </div>
        ))}
        {data.candidates?.sources.length ? null : <div className="sv-empty">No candidate-source ingestion has completed yet.</div>}
      </section>

      <div className="sv-section-label" style={{ marginTop: 20 }}>Research sources retained in snapshots</div>
      <section className="sv-panel">
        {researchSources.map((source) => (
          <div key={`${source.agency}:${source.dataset}`} className="sv-row" style={{ cursor: "default" }}>
            <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 12 }}>{source.dataset}</div><div style={{ fontSize: 11, color: "var(--text-2)" }}>{source.agency}</div></div>
            <div className="mono" style={{ fontSize: 10.5, color: "var(--text-muted)", textAlign: "right" }}>{source.recordCount} retained evidence record{source.recordCount === 1 ? "" : "s"}<br />latest {new Date(source.retrievedAt).toLocaleString()}</div>
          </div>
        ))}
        {researchSources.length === 0 ? <div className="sv-empty">No accepted research snapshot evidence is available yet.</div> : null}
      </section>
    </div>
  );
}
