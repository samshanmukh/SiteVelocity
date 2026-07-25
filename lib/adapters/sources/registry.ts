import type { SourceMapping } from "../../domain/candidate-normalizer";

/**
 * Source registry for the San José Alpha. Every entry preserves agency,
 * dataset identity, and the exact endpoint so raw records carry provenance.
 * Field mappings were declared after live schema inspection on 2026-07-25 —
 * never assume field names (docs/SYSTEM_DESIGN.md §10.2).
 */

export const SAN_JOSE_AB2011 = {
  agency: "City of San José — Planning, Building & Code Enforcement",
  dataset: "AB2011Parcels2024",
  description:
    "Parcels the City identified as potentially eligible for AB 2011 streamlined residential development (April 2024 screening), with the City's own constraint flags.",
  layerUrl:
    "https://services.arcgis.com/6kSayNlqm3HvsYZ8/arcgis/rest/services/AB2011Parcels2024/FeatureServer/0",
  landingPage:
    "https://www.arcgis.com/home/item.html?id=&owner=pbce_CSJ",
} as const;

export const SCC_PARCELS = {
  agency: "County of Santa Clara",
  dataset: "Parcels (ubcd-cewv)",
  description: "County parcel fabric with situs address, jurisdiction, and geometry.",
  endpoint: "https://data.sccgov.org/resource/ubcd-cewv.json",
  landingPage: "https://data.sccgov.org/Government/Parcels/ubcd-cewv",
} as const;

export const SAN_JOSE_ZONING = {
  agency: "City of San José GIS",
  dataset: "Zoning District (OPN layer 401)",
  description: "Official zoning districts including PD overlay use/density and rezoning file references.",
  layerUrl: "https://geo.sanjoseca.gov/server/rest/services/OPN/OPN_OpenDataService/MapServer/401",
} as const;

export const SAN_JOSE_GENERAL_PLAN = {
  agency: "City of San José GIS",
  dataset: "General Plan 2040 (OPN layer 404)",
  description: "Envision San José 2040 General Plan land-use designations.",
  layerUrl: "https://geo.sanjoseca.gov/server/rest/services/OPN/OPN_OpenDataService/MapServer/404",
} as const;

export const FEMA_NFHL = {
  agency: "FEMA",
  dataset: "National Flood Hazard Layer (S_Fld_Haz_Ar)",
  description: "Effective flood hazard zones.",
  layerUrl: "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28",
} as const;

/** Mapping for one AB 2011 parcel record → canonical candidate. */
export const AB2011_MAPPING: SourceMapping = {
  selectors: {
    // The AB 2011 layer carries no jurisdiction/address/acreage fields;
    // those stay unknown here and are enriched from the county parcel record.
    apn: "APN",
  },
  sanJoseAliases: ["san jose", "san josé", "city of san jose", "city of san josé"],
  apnSeparators: ["-", " "],
  bounds: {
    parcelAcres: { min: 0.01, max: 10_000 },
    reportedCapacity: { min: 1, max: 50_000 },
    latitude: { min: 36.8, max: 37.6 },
    longitude: { min: -122.3, max: -121.3 },
  },
};

/** Mapping for one Santa Clara County parcel record → canonical candidate. */
export const SCC_PARCEL_MAPPING: SourceMapping = {
  selectors: {
    jurisdiction: "jurisdiction",
    apn: "apn",
  },
  sanJoseAliases: ["san jose", "san josé", "city of san jose", "city of san josé"],
  apnSeparators: ["-", " "],
  bounds: {
    parcelAcres: { min: 0.01, max: 10_000 },
    reportedCapacity: { min: 1, max: 50_000 },
    latitude: { min: 36.8, max: 37.6 },
    longitude: { min: -122.3, max: -121.3 },
  },
};
