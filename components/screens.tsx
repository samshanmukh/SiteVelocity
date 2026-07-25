"use client";

import { useMemo, useState } from "react";
import {
  agentLabel,
  barColor,
  runStatusColor,
  siteStatus,
  type AppData,
  type NavItem,
  type PaneMode,
  type UiState,
} from "./model";

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
              <span className="sv-badge" style={{ background: "var(--bg-chip)", color: "var(--accent)" }}>PREVIEW</span>
            </div>
            <div className="sv-panel-pad sv-note">
              Continuous event detection (rezonings, expirations, tax distress, infrastructure catalysts) ships after the Alpha:
              it is powered by diffs between Research Snapshots — the snapshot architecture in this build is what makes it possible.
              No live events are shown because none have been detected yet.
            </div>
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
export function ScoutForm({ data, patch }: { data: AppData; patch: Patch }) {
  const funnel = data.candidates?.funnel;
  return (
    <div>
      <h1 className="sv-h1">What do you want to build?</h1>
      <p className="sv-sub">Define the Development Buy Box. Scout filters and ranks real government-derived candidates — deterministically, with reasons.</p>

      <div className="sv-grid2" style={{ marginTop: 18 }}>
        <section className="sv-panel sv-panel-pad">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div className="sv-field"><label>Development Type</label><select defaultValue="mf"><option value="mf">Multifamily / Mixed-Use Residential</option><option>Industrial</option><option>Office</option></select></div>
            <div className="sv-field"><label>Geography</label><select defaultValue="sj"><option value="sj">San José, CA (Santa Clara County)</option></select></div>
            <div className="sv-field"><label>Site Size (acres)</label><div style={{ display: "flex", gap: 8 }}><input defaultValue="0.5" /><input defaultValue="10" /></div></div>
            <div className="sv-field"><label>Development Target</label><input defaultValue="100+ units preferred" /></div>
          </div>
          <div style={{ marginTop: 16 }}>
            <div className="sv-section-label">Prefer</div>
            <div className="sv-checks">
              {["Vacant or underutilized parcels", "Official opportunity inventories (AB 2011 / Housing Element)", "Clean public constraint screens", "Transit / corridor locations"].map((label) => (
                <label className="sv-check" key={label}><input type="checkbox" defaultChecked style={{ accentColor: "#2557C7" }} />{label}</label>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="sv-section-label">Avoid</div>
            <div className="sv-checks">
              {["Special flood hazard areas", "Wetland / habitat flags", "Historic-resource flags", "Waste-site flags"].map((label) => (
                <label className="sv-check" key={label}><input type="checkbox" defaultChecked style={{ accentColor: "#B22730" }} />{label}</label>
              ))}
            </div>
          </div>
          <button className="sv-btn" style={{ marginTop: 18 }} onClick={() => patch({ module: "map" })}>SCOUT SITES</button>
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
export function OpportunityMap({ data, ui, patch, openPane }: { data: AppData; ui: UiState; patch: Patch; openPane: OpenPane }) {
  const sites = data.candidates?.sites ?? [];
  const located = sites.filter((s) => s.coordinates);
  const bounds = useMemo(() => {
    if (located.length === 0) return null;
    const lats = located.map((s) => s.coordinates!.latitude);
    const lons = located.map((s) => s.coordinates!.longitude);
    const pad = 0.01;
    return {
      minLat: Math.min(...lats) - pad, maxLat: Math.max(...lats) + pad,
      minLon: Math.min(...lons) - pad, maxLon: Math.max(...lons) + pad,
    };
  }, [located]);
  const [layers, setLayers] = useState<Record<string, boolean>>({ Parcels: true, Zoning: false, Flood: false, Candidates: true });

  const project = (lat: number, lon: number) => {
    if (!bounds) return { left: "50%", top: "50%" };
    return {
      left: `${((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * 100}%`,
      top: `${(1 - (lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * 100}%`,
    };
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
        <h1 className="sv-h1">Opportunity Map</h1>
        <span className="sv-sub">{located.length} located candidates · real parcel centroids (GIS-derived, schematic base map)</span>
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
          <div className="sv-map-chips">
            {Object.entries(layers).map(([name, on]) => (
              <button key={name} className={`sv-map-chip${on ? " on" : ""}`} onClick={() => setLayers((l) => ({ ...l, [name]: !l[name] }))}>{name}</button>
            ))}
          </div>
          <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
            {[...Array(12)].map((_, i) => (
              <line key={`h${i}`} x1="0" y1={`${(i + 1) * 8}%`} x2="100%" y2={`${(i + 1) * 8}%`} stroke="#fff" strokeWidth={i % 3 === 0 ? 5 : 2} />
            ))}
            {[...Array(14)].map((_, i) => (
              <line key={`v${i}`} x1={`${(i + 1) * 7}%`} y1="0" x2={`${(i + 1) * 7}%`} y2="100%" stroke={i % 4 === 0 ? "#F0D9A8" : "#fff"} strokeWidth={i % 4 === 0 ? 6 : 2} />
            ))}
          </svg>
          {layers.Candidates ? located.map((site) => (
            <button
              key={site.id}
              className={`sv-marker${ui.siteId === site.id ? " sel" : ""}`}
              style={project(site.coordinates!.latitude, site.coordinates!.longitude)}
              onClick={() => { patch({ siteId: site.id }); openPane("overview", { siteId: site.id }); }}
              title={site.address ?? site.apnFormatted}
            >
              {site.strategyFit.output.score}
            </button>
          )) : null}
          <div className="sv-legend">Markers = Strategy Fit score · positions from county parcel centroids · schematic street grid (production: MapLibre GL)</div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
export function SitesList({ data, patch, openPane }: { data: AppData; patch: Patch; openPane: OpenPane }) {
  const sites = data.candidates?.sites ?? [];
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
  const site = data.candidates?.sites.find((s) => s.id === ui.siteId) ?? data.candidates?.sites[0];
  const snapshot = site ? data.snapshots[site.id] : undefined;
  const providersReady = data.providers.filter((p) => p.status === "connected" || p.status === "configured").length;

  return (
    <div>
      <h1 className="sv-h1">Research Runs</h1>
      <p className="sv-sub">{site ? `${site.address ?? site.apnFormatted} · six-agent research roster` : "No site selected"}</p>

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
          {snapshot && providersReady < 3 ? (
            <div className="sv-panel-pad" style={{ background: "var(--amber-bg)", borderTop: "1px solid var(--border-section)", fontSize: 11, color: "var(--amber-text)" }}>
              Development History is waiting on live research providers ({providersReady}/4 configured). Add Rtrvr + MiniMax keys and refresh the run — the snapshot upgrades from partial to complete.
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
            <p className="sv-note">Snapshot-diff cards appear after a second research run on the same site. Diffs between snapshots are the engine behind Development Event Intelligence.</p>
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
  return (
    <div>
      <h1 className="sv-h1">Data Sources</h1>
      <p className="sv-sub">Live provider connections and the government source registry. Truthful states only — nothing is marked connected without a verified probe.</p>

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
        <div className="sv-row" style={{ cursor: "default" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 12 }}>San José Zoning / General Plan 2040 · FEMA NFHL</div>
            <div style={{ fontSize: 11, color: "var(--text-2)" }}>Queried live per site during research runs; evidence records carry exact retrieval timestamps.</div>
          </div>
        </div>
      </section>
    </div>
  );
}
