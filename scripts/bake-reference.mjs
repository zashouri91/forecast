#!/usr/bin/env node
// Bake reference.xlsx -> window.CM_REFERENCE block in index.html.
//
// Idempotent: same input file produces byte-identical output.
// Run: `node scripts/bake-reference.mjs` (or `npm run bake`).

import { readFileSync, writeFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import XLSX from "xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const XLSX_PATH = join(ROOT, "reference.xlsx");
const HTML_PATH = join(ROOT, "index.html");
const SHEET_NAME = "CM Site reference data";

const HEADER_TO_FIELD = {
  "Building Reference ID": "buildingReferenceId",
  "Building Ref ID (Text)": "buildingRefId",
  "Spaces Location ID": "spacesLocationId",
  "Site Name": "siteName",
  "Location": "location",
  "Site Type": "siteType",
  "Regional Leader": "regionalLeader",
  "Assigned CM(s)": "_assignedCMsRaw",
  "Active sq ft": "_activeSqFt",
  "State": "state",
  "Number of Meeting Rooms": "_meetingRooms",
  "Number of Capsules": "_capsules",
  "Primary Seats": "_primarySeats",
  "Choice Seats": "_choiceSeats",
  "Private Offices available to reserve": "_privateOffices",
  "Workstations": "_workstations",
  "Assigned Workers": "_assignedWorkers",
  "Expected Daily Usage": "_expectedDailyUsage",
  "Avg Tues-Thurs Badge": "_avgTuesThurBadge",
  "Avg Weekly Peak": "_avgWeeklyPeak",
};

const numOrNull = (v) => (v == null || v === "" ? null : Number(v));
const strOrNull = (v) => (v == null || v === "" ? null : String(v).trim());

function parseRow(headerToIdx, row) {
  const get = (h) => row[headerToIdx[h]];
  const cms = (strOrNull(get("Assigned CM(s)")) || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    buildingReferenceId: strOrNull(get("Building Reference ID")),
    buildingRefId: strOrNull(get("Building Ref ID (Text)")),
    spacesLocationId: strOrNull(get("Spaces Location ID")),
    siteName: strOrNull(get("Site Name")),
    location: strOrNull(get("Location")),
    siteType: strOrNull(get("Site Type")),
    state: strOrNull(get("State")),
    regionalLeader: strOrNull(get("Regional Leader")),
    assignedCMs: cms,
    capacity: {
      activeSqFt: numOrNull(get("Active sq ft")),
      meetingRooms: numOrNull(get("Number of Meeting Rooms")),
      capsules: numOrNull(get("Number of Capsules ")) ?? numOrNull(get("Number of Capsules")),
      primarySeats: numOrNull(get("Primary Seats")),
      choiceSeats: numOrNull(get("Choice Seats")),
      privateOffices: numOrNull(get("Private Offices available to reserve")),
      workstations: numOrNull(get("Workstations")),
      assignedWorkers: numOrNull(get("Assigned Workers")),
    },
    baseline: {
      expectedDailyUsage: numOrNull(get("Expected Daily Usage")),
      avgTuesThurBadge: numOrNull(get("Avg Tues-Thurs Badge")),
      avgWeeklyPeak: numOrNull(get("Avg Weekly Peak")),
    },
  };
}

function buildPayload() {
  const wb = XLSX.readFile(XLSX_PATH, { cellDates: false });
  if (!wb.SheetNames.includes(SHEET_NAME)) {
    throw new Error(`Sheet "${SHEET_NAME}" not found. Sheets: ${wb.SheetNames.join(", ")}`);
  }
  const sheet = wb.Sheets[SHEET_NAME];
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const headers = (aoa[0] || []).map((h) => (h == null ? "" : String(h).trim()));
  const headerToIdx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const dataRows = aoa.slice(1).filter((r) => r && r.some((c) => c != null && c !== ""));
  const sites = dataRows.map((r) => parseRow(headerToIdx, r)).filter((s) => s.siteName);

  // canonical sort: by siteName ascending (idempotency)
  sites.sort((a, b) => a.siteName.localeCompare(b.siteName));

  const bySiteName = {};
  const byBuildingRefId = {};
  const byLocationUpper = {};
  for (const s of sites) {
    if (s.siteName) bySiteName[s.siteName.toLowerCase()] = s;
    if (s.buildingRefId) byBuildingRefId[s.buildingRefId] = s;
    if (s.location) byLocationUpper[s.location.toUpperCase()] = s;
  }

  const mtime = statSync(XLSX_PATH).mtime.toISOString().slice(0, 10);
  return { version: mtime, source: "reference.xlsx", sites, bySiteName, byBuildingRefId, byLocationUpper };
}

function renderBlock(payload) {
  // Pretty-printed, stable JSON.stringify (2-space) wrapped in a script tag.
  // Indices reference the same objects in `sites` to keep the payload small,
  // by emitting JSON once and pointing lookups at sites[i].
  const sitesJson = JSON.stringify(payload.sites, null, 2);
  // Build index maps that reference sites by index for compactness.
  const idxBySiteName = {};
  const idxByBuildingRefId = {};
  const idxByLocationUpper = {};
  payload.sites.forEach((s, i) => {
    if (s.siteName) idxBySiteName[s.siteName.toLowerCase()] = i;
    if (s.buildingRefId) idxByBuildingRefId[s.buildingRefId] = i;
    if (s.location) idxByLocationUpper[s.location.toUpperCase()] = i;
  });

  const lines = [
    "<!-- BEGIN REFERENCE -->",
    "<script>",
    "// Baked from reference.xlsx by scripts/bake-reference.mjs — do not hand-edit.",
    "(function(){",
    `var SITES = ${sitesJson};`,
    `var BY_SITE_NAME = ${JSON.stringify(idxBySiteName, null, 2)};`,
    `var BY_BUILDING_REF = ${JSON.stringify(idxByBuildingRefId, null, 2)};`,
    `var BY_LOC_UPPER = ${JSON.stringify(idxByLocationUpper, null, 2)};`,
    "function deref(m){var o={};for(var k in m){o[k]=SITES[m[k]];}return o;}",
    "window.CM_REFERENCE = {",
    `  version: ${JSON.stringify(payload.version)},`,
    `  source: ${JSON.stringify(payload.source)},`,
    "  sites: SITES,",
    "  bySiteName: deref(BY_SITE_NAME),",
    "  byBuildingRefId: deref(BY_BUILDING_REF),",
    "  byLocationUpper: deref(BY_LOC_UPPER)",
    "};",
    "})();",
    "</script>",
    "<!-- END REFERENCE -->",
  ];
  return lines.join("\n");
}

function injectIntoHtml(html, block) {
  const begin = "<!-- BEGIN REFERENCE -->";
  const end = "<!-- END REFERENCE -->";
  const bi = html.indexOf(begin);
  const ei = html.indexOf(end);
  if (bi === -1 || ei === -1 || ei < bi) {
    throw new Error("Sentinels <!-- BEGIN REFERENCE --> / <!-- END REFERENCE --> not found in index.html");
  }
  return html.slice(0, bi) + block + html.slice(ei + end.length);
}

function main() {
  const payload = buildPayload();
  const block = renderBlock(payload);
  const html = readFileSync(HTML_PATH, "utf8");
  const next = injectIntoHtml(html, block);
  if (next === html) {
    console.log(`No change. ${payload.sites.length} sites already baked (version ${payload.version}).`);
    return;
  }
  writeFileSync(HTML_PATH, next, "utf8");
  console.log(`Baked ${payload.sites.length} sites into index.html (version ${payload.version}).`);
}

main();
