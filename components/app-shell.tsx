"use client";

import { useCallback, useMemo, useState } from "react";
import {
  NAV_GROUPS,
  type AppData,
  type NavItem,
  type PaneMode,
  type UiState,
} from "./model";
import { CommandCenter, DataSources, DevelopmentEvents, NextSteps, OpportunityMap, PreviewModule, ResearchRuns, ScoutForm, SitesList, Watchlists } from "./screens";
import { Dossier } from "./dossier";
import { PaneContent } from "./pane-content";
import { Administration } from "./administration";

const PANE_TITLES: Record<PaneMode, string> = {
  overview: "Site Context",
  evidence: "Evidence Record",
  history: "Development History",
  agents: "Research Activity",
  nextstep: "Next Best Action",
  score: "Score Drivers",
  scout: "Scout — Development Intelligence",
};

const PANE_WIDTHS = { narrow: 320, medium: 424, wide: 560 } as const;

export function AppShell({ data }: { data: AppData }) {
  const [ui, setUi] = useState<UiState>({
    module: "command",
    infoId: null,
    siteId: data.candidates?.sites[0]?.id ?? null,
    dossierTab: "snapshot",
    pane: false,
    paneMode: "overview",
    paneWidth: "medium",
    prevMode: "overview",
    evidenceId: null,
    scoreSel: "strategyFit",
    searchQuery: "",
    scoutThread: [],
  });

  const patch = useCallback((partial: Partial<UiState>) => setUi((u) => ({ ...u, ...partial })), []);
  const openPane = useCallback(
    (mode: PaneMode, extra?: Partial<UiState>) =>
      setUi((u) => ({ ...u, pane: true, prevMode: u.paneMode, paneMode: mode, ...extra })),
    [],
  );
  const go = useCallback((item: NavItem) => {
    if (item.target) {
      setUi((u) => ({
        ...u,
        module: item.target!.module,
        infoId: null,
        dossierTab: item.target!.tab ?? (item.target!.module === "dossier" ? "snapshot" : u.dossierTab),
      }));
    } else {
      setUi((u) => ({ ...u, module: "info", infoId: item.id }));
    }
  }, []);

  const site = useMemo(
    () => data.candidates?.sites.find((s) => s.id === ui.siteId) ?? data.candidates?.sites[0] ?? null,
    [data.candidates, ui.siteId],
  );
  const snapshot = site ? data.snapshots[site.id] : undefined;
  const runningAgents = Object.values(data.snapshots).flatMap((s) => s.agentRuns).filter((r) => r.status === "running" || r.status === "queued").length;

  const activeNavId = ui.module === "info"
    ? ui.infoId
    : ui.module === "dossier"
      ? ({
          history: "devhistory",
          landuse: "landuse",
          siterisk: "siteenv",
          contacts: "contactsmod",
          land: "land",
          entitlements: "entitlements",
          utilities: "utilities",
          title: "title",
          ownership: "ownership",
          airrights: "airrights",
          envelope: "envelope",
          yield: "yield",
          underwriting: "underwriting",
          ic: "ic",
        }[ui.dossierTab] ?? "sites")
      : ui.module;

  const infoItem = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === ui.infoId);

  return (
    <div className="sv-root">
      <nav className="sv-rail">
        <div className="sv-logo">
          <div className="sv-logo-mark">SV</div>
          <div>
            <div className="sv-logo-name">SiteVelocity</div>
            <div className="sv-logo-tag">Find the sites that can move.</div>
          </div>
        </div>
        {NAV_GROUPS.map((group) => (
          <div className="sv-navgroup" key={group.label}>
            <div className="sv-navgroup-label">{group.label}</div>
            {group.items.map((item) => (
              <button
                key={item.id}
                className={`sv-navitem${activeNavId === item.id ? " active" : ""}`}
                onClick={() => go(item)}
              >
                <span className="icon">{item.icon}</span>
                <span>{item.label}</span>
                {item.status !== "live" ? (
                  <span className={`sv-navbadge ${item.status === "preview" ? "preview" : "soon"}`}>
                    {item.status === "preview" ? "Preview" : "Soon"}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="sv-main">
        <header className="sv-topbar">
          <input
            className="sv-search"
            placeholder="Search addresses, APNs, or jurisdictions…"
            value={ui.searchQuery}
            onChange={(event) => patch({ searchQuery: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") patch({ module: "sites", infoId: null });
            }}
            aria-label="Search sites"
          />
          <span className="sv-chip">Strategy | {data.candidates?.thesisId ?? "No active thesis"}</span>
          <button className="sv-indicator" onClick={() => openPane("agents")}>
            <span className="sv-dot pulse" style={{ background: runningAgents > 0 ? "#1F9D55" : "#C9CED6" }} />
            {runningAgents > 0 ? `${runningAgents} agent${runningAgents === 1 ? "" : "s"} pending` : "agents idle"}
          </button>
          <div className="sv-user">
            <div className="sv-avatar">SV</div>
            <div style={{ fontSize: 11.5 }}>
              <div style={{ fontWeight: 600 }}>SiteVelocity Team</div>
              <div style={{ color: "var(--text-muted)", fontSize: 10 }}>Alpha — PDD Hackathon</div>
            </div>
            {!data.runtime.demoMode ? (
              <button
                aria-label="Sign out"
                onClick={() => void fetch("/api/auth/session", { method: "DELETE" }).then(() => { window.location.href = "/"; })}
                style={{ color: "var(--text-muted)", fontSize: 10 }}
              >
                Sign out
              </button>
            ) : null}
          </div>
        </header>

        <div className="sv-body">
          <main className="sv-workspace">
            {ui.module === "command" ? (
              <CommandCenter data={data} ui={ui} patch={patch} openPane={openPane} />
            ) : ui.module === "scout" ? (
              <ScoutForm data={data} patch={patch} />
            ) : ui.module === "map" ? (
              <OpportunityMap data={data} ui={ui} patch={patch} openPane={openPane} query={ui.searchQuery} />
            ) : ui.module === "sites" ? (
              <SitesList data={data} patch={patch} openPane={openPane} query={ui.searchQuery} />
            ) : ui.module === "runs" ? (
              <ResearchRuns data={data} ui={ui} openPane={openPane} />
            ) : ui.module === "next" ? (
              <NextSteps data={data} patch={patch} openPane={openPane} />
            ) : ui.module === "devevents" ? (
              <DevelopmentEvents data={data} patch={patch} openPane={openPane} />
            ) : ui.module === "watchlists" ? (
              <Watchlists data={data} patch={patch} openPane={openPane} />
            ) : ui.module === "dossier" && site ? (
              <Dossier data={data} site={site} snapshot={snapshot} ui={ui} patch={patch} openPane={openPane} />
            ) : ui.module === "datasources" ? (
              <DataSources data={data} />
            ) : ui.module === "agentsettings" || ui.module === "integrations" || ui.module === "team" ? (
              <Administration mode={ui.module} data={data} />
            ) : infoItem ? (
              <PreviewModule item={infoItem} />
            ) : (
              <div className="sv-empty">Select a module.</div>
            )}
          </main>

          {ui.pane ? (
            <aside className="sv-pane" style={{ width: PANE_WIDTHS[ui.paneWidth], minWidth: PANE_WIDTHS[ui.paneWidth] }}>
              <div className="sv-pane-header">
                <span className="sv-pane-title">{PANE_TITLES[ui.paneMode]}</span>
                <div className="sv-pane-widths">
                  {(["narrow", "medium", "wide"] as const).map((w) => (
                    <button key={w} className={ui.paneWidth === w ? "on" : ""} onClick={() => patch({ paneWidth: w })}>
                      {w === "narrow" ? "S" : w === "medium" ? "M" : "L"}
                    </button>
                  ))}
                </div>
                <button onClick={() => patch({ pane: false })} style={{ color: "var(--text-muted)", fontSize: 14 }}>✕</button>
              </div>
              <div className="sv-pane-tabs">
                {(["overview", "evidence", "history", "nextstep", "agents", "scout"] as PaneMode[]).map((mode) => (
                  <button
                    key={mode}
                    className={`sv-pane-tab${ui.paneMode === mode || (mode === "overview" && ui.paneMode === "score") ? " on" : ""}`}
                    onClick={() => openPane(mode)}
                  >
                    {mode === "nextstep" ? "Next Step" : mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
              <div className="sv-pane-scroll">
                <PaneContent data={data} site={site} snapshot={snapshot} ui={ui} patch={patch} openPane={openPane} />
              </div>
            </aside>
          ) : null}
        </div>
      </div>

      {!(ui.pane && ui.paneMode === "scout") ? (
        <button
          className="sv-fab"
          style={{ right: ui.pane ? PANE_WIDTHS[ui.paneWidth] + 18 : 18 }}
          onClick={() => openPane("scout")}
        >
          <span className="sv-fab-ring"><span className="sv-fab-core"><span className="sv-fab-dot" /></span></span>
          <span>
            <span className="sv-fab-label">Ask Scout</span>
            <br />
            <span className="sv-fab-context">{site?.address ?? "San José Multifamily"}</span>
          </span>
        </button>
      ) : null}
    </div>
  );
}
