"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl, { type GeoJSONSource, type Map as MapboxMap } from "mapbox-gl";
import type { CandidateSite } from "./model";

interface MapboxOpportunityMapProps {
  sites: CandidateSite[];
  selectedSiteId: string | null;
  onSelectSite: (siteId: string) => void;
}

type CandidateProperties = {
  siteId: string;
  label: string;
  score: number;
  selected: boolean;
};

function candidateGeoJson(
  sites: CandidateSite[],
  selectedSiteId: string | null,
): GeoJSON.FeatureCollection<GeoJSON.Point, CandidateProperties> {
  return {
    type: "FeatureCollection",
    features: sites.flatMap((site) => {
      if (!site.coordinates) return [];
      return [{
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [site.coordinates.longitude, site.coordinates.latitude],
        },
        properties: {
          siteId: site.id,
          label: site.address ?? `APN ${site.apnFormatted}`,
          score: site.strategyFit.output.score,
          selected: site.id === selectedSiteId,
        },
      }];
    }),
  };
}

function fitCandidateBounds(map: MapboxMap, sites: CandidateSite[]) {
  const located = sites.filter((site) => site.coordinates);
  if (located.length === 0) return;

  const bounds = new mapboxgl.LngLatBounds();
  for (const site of located) {
    bounds.extend([site.coordinates!.longitude, site.coordinates!.latitude]);
  }
  map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 0 });
}

export function MapboxOpportunityMap({
  sites,
  selectedSiteId,
  onSelectSite,
}: MapboxOpportunityMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const sitesRef = useRef(sites);
  const selectedRef = useRef(selectedSiteId);
  const onSelectRef = useRef(onSelectSite);
  const [loadError, setLoadError] = useState<string | null>(null);

  sitesRef.current = sites;
  selectedRef.current = selectedSiteId;
  onSelectRef.current = onSelectSite;

  const accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim();
  const styleUrl = useMemo(
    () => process.env.NEXT_PUBLIC_MAPBOX_STYLE_URL?.trim()
      || process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim()
      || "mapbox://styles/mapbox/streets-v12",
    [],
  );

  useEffect(() => {
    if (!containerRef.current || !accessToken || mapRef.current) return;

    const map = new mapboxgl.Map({
      accessToken,
      container: containerRef.current,
      style: styleUrl,
      center: [-121.8863, 37.3382],
      zoom: 11,
      attributionControl: true,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

    map.on("load", () => {
      map.addSource("sitevelocity-candidates", {
        type: "geojson",
        data: candidateGeoJson(sitesRef.current, selectedRef.current),
      });
      map.addLayer({
        id: "sitevelocity-candidate-circles",
        type: "circle",
        source: "sitevelocity-candidates",
        paint: {
          "circle-radius": ["case", ["get", "selected"], 16, 13],
          "circle-color": "#ffffff",
          "circle-stroke-width": ["case", ["get", "selected"], 4, 3],
          "circle-stroke-color": ["case", ["get", "selected"], "#B22730", "#2557C7"],
        },
      });
      map.addLayer({
        id: "sitevelocity-candidate-scores",
        type: "symbol",
        source: "sitevelocity-candidates",
        layout: {
          "text-field": ["to-string", ["get", "score"]],
          "text-size": 11,
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#10213B" },
      });

      const selectFeature = (event: mapboxgl.MapMouseEvent) => {
        const feature = map.queryRenderedFeatures(event.point, {
          layers: ["sitevelocity-candidate-circles"],
        })[0];
        const siteId = feature?.properties?.siteId;
        if (typeof siteId === "string") onSelectRef.current(siteId);
      };
      map.on("click", "sitevelocity-candidate-circles", selectFeature);
      map.on("mouseenter", "sitevelocity-candidate-circles", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "sitevelocity-candidate-circles", () => { map.getCanvas().style.cursor = ""; });
      fitCandidateBounds(map, sitesRef.current);
    });

    map.on("error", (event) => {
      const message = event.error?.message ?? "Mapbox could not load the map style.";
      setLoadError(message.includes("401") ? "Mapbox rejected the access token." : "Mapbox could not load the map style.");
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [accessToken, styleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const source = map.getSource("sitevelocity-candidates") as GeoJSONSource | undefined;
    source?.setData(candidateGeoJson(sites, selectedSiteId));
  }, [sites, selectedSiteId]);

  if (!accessToken) {
    return (
      <div className="sv-map-setup" role="status">
        <strong>Mapbox is integrated and needs a public access token.</strong>
        <span>Add <code>NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code> to <code>.env</code>, then restart the dev server.</span>
      </div>
    );
  }

  return (
    <div className="sv-mapbox-shell">
      <div ref={containerRef} className="sv-mapbox-container" aria-label="Map of candidate parcel centroids" />
      {loadError ? <div className="sv-map-error" role="alert">{loadError}</div> : null}
      <div className="sv-legend">Mapbox Streets · markers = Strategy Fit · locations = county parcel centroids</div>
    </div>
  );
}
