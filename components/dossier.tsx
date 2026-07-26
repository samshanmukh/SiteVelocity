"use client";

import {
  EVIDENCE_BADGES,
  barColor,
  siteStatus,
  type AppData,
  type CandidateSite,
  type PaneMode,
  type SnapshotView,
  type UiState,
} from "./model";
import type { Finding } from "../lib/domain/schemas/core";
import { FeasibilityStudio, type FeasibilityMode } from "./feasibility-studio";

type Patch = (partial: Partial<UiState>) => void;
type OpenPane = (mode: PaneMode, extra?: Partial<UiState>) => void;

const TABS: { id: string; label: string; preview?: boolean }[] = [
  { id: "snapshot", label: "Snapshot" },
  { id: "landuse", label: "Land Use" },
  { id: "history", label: "History" },
  { id: "siterisk", label: "Site Risk" },
  { id: "evidence", label: "Evidence" },
  { id: "contacts", label: "Contacts" },
  { id: "land", label: "Land" },
  { id: "entitlements", label: "Entitlements" },
  { id: "utilities", label: "Utilities" },
  { id: "title", label: "Title & Liens" },
  { id: "ownership", label: "Ownership" },
  { id: "airrights", label: "Air Rights" },
  { id: "envelope", label: "Envelope" },
  { id: "yield", label: "Yield" },
  { id: "underwriting", label: "Underwriting" },
  { id: "ic", label: "IC" },
];

function findingBadge(f: Finding, openEvidence: (id: string | null) => void) {
  const badge = EVIDENCE_BADGES[f.evidenceLevel];
  return (
    <span
      className="sv-badge"
      style={{ background: badge.bg, color: badge.color, cursor: "pointer" }}
      onClick={(e) => { e.stopPropagation(); openEvidence(f.evidenceIds[0] ?? null); }}
    >
      {badge.label}
    </span>
  );
}

function findingValue(finding: Finding): string {
  if (finding.valueJson === null) return "Unknown";
  if (typeof finding.valueJson === "string") return finding.valueJson;
  return JSON.stringify(finding.valueJson);
}

function FindingCategoryPanel({
  title,
  findings,
  empty,
  disclaimer,
  openEvidence,
  openPane,
}: {
  title: string;
  findings: Finding[];
  empty: string;
  disclaimer: string;
  openEvidence: (id: string | null) => void;
  openPane: OpenPane;
}) {
  return (
    <section className="sv-panel sv-panel-pad">
      <div className="sv-section-label">{title}</div>
      {findings.map((finding) => (
        <div
          key={finding.id}
          className="sv-row"
          onClick={() => finding.evidenceIds[0] ? openEvidence(finding.evidenceIds[0]) : openPane("nextstep")}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 650, fontSize: 12.5 }}>{finding.field.replace(/_/g, " ")}</div>
            <div style={{ fontSize: 12, marginTop: 2 }}>{findingValue(finding)}</div>
            {finding.note ? <div className="sv-note" style={{ marginTop: 3 }}>{finding.note}</div> : null}
          </div>
          {findingBadge(finding, openEvidence)}
          <span className="sv-score">c {Math.round(finding.confidence * 100)}</span>
        </div>
      ))}
      {findings.length === 0 ? <div className="sv-empty">{empty}</div> : null}
      <p className="sv-note" style={{ marginTop: 10 }}>{disclaimer}</p>
    </section>
  );
}

export function Dossier({ data, site, snapshot, ui, patch, openPane }: {
  data: AppData;
  site: CandidateSite;
  snapshot: SnapshotView | undefined;
  ui: UiState;
  patch: Patch;
  openPane: OpenPane;
}) {
  const status = siteStatus(site, snapshot);
  const openEvidence = (evidenceId: string | null, from: PaneMode = "overview") =>
    openPane("evidence", { evidenceId, prevMode: from });

  const findings = snapshot?.findings ?? [];
  const known = findings.filter((f) => f.status === "verified");
  const believed = findings.filter((f) => f.status === "probable");
  const unknowns = findings.filter((f) => f.status === "unknown");
  const conflicts = findings.filter((f) => f.status === "conflicting");
  const flags = findings.filter((f) => f.impact === "fatal_constraint" || f.impact === "cost_timing_risk" || (f.status === "unknown" && f.category !== "development_history"));

  const latestScenario = data.feasibilityScenarios[site.id]?.[0];
  const tiles: Array<{
    label: string;
    score?: number;
    text?: string;
    key?: UiState["scoreSel"];
    tab?: "yield" | "ic";
  }> = [
    { label: "Strategy Fit", key: "strategyFit", score: site.strategyFit.output.score },
    { label: "Dev. Readiness", key: "developmentReadiness", score: snapshot?.scores.developmentReadiness?.output.score },
    { label: "Site Feasibility", tab: "yield", text: latestScenario ? `${latestScenario.outputs.yield.units} units` : "create scenario" },
    { label: "Deal Potential", tab: "ic", text: latestScenario ? latestScenario.outputs.investmentCommittee.recommendation.toUpperCase() : "create scenario" },
    { label: "Evidence Conf.", key: "evidenceConfidence", score: snapshot?.scores.evidenceConfidence?.output.score },
  ];

  return (
    <div>
      <div className="sv-dossier-head">
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          <button style={{ color: "var(--accent)" }} onClick={() => patch({ module: "sites" })}>Sites</button> / Dossier
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
          <h1 className="sv-h1">{site.address ?? `APN ${site.apnFormatted}`}</h1>
          <span className="sv-pill" style={{ background: status.bg, color: status.color }}>{status.label}</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 4 }}>
          {site.jurisdiction}, CA · <span className="mono">APN {site.apnFormatted}</span> ·{" "}
          {site.acresDerived ? `${site.acresDerived.value} ac (GIS-derived)` : "acreage unknown"} · Multifamily / Mixed-Use Redevelopment · Rank #{site.rank}
        </div>
        <div className="sv-tiles" style={{ marginTop: 14 }}>
          {tiles.map((tile) => (
            <div
              key={tile.label}
              className="sv-tile"
              onClick={() => tile.key && tile.score !== undefined
                ? openPane("score", { scoreSel: tile.key })
                : tile.tab
                  ? patch({ dossierTab: tile.tab })
                  : undefined}
            >
              <div className="sv-tile-label">{tile.label}</div>
              {tile.score !== undefined ? (
                <>
                  <div className="sv-tile-value">{tile.score}</div>
                  <div className="sv-meter"><div style={{ width: `${tile.score}%`, background: barColor(tile.score) }} /></div>
                </>
              ) : (
                <div className="sv-tile-value">{tile.text ?? "run research"}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="sv-dossier-tabs">
        {TABS.map((tab) => (
          <button key={tab.id} className={`sv-dtab${ui.dossierTab === tab.id ? " on" : ""}`} onClick={() => patch({ dossierTab: tab.id })}>
            {tab.label}
            {tab.preview ? <span className="mini">PREVIEW</span> : null}
          </button>
        ))}
      </div>

      {ui.dossierTab === "snapshot" ? (
        <div className="sv-grid2">
          <div className="sv-cards">
            <section className="sv-panel sv-panel-pad">
              <div className="sv-section-label">Why SiteVelocity found this site</div>
              {site.scoutReasons.map((reason) => (
                <div key={reason} className="sv-row" style={{ padding: "7px 4px" }} onClick={() => openEvidence(site.evidence[0]?.id ?? null)}>
                  <span style={{ flex: 1, fontSize: 12.5 }}>{reason}</span>
                  <span className="sv-badge" style={{ background: "#EAF0FC", color: "#2557C7" }}>GIS Screened</span>
                </div>
              ))}
            </section>

            <section className="sv-panel sv-panel-pad">
              <div className="sv-section-label">What we know</div>
              {known.length > 0 ? (
                <div className="sv-facts">
                  {known.map((f) => (
                    <div key={f.id} className="sv-fact" onClick={() => openEvidence(f.evidenceIds[0] ?? null)}>
                      <div>
                        <div style={{ fontSize: 10.5, color: "var(--text-label)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{f.field.replace(/_/g, " ")}</div>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>{typeof f.valueJson === "string" ? f.valueJson : JSON.stringify(f.valueJson)}</div>
                      </div>
                      {findingBadge(f, openEvidence)}
                    </div>
                  ))}
                </div>
              ) : <div className="sv-empty">No verified findings yet — run research.</div>}
            </section>

            <section className="sv-panel sv-panel-pad">
              <div className="sv-section-label">What we believe</div>
              {believed.concat(conflicts).map((f) => (
                <div key={f.id} className="sv-row" style={{ padding: "7px 4px" }} onClick={() => openEvidence(f.evidenceIds[0] ?? null)}>
                  <span style={{ flex: 1, fontSize: 12.5 }}>{f.note ?? f.field.replace(/_/g, " ")}</span>
                  <span className="sv-score">c {Math.round(f.confidence * 100)}</span>
                  {findingBadge(f, openEvidence)}
                </div>
              ))}
              {believed.length + conflicts.length === 0 ? <div className="sv-empty">Nothing yet.</div> : null}
            </section>

            <section className="sv-panel sv-panel-pad">
              <div className="sv-section-label">What we don&rsquo;t know</div>
              {unknowns.map((f) => (
                <div key={f.id} className="sv-row" style={{ padding: "7px 4px" }} onClick={() => openPane("nextstep")}>
                  <span style={{ flex: 1, fontSize: 12.5 }}>{f.note ?? f.field.replace(/_/g, " ")}</span>
                  <span style={{ color: "var(--accent)", fontSize: 11.5, whiteSpace: "nowrap" }}>Next step →</span>
                </div>
              ))}
              {unknowns.length === 0 ? <div className="sv-empty">No open unknowns recorded.</div> : null}
            </section>

            <section>
              <div className="sv-section-label">What could kill the deal</div>
              <div className="sv-fatals">
                {flags.slice(0, 4).map((f) => {
                  const fatal = f.impact === "fatal_constraint";
                  const edge = fatal ? "#B22730" : "#D9A62E";
                  return (
                    <div key={f.id} className="sv-fatal" style={{ borderLeftColor: edge }} onClick={() => openEvidence(f.evidenceIds[0] ?? null)}>
                      <div className="sv-fatal-tag" style={{ color: fatal ? "#B22730" : "#8F6400" }}>
                        {f.status === "unknown" ? "UNKNOWN" : fatal ? "POTENTIALLY FATAL" : "MATERIAL COST RISK"}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 12.5, marginTop: 4 }}>{f.field.replace(/_/g, " ")}</div>
                      <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 3 }}>{f.note}</div>
                    </div>
                  );
                })}
                {flags.length === 0 ? <div className="sv-note">No material flags recorded yet — that is a statement about research coverage, not site quality.</div> : null}
              </div>
            </section>
          </div>

          <div className="sv-cards">
            {snapshot?.nextAction ? (
              <section className="sv-panel" style={{ overflow: "hidden" }}>
                <div style={{ background: "var(--accent)", color: "#fff", padding: "7px 12px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em" }}>NEXT STEP</div>
                <div className="sv-panel-pad">
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{snapshot.nextAction.title}</div>
                  <p style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 5 }}>{snapshot.nextAction.why}</p>
                  <button className="sv-btn2" style={{ marginTop: 10 }} onClick={() => openPane("nextstep")}>Prepare me</button>
                </div>
              </section>
            ) : null}
            {snapshot ? (
              <section className="sv-panel sv-panel-pad">
                <div className="sv-section-label">Latest snapshot</div>
                <div className="mono" style={{ fontSize: 10.5 }}>{snapshot.snapshot.id}</div>
                <div style={{ fontSize: 11.5, marginTop: 4 }}>
                  {new Date(snapshot.snapshot.createdAt).toLocaleString()} ·{" "}
                  <strong style={{ color: snapshot.snapshot.status === "complete" ? "var(--green-text)" : "var(--amber-text)" }}>{snapshot.snapshot.status.toUpperCase()}</strong>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 4 }}>{snapshot.evidence.length} evidence · {snapshot.findings.length} findings · {snapshot.agentRuns.length} agent runs</div>
              </section>
            ) : (
              <section className="sv-panel sv-panel-pad">
                <div className="sv-section-label">No research yet</div>
                <p className="sv-note">This candidate has ingestion-time evidence only. Run research to add land-use, risk, and history findings.</p>
              </section>
            )}
            <section className="sv-panel sv-panel-pad" style={{ background: "var(--navy)", border: "none", color: "#C7D2E4" }}>
              <div style={{ fontWeight: 700, color: "#fff", marginBottom: 6 }}>Ask Scout about this site</div>
              <div style={{ fontSize: 11.5 }}>Ranking drivers, open risks, and evidence — answered from the snapshot.</div>
              <button className="sv-btn" style={{ marginTop: 10 }} onClick={() => openPane("scout")}>Open Scout</button>
            </section>
          </div>
        </div>
      ) : ui.dossierTab === "landuse" ? (
        <section className="sv-panel sv-panel-pad">
          <div className="sv-section-label">Land Use — official GIS findings</div>
          {findings.filter((f) => f.category === "land_use").map((f) => (
            <div key={f.id} className="sv-row" onClick={() => openEvidence(f.evidenceIds[0] ?? null)}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 12.5 }}>{f.field.replace(/_/g, " ")}</div>
                <div style={{ fontSize: 12, marginTop: 2 }}>{typeof f.valueJson === "string" ? f.valueJson : f.valueJson === null ? "—" : JSON.stringify(f.valueJson)}</div>
                {f.note ? <div className="sv-note" style={{ marginTop: 3 }}>{f.note}</div> : null}
              </div>
              {findingBadge(f, openEvidence)}
              <span className="sv-score">c {Math.round(f.confidence * 100)}</span>
            </div>
          ))}
          {findings.filter((f) => f.category === "land_use").length === 0 ? <div className="sv-empty">Run research to populate land-use findings.</div> : null}
        </section>
      ) : ui.dossierTab === "history" ? (
        <div className="sv-grid2">
          <section className="sv-panel sv-panel-pad">
            <div className="sv-section-label">Development history — evidence-backed timeline</div>
            {snapshot?.timeline.length ? (
              <div className="sv-timeline" style={{ marginTop: 8 }}>
                {snapshot.timeline.map((event, index) => (
                  <div key={index} className="sv-tl-item" onClick={() => openEvidence(event.evidenceId, "history")}>
                    <span className="sv-tl-dot" style={{ background: event.dotColor }} />
                    <div className="sv-tl-year">{event.year}</div>
                    <div className="sv-tl-title">{event.title}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 2 }}>{event.description} <span style={{ color: "var(--accent)" }}>View source →</span></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="sv-empty">
                No researched timeline events yet. The Development History agent reconstructs planning cases and permits once
                live research providers (Rtrvr + MiniMax) are configured. Absence of located records is recorded as unknown — never as &ldquo;no history exists.&rdquo;
              </div>
            )}
          </section>
          <section className="sv-callout" style={{ alignSelf: "start" }}>
            <div className="sv-section-label">SiteVelocity interpretation</div>
            <p style={{ fontSize: 12 }}>
              {findings.find((f) => f.category === "development_history")?.note ?? "History research pending."}
            </p>
          </section>
        </div>
      ) : ui.dossierTab === "siterisk" ? (
        <section className="sv-panel sv-panel-pad">
          <div className="sv-section-label">Site Risk — public screens</div>
          {findings.filter((f) => f.category === "site_risk").map((f) => (
            <div key={f.id} className="sv-row" onClick={() => openEvidence(f.evidenceIds[0] ?? null)}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 12.5 }}>{f.field.replace(/_/g, " ")}{typeof f.valueJson === "string" ? ` — ${f.valueJson}` : ""}</div>
                {f.note ? <div className="sv-note" style={{ marginTop: 3 }}>{f.note}</div> : null}
              </div>
              {findingBadge(f, openEvidence)}
              <span className="sv-score">c {Math.round(f.confidence * 100)}</span>
            </div>
          ))}
          {findings.filter((f) => f.category === "site_risk").length === 0 ? <div className="sv-empty">Run research to populate risk screens.</div> : null}
          <p className="sv-note" style={{ marginTop: 10 }}>A public screen is never environmental, title, engineering, or legal clearance.</p>
        </section>
      ) : ui.dossierTab === "evidence" ? (
        <section className="sv-panel">
          <table className="sv-table">
            <thead><tr><th>Record</th><th>Source</th><th>Verification</th><th>Retrieved</th></tr></thead>
            <tbody>
              {[...site.evidence, ...(snapshot?.evidence ?? [])].map((e) => {
                const level = e.id.startsWith("ev-rtrvr") ? "ai_researched" : "gis_screened";
                const badge = EVIDENCE_BADGES[level];
                return (
                  <tr key={e.id} onClick={() => openEvidence(e.id)}>
                    <td style={{ fontWeight: 600 }}>{e.title}</td>
                    <td>{e.source.agency}</td>
                    <td><span className="sv-badge" style={{ background: badge.bg, color: badge.color }}>{badge.label}</span></td>
                    <td className="mono" style={{ fontSize: 10.5 }}>{new Date(e.source.retrievedAt).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : ui.dossierTab === "land" ? (
        <div className="sv-grid2">
          <section className="sv-panel sv-panel-pad">
            <div className="sv-section-label">Canonical parcel identity</div>
            {[
              ["APN", site.apnFormatted],
              ["Jurisdiction", site.jurisdiction],
              ["County", site.county ?? "Unknown"],
              ["Situs address", site.address ?? "Unknown"],
              ["Parcel area", site.acresDerived ? `${site.acresDerived.value} acres` : "Unknown"],
              ["Parcel centroid", site.coordinates ? `${site.coordinates.latitude.toFixed(6)}, ${site.coordinates.longitude.toFixed(6)}` : "Unknown"],
            ].map(([label, value]) => (
              <div className="sv-row" key={label} onClick={() => openEvidence(site.evidence[0]?.id ?? null)}>
                <span style={{ flex: 1, fontWeight: 600 }}>{label}</span>
                <span className="mono" style={{ fontSize: 11 }}>{value}</span>
              </div>
            ))}
          </section>
          <section className="sv-panel sv-panel-pad">
            <div className="sv-section-label">Geometry and recorded-rights coverage</div>
            <div className="sv-callout">
              <strong>GIS-derived, not survey-grade</strong>
              <p className="sv-note" style={{ marginTop: 4 }}>{site.coordinates?.method ?? "No geometry-derived centroid is available."}</p>
            </div>
            <div className="sv-row" style={{ cursor: "default" }}><span style={{ flex: 1 }}>Surveyed boundary</span><strong>UNKNOWN</strong></div>
            <div className="sv-row" style={{ cursor: "default" }}><span style={{ flex: 1 }}>Legal access / recorded easements</span><strong>UNKNOWN</strong></div>
            <p className="sv-note" style={{ marginTop: 8 }}>Unknowns remain open until a survey, plat, title report, or recorded document is attached.</p>
          </section>
        </div>
      ) : ui.dossierTab === "entitlements" ? (
        <div className="sv-grid2">
          <FindingCategoryPanel
            title="Planning applications and permits"
            findings={findings.filter((finding) => finding.category === "development_history")}
            empty="Run live research to query planning and permit sources for this APN."
            disclaimer="A record not located by the portal is not proof that no entitlement or permit exists."
            openEvidence={openEvidence}
            openPane={openPane}
          />
          <section className="sv-panel sv-panel-pad">
            <div className="sv-section-label">Evidence-backed timeline</div>
            {snapshot?.timeline.map((event, index) => (
              <div className="sv-row" key={`${event.year}-${index}`} onClick={() => openEvidence(event.evidenceId)}>
                <span className="mono" style={{ width: 44 }}>{event.year}</span>
                <div><strong>{event.title}</strong><div className="sv-note">{event.description}</div></div>
              </div>
            ))}
            {!snapshot?.timeline.length ? <div className="sv-empty">No supported entitlement or permit event has been located yet.</div> : null}
          </section>
        </div>
      ) : ui.dossierTab === "contacts" ? (
        <div className="sv-grid2">
          <FindingCategoryPanel
            title="Public professional contacts"
            findings={findings.filter((finding) => finding.category === "contacts")}
            empty="Refresh live research to retrieve role-matched public agency contacts."
            disclaimer="Only public professional contact details from official sources are shown; SiteVelocity never invents a person."
            openEvidence={openEvidence}
            openPane={openPane}
          />
          <section className="sv-panel sv-panel-pad">
            <div className="sv-section-label">Preparation brief</div>
            <strong>{snapshot?.nextAction?.role ?? "No resolver role selected yet"}</strong>
            <p className="sv-note" style={{ marginTop: 6 }}>{snapshot?.nextAction?.why ?? "Research the site to generate a role-matched brief."}</p>
            {snapshot?.nextAction?.questions.map((question) => <div key={question} className="sv-row" style={{ cursor: "default" }}>{question}</div>)}
          </section>
        </div>
      ) : ui.dossierTab === "utilities" ? (
        <FindingCategoryPanel
          title="Utility and infrastructure signals"
          findings={findings.filter((finding) => finding.category === "utilities")}
          empty="Refresh live research to retrieve official utility service and application guidance."
          disclaimer="Service-area guidance is not a will-serve letter or capacity determination. Parcel-specific capacity remains unknown until the provider confirms it."
          openEvidence={openEvidence}
          openPane={openPane}
        />
      ) : ui.dossierTab === "title" ? (
        <FindingCategoryPanel
          title="Title, liens, easements, and recorded documents"
          findings={findings.filter((finding) => finding.category === "title")}
          empty="Refresh live research to establish the official-record access path."
          disclaimer="Santa Clara County recorded-document images require official in-person research; this screen is never a title clearance or legal opinion."
          openEvidence={openEvidence}
          openPane={openPane}
        />
      ) : ui.dossierTab === "ownership" ? (
        <FindingCategoryPanel
          title="Ownership and capital signals"
          findings={findings.filter((finding) => finding.category === "ownership")}
          empty="Refresh live research to inspect official assessor-accessible ownership facts."
          disclaimer="Entity identity, beneficial ownership, debt, and disposition intent remain unknown unless directly supported by retained evidence."
          openEvidence={openEvidence}
          openPane={openPane}
        />
      ) : ui.dossierTab === "airrights" ? (
        <div className="sv-grid2">
          <FindingCategoryPanel
            title="Air and vertical development rights"
            findings={findings.filter((finding) => finding.category === "air_rights")}
            empty="Run land-use research to establish the zoning evidence and record the unresolved vertical-rights questions."
            disclaimer="A zoning screen is not a legal determination of air rights, TDR availability, rooftop control, or FAA/avigation clearance."
            openEvidence={openEvidence}
            openPane={openPane}
          />
          <section className="sv-panel sv-panel-pad">
            <div className="sv-section-label">Modeled vertical envelope</div>
            {data.feasibilityScenarios[site.id]?.[0] ? <>
              <div className="sv-row" style={{ cursor: "default" }}><span style={{ flex: 1 }}>Declared stories</span><strong>{data.feasibilityScenarios[site.id]![0]!.assumptions.maxStories}</strong></div>
              <div className="sv-row" style={{ cursor: "default" }}><span style={{ flex: 1 }}>Modeled max envelope</span><strong>{Math.round(data.feasibilityScenarios[site.id]![0]!.outputs.envelope.maxEnvelopeGrossSqFt).toLocaleString()} sf</strong></div>
              <p className="sv-note">Scenario output only. It uses declared assumptions and does not create or verify a legal development right.</p>
            </> : <div className="sv-empty">Save a feasibility scenario to compare a declared story count with the sourced parcel area.</div>}
          </section>
        </div>
      ) : (["envelope", "yield", "underwriting", "ic"] as string[]).includes(ui.dossierTab) ? (
        <FeasibilityStudio
          siteId={site.id}
          mode={ui.dossierTab as FeasibilityMode}
          scenarios={data.feasibilityScenarios[site.id] ?? []}
        />
      ) : <div className="sv-empty">Select a supported dossier module.</div>}
    </div>
  );
}
