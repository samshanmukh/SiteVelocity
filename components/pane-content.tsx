"use client";

import { useState } from "react";
import {
  EVIDENCE_BADGES,
  agentLabel,
  runStatusColor,
  siteStatus,
  type AppData,
  type CandidateSite,
  type PaneMode,
  type ScoutMessage,
  type SnapshotView,
  type UiState,
} from "./model";

type Patch = (partial: Partial<UiState>) => void;
type OpenPane = (mode: PaneMode, extra?: Partial<UiState>) => void;

export function PaneContent({ data, site, snapshot, ui, patch, openPane }: {
  data: AppData;
  site: CandidateSite | null;
  snapshot: SnapshotView | undefined;
  ui: UiState;
  patch: Patch;
  openPane: OpenPane;
}) {
  if (!site) return <div className="sv-empty">No site selected.</div>;

  switch (ui.paneMode) {
    case "overview": return <OverviewPane data={data} site={site} snapshot={snapshot} patch={patch} openPane={openPane} />;
    case "evidence": return <EvidencePane site={site} snapshot={snapshot} ui={ui} openPane={openPane} />;
    case "history": return <HistoryPane snapshot={snapshot} openPane={openPane} />;
    case "agents": return <AgentsPane snapshot={snapshot} />;
    case "nextstep": return <NextStepPane snapshot={snapshot} />;
    case "score": return <ScorePane site={site} snapshot={snapshot} ui={ui} />;
    case "scout": return <ScoutPane site={site} snapshot={snapshot} ui={ui} patch={patch} openPane={openPane} />;
    default: return null;
  }
}

function OverviewPane({ data, site, snapshot, patch, openPane }: { data: AppData; site: CandidateSite; snapshot: SnapshotView | undefined; patch: Patch; openPane: OpenPane }) {
  void data;
  const status = siteStatus(site, snapshot);
  const topTimeline = snapshot?.timeline[0];
  return (
    <div className="sv-cards">
      <div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <strong style={{ fontSize: 14 }}>{site.address ?? `APN ${site.apnFormatted}`}</strong>
          <span className="sv-pill" style={{ background: status.bg, color: status.color }}>{status.label}</span>
        </div>
        <div className="mono" style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3 }}>
          APN {site.apnFormatted} · {site.acresDerived ? `${site.acresDerived.value} ac*` : "acreage unknown"} · zoning {site.zoningAbbr ?? "—"}
        </div>
      </div>
      <div className="sv-mono-block">
        Rank #{site.rank} · Strategy Fit {site.strategyFit.output.score}<br />
        {site.scoutReasons.slice(0, 3).map((r) => <span key={r}>· {r}<br /></span>)}
      </div>
      {topTimeline ? (
        <button className="sv-callout" onClick={() => openPane("history")} style={{ textAlign: "left", cursor: "pointer" }}>
          <div className="sv-section-label">Development history signal</div>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>{topTimeline.year} — {topTimeline.title}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 3 }}>{topTimeline.description}</div>
          <div style={{ color: "var(--accent)", fontSize: 11.5, marginTop: 5 }}>Open history →</div>
        </button>
      ) : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="sv-btn2" onClick={() => patch({ module: "dossier", dossierTab: "snapshot", pane: false })}>Open dossier</button>
        <button className="sv-btn2" onClick={() => openPane("nextstep")}>Next step</button>
        <button className="sv-btn2" onClick={() => openPane("agents")}>Agent runs</button>
      </div>
      <p className="sv-note">*GIS-derived from county parcel geometry — not a legal survey. Every value opens its evidence record.</p>
    </div>
  );
}

function EvidencePane({ site, snapshot, ui, openPane }: { site: CandidateSite; snapshot: SnapshotView | undefined; ui: UiState; openPane: OpenPane }) {
  const all = [...site.evidence, ...(snapshot?.evidence ?? [])];
  const record = all.find((e) => e.id === ui.evidenceId) ?? all[0];
  if (!record) return <div className="sv-empty">No evidence records.</div>;
  const level = record.id.startsWith("ev-rtrvr") ? "ai_researched" : "gis_screened";
  const badge = EVIDENCE_BADGES[level];
  return (
    <div className="sv-cards">
      <div>
        <strong style={{ fontSize: 13.5 }}>{record.title}</strong>
        <div style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 3 }}>{record.source.agency}</div>
      </div>
      <span className="sv-badge" style={{ background: badge.bg, color: badge.color, alignSelf: "flex-start" }}>{badge.label}</span>
      <div className="sv-mono-block">
        dataset&nbsp;&nbsp;&nbsp;{record.source.dataset}<br />
        record&nbsp;&nbsp;&nbsp;&nbsp;{record.source.sourceRecordId}<br />
        retrieved&nbsp;{new Date(record.source.retrievedAt).toLocaleString()}
      </div>
      <div style={{ fontSize: 11.5 }}>
        <a href={record.source.sourceUrl} target="_blank" rel="noreferrer">{record.source.sourceUrl}</a>
      </div>
      <div style={{ borderLeft: "3px solid var(--border-accent)", paddingLeft: 10, fontStyle: "italic", fontSize: 12, color: "var(--text-2)" }}>
        {record.excerpt}
      </div>
      <button className="sv-btn2" onClick={() => openPane(ui.prevMode === "evidence" ? "overview" : ui.prevMode)}>
        ← Back to {ui.prevMode === "history" ? "History" : ui.prevMode === "scout" ? "Scout" : "Overview"}
      </button>
    </div>
  );
}

function HistoryPane({ snapshot, openPane }: { snapshot: SnapshotView | undefined; openPane: OpenPane }) {
  if (!snapshot?.timeline.length) {
    return (
      <div className="sv-empty">
        No researched history events yet. The Development History agent populates this timeline; absence of located records
        is recorded as unknown, never as proof of no history.
      </div>
    );
  }
  return (
    <div className="sv-timeline" style={{ marginTop: 4 }}>
      {snapshot.timeline.map((event, index) => (
        <div key={index} className="sv-tl-item" onClick={() => openPane("evidence", { evidenceId: event.evidenceId, prevMode: "history" })}>
          <span className="sv-tl-dot" style={{ background: event.dotColor }} />
          <div className="sv-tl-year">{event.year}</div>
          <div className="sv-tl-title">{event.title}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 2 }}>{event.description}</div>
          <div style={{ color: "var(--accent)", fontSize: 11, marginTop: 3 }}>View source →</div>
        </div>
      ))}
    </div>
  );
}

function AgentsPane({ snapshot }: { snapshot: SnapshotView | undefined }) {
  if (!snapshot) return <div className="sv-empty">No agent runs for this site yet.</div>;
  return (
    <div className="sv-cards">
      {snapshot.agentRuns.map((run) => {
        const c = runStatusColor(run.status);
        return (
          <div key={run.id} className="sv-panel sv-panel-pad" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span className="sv-dot" style={{ background: c.dot, marginTop: 4, animation: c.anim ? "svpulse 1.4s ease-in-out infinite" : "none" }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <strong style={{ fontSize: 12.5 }}>{agentLabel(run.agent)}</strong>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: c.text }}>{run.status.toUpperCase()}</span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 3 }}>{run.summary ?? "—"}</div>
              <div className="mono" style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>{run.sourcesUsed} sources</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NextStepPane({ snapshot }: { snapshot: SnapshotView | undefined }) {
  const action = snapshot?.nextAction;
  if (!action) return <div className="sv-empty">Run research to generate a Next Best Action.</div>;
  return (
    <div className="sv-cards">
      <div className="sv-panel" style={{ overflow: "hidden" }}>
        <div style={{ background: "var(--accent)", color: "#fff", padding: "7px 12px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em" }}>NEXT BEST ACTION</div>
        <div className="sv-panel-pad">
          <strong style={{ fontSize: 13 }}>{action.title}</strong>
          <p style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 5 }}>{action.why}</p>
        </div>
      </div>
      <div>
        <div className="sv-section-label">Who</div>
        <div style={{ fontSize: 12 }}>{action.role}</div>
      </div>
      <div>
        <div className="sv-section-label">What we already know</div>
        <div className="sv-mono-block">{action.knownFacts.map((f) => <div key={f}>· {f}</div>)}</div>
      </div>
      <div>
        <div className="sv-section-label">Recommended questions</div>
        <ol style={{ paddingLeft: 16, fontSize: 12, lineHeight: 1.7 }}>{action.questions.map((q) => <li key={q}>{q}</li>)}</ol>
      </div>
      <div>
        <div className="sv-section-label">Documents to request</div>
        <div style={{ fontSize: 11.5, color: "var(--text-2)" }}>{action.documents.join(" · ")}</div>
      </div>
      <div className="sv-callout" style={{ fontSize: 11.5 }}>Expected follow-up: {action.expectedFollowUp}</div>
    </div>
  );
}

function ScorePane({ site, snapshot, ui }: { site: CandidateSite; snapshot: SnapshotView | undefined; ui: UiState }) {
  const run = ui.scoreSel === "strategyFit" ? site.strategyFit : snapshot?.scores[ui.scoreSel];
  if (!run) return <div className="sv-empty">Score not computed yet.</div>;
  const label = ui.scoreSel === "strategyFit" ? "Strategy Fit" : ui.scoreSel === "developmentReadiness" ? "Development Readiness" : "Evidence Confidence";
  return (
    <div className="sv-cards">
      <div>
        <div className="sv-section-label">{label}</div>
        <div className="mono" style={{ fontSize: 26, fontWeight: 600 }}>{run.output.score}</div>
        <div className="mono" style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
          {run.type}@{run.version} · deterministic · input hash {run.inputHash}
        </div>
      </div>
      <div>
        <div className="sv-section-label">Signed drivers</div>
        {run.output.drivers.map((driver, i) => (
          <div key={i} style={{ display: "flex", gap: 10, padding: "5px 0", borderBottom: "1px solid var(--border-row)", fontSize: 12 }}>
            <span className="mono" style={{ width: 34, fontWeight: 600, color: driver.delta >= 0 ? "var(--green-text)" : "var(--red)" }}>
              {driver.delta >= 0 ? `+${driver.delta}` : driver.delta}
            </span>
            <span style={{ flex: 1 }}>{driver.reason}</span>
          </div>
        ))}
      </div>
      {run.output.warnings.length > 0 ? (
        <div className="sv-callout" style={{ background: "var(--amber-bg)", borderColor: "#E8D9A8" }}>
          <div className="sv-section-label" style={{ color: "var(--amber-text)" }}>Missing inputs</div>
          {run.output.warnings.map((w) => <div key={w} style={{ fontSize: 11.5, color: "var(--amber-text)" }}>· {w}</div>)}
        </div>
      ) : null}
      <p className="sv-note">Scores are versioned, typed TypeScript calculations — reproducible from the recorded inputs. An LLM never computes them.</p>
    </div>
  );
}

function ScoutPane({ site, snapshot, ui, patch, openPane }: { site: CandidateSite; snapshot: SnapshotView | undefined; ui: UiState; patch: Patch; openPane: OpenPane }) {
  const [input, setInput] = useState("");

  const answer = (q: string): ScoutMessage => {
    if (/rank|score|why/i.test(q)) {
      const drivers = site.strategyFit.output.drivers;
      return {
        q,
        kind: "TOOL-GENERATED RESULT",
        tool: `strategy_fit@${site.strategyFit.version} (deterministic)`,
        title: `Strategy Fit ${site.strategyFit.output.score} — driver breakdown`,
        body: drivers.map((d) => `${d.delta >= 0 ? "+" : ""}${d.delta} ${d.reason}`).join(". "),
        actions: [{ label: "View drivers", mode: "score" }],
      };
    }
    if (/risk|unknown|kill/i.test(q)) {
      const top = snapshot?.findings.find((f) => f.status === "unknown" || f.status === "conflicting");
      return top
        ? {
            q,
            kind: "AI EXPLANATION",
            title: `Biggest open question — ${top.field.replace(/_/g, " ")}`,
            body: top.note ?? "Unresolved finding.",
            next: snapshot?.nextAction?.title,
            actions: [
              { label: "View evidence", mode: "evidence", evidenceId: top.evidenceIds[0] },
              { label: "Next step", mode: "nextstep" },
            ],
          }
        : { q, kind: "AI EXPLANATION", title: "No unresolved findings recorded", body: "Research coverage is still narrow — that is a coverage statement, not a clean bill of health.", actions: [{ label: "Agent runs", mode: "agents" }] };
    }
    if (/history|previous|before/i.test(q)) {
      const events = snapshot?.timeline ?? [];
      return {
        q,
        kind: events.length ? "TOOL-GENERATED RESULT" : "AI EXPLANATION",
        tool: events.length ? "Development History agent" : undefined,
        title: events.length ? `${events.length} evidence-backed event(s) on the timeline` : "History not yet researched",
        body: events.length
          ? events.map((e) => `${e.year}: ${e.title}`).join(" · ")
          : "The Development History agent needs the live research providers (Rtrvr + MiniMax). Until then history is recorded as unknown.",
        actions: [{ label: "View history", mode: "history" }],
      };
    }
    return {
      q,
      kind: "AI EXPLANATION",
      title: "I can research that",
      body: "There is no verified answer in the current Research Snapshot. I can scope a research run against planning, recorder, and permit sources and report back with evidence.",
      next: "Run research",
      actions: [{ label: "Agent runs", mode: "agents" }],
    };
  };

  const ask = (q: string) => {
    patch({ scoutThread: [...ui.scoutThread, answer(q)] });
    setInput("");
  };

  return (
    <div className="sv-cards">
      <p className="sv-note">Scout answers from deterministic tools and the evidence graph of {site.address ?? site.apnFormatted}. Tool results and AI explanations are always visually distinct.</p>
      {ui.scoutThread.map((message, index) => (
        <div key={index} className="sv-cards" style={{ gap: 8 }}>
          <div style={{ alignSelf: "flex-end", background: "var(--bg-chip)", color: "#1C46A3", borderRadius: "8px 8px 2px 8px", padding: "7px 11px", fontSize: 12, maxWidth: "85%" }}>{message.q}</div>
          <div className="sv-panel sv-panel-pad">
            {message.tool ? <div className="mono" style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 5 }}>⚙ TOOL · {message.tool}</div> : null}
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", color: message.kind === "TOOL-GENERATED RESULT" ? "var(--green-text)" : "var(--amber-text)" }}>{message.kind}</div>
            <strong style={{ fontSize: 12.5, display: "block", marginTop: 4 }}>{message.title}</strong>
            <p style={{ fontSize: 12, color: "var(--text-2)", marginTop: 4 }}>{message.body}</p>
            {message.next ? <div style={{ fontSize: 11.5, marginTop: 5 }}><strong>Next:</strong> {message.next}</div> : null}
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {message.actions.map((action) => (
                <button key={action.label} className="sv-btn2" onClick={() => openPane(action.mode, action.evidenceId ? { evidenceId: action.evidenceId, prevMode: "scout" } : undefined)}>
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {["Why is this ranked here?", "What's the biggest risk?", "What happened here before?"].map((q) => (
          <button key={q} className="sv-btn2" onClick={() => ask(q)}>{q}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="sv-search"
          style={{ maxWidth: "none", flex: 1 }}
          placeholder="Ask about this site…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && input.trim()) ask(input.trim()); }}
        />
        <button className="sv-btn" onClick={() => input.trim() && ask(input.trim())}>Send</button>
      </div>
    </div>
  );
}
