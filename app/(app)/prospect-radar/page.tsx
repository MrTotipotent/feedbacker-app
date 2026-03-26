"use client";

// ─── Prospect Radar — Internal Feedbacker Sales Tool ──────────────────────────
// Not linked from the sidebar nav. Access via /prospect-radar directly.
// Queries CQC Public API, GP Patient Survey CSV, and Google Places API.
// All results are cached in localStorage for 24 h to minimise API calls.

import { useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CQCRatings {
  overall?:      { rating?: string; reportDate?: string };
  keyQuestions?: {
    safe?:       { rating?: string };
    effective?:  { rating?: string };
    caring?:     { rating?: string };
    responsive?: { rating?: string };
    wellLed?:    { rating?: string };
  };
  // Some CQC API responses use a flat array instead of the keyed object
  keyQuestion?: Array<{ name?: string; rating?: string }>;
}

interface CQCLocation {
  locationId:              string;
  locationName:            string;
  odsCode?:                string | null;
  postalCode?:             string | null;
  region?:                 string | null;
  localAuthority?:         string | null;
  website?:                string | null;
  phonenumber?:            string | null;
  postalAddressLine1?:     string | null;
  postalAddressTownCity?:  string | null;
  postalAddressCounty?:    string | null;
  currentRatings?:         CQCRatings | null;
}

interface GoogleResult {
  found:  boolean;
  rating: number | null;
  count:  number;
}

interface Prospect {
  locationId:           string;
  practiceName:         string;
  address:              string;
  postcode:             string;
  phone:                string;
  website:              string;
  region:               string;
  odsCode:              string;
  // CQC
  cqcOverallRating:     string;
  cqcResponsiveRating:  string;
  lastInspectionDate:   string | null;
  cqcFlag:              boolean; // Responsive = RI or Inadequate → +1 heat
  // GPPS
  gppsScore:            number | null;
  gppsFlag:             boolean; // bottom 25% overall experience → +1 heat
  // Google
  googleRating:         number | null;
  googleCount:          number;
  googleFlag:           boolean; // ≤ 3.0 stars → +1 heat
  // Composite
  heatScore:            0 | 1 | 2 | 3;
}

type SortField  = "heat" | "google" | "inspection" | "gpps";
type HeatFilter = "all"  | "hot"    | "warm"       | "lukewarm";

// ─── localStorage keys ────────────────────────────────────────────────────────

const LS_GKEY        = "pr_google_api_key";
const LS_GPPS_URL    = "pr_gpps_url";
const LS_CQC_DATA    = "pr_cqc_data";
const LS_CQC_TS      = "pr_cqc_ts";
const LS_GPPS_DATA   = "pr_gpps_data";
const LS_GPPS_TS     = "pr_gpps_ts";
const LS_GPPS_P25    = "pr_gpps_p25";
const LS_PROSPECTS   = "pr_prospects";
const LS_PROSPECTS_TS = "pr_prospects_ts";
const LS_TOTAL       = "pr_total_scanned";

const CACHE_TTL     = 24 * 60 * 60 * 1000; // 24 h
const PAGE_SIZE     = 50;
const GOOGLE_BATCH  = 5;   // fetch N Google ratings in parallel
const GOOGLE_LIMIT  = 200; // max practices to fetch Google for
const GOOGLE_DELAY  = 200; // ms between batches

// Default GPPS URL — update annually when NHS England publishes new data.
// Find the practice-level CSV at https://www.gp-patient.co.uk/performance
const GPPS_DEFAULT_URL =
  "https://www.gp-patient.co.uk/performance-data/GPPS_2024_Practice_Results.csv";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract the CQC responsive rating from either keyQuestions object or legacy array */
function getResponsiveRating(r?: CQCRatings | null): string {
  if (!r) return "Not yet rated";
  if (r.keyQuestions?.responsive?.rating) return r.keyQuestions.responsive.rating;
  const kq = r.keyQuestion?.find(
    (q) => (q.name ?? "").toLowerCase().includes("responsive")
  );
  if (kq?.rating) return kq.rating;
  return "Not yet rated";
}

/** Extract the CQC overall rating */
function getOverallRating(r?: CQCRatings | null): string {
  return r?.overall?.rating ?? "Not yet rated";
}

/** Extract the CQC report date string (various formats from the API) */
function getReportDate(r?: CQCRatings | null): string | null {
  return r?.overall?.reportDate ?? null;
}

/** Format a date string for display, handling ISO and "DD Month YYYY" formats */
function formatDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }
  return s; // return as-is if unparseable
}

/** Returns age of a date in years, or null */
function ageInYears(s: string | null): number | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
}

/** Compute heat score 0–3 from flags */
function computeHeat(
  cqcFlag: boolean,
  gppsFlag: boolean,
  googleFlag: boolean
): 0 | 1 | 2 | 3 {
  return (Number(cqcFlag) + Number(gppsFlag) + Number(googleFlag)) as 0 | 1 | 2 | 3;
}

// ─── Minimal CSV parser (handles quoted fields, flexible column detection) ────

function parseCSVRows(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  function parseLine(line: string): string[] {
    const fields: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === "," && !inQ) { fields.push(cur.trim()); cur = ""; }
      else { cur += c; }
    }
    fields.push(cur.trim());
    return fields;
  }

  const headers = parseLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")
  );

  return lines.slice(1).map((line) => {
    const vals = parseLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
    return obj;
  });
}

/** Find the ODS/practice code column in a parsed GPPS CSV header set */
function detectCodeCol(headers: string[]): string | null {
  const exact = ["practice_code", "practicecode", "ods_code", "odscode", "gp_code", "practice_id"];
  for (const c of exact) if (headers.includes(c)) return c;
  return headers.find((h) => h.includes("practice") && h.includes("code")) ?? null;
}

/** Find the "overall experience % positive" column in a parsed GPPS CSV */
function detectOverallCol(headers: string[]): string | null {
  const exact = [
    "q68_pct_positive", "q68_positive_pct", "q68pctpositive",
    "overall_experience_pct_positive", "overall_pct_positive",
    "q_68_pct_positive", "q68positive", "q68_good_very_good",
  ];
  for (const c of exact) if (headers.includes(c)) return c;
  return (
    headers.find((h) => h.includes("q68") && (h.includes("pct") || h.includes("pos") || h.includes("perc"))) ?? null
  );
}

// ─── Pitch email builder ──────────────────────────────────────────────────────

function buildPitchEmail(p: Prospect): string {
  const weaknesses: string[] = [];
  if (p.cqcFlag) {
    weaknesses.push(
      `a 'Requires Improvement' rating for Responsiveness in your most recent CQC inspection${p.lastInspectionDate ? ` (${formatDate(p.lastInspectionDate)})` : ""}`
    );
  }
  if (p.gppsFlag && p.gppsScore !== null) {
    weaknesses.push(
      `a score of ${p.gppsScore.toFixed(0)}% positive for overall patient experience in the GP Patient Survey (bottom 25% nationally)`
    );
  }
  if (p.googleFlag && p.googleRating !== null) {
    weaknesses.push(`a ${p.googleRating.toFixed(1)}-star rating on Google Reviews`);
  }

  const issues =
    weaknesses.length === 0
      ? "challenges with patient feedback"
      : weaknesses.length === 1
        ? weaknesses[0]
        : weaknesses.slice(0, -1).join(", ") + ", and " + weaknesses[weaknesses.length - 1];

  const subject = `Helping ${p.practiceName} improve patient feedback & CQC evidence`;
  const body = `Hi Practice Manager,

I noticed ${p.practiceName} received ${issues}.

We built Feedbacker specifically for practices in this position — a lightweight patient feedback tool that generates structured CQC evidence, captures real-time sentiment from patients after appointments, and helps your team respond to Google reviews professionally.

Practices using Feedbacker have improved their patient satisfaction scores within 3 months.

Would you be open to a 15-minute demo? https://calendly.com/feedbacker

Best regards,
The Feedbacker Team`;

  return `Subject: ${subject}\n\n${body}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HeatBadge({ score }: { score: 0 | 1 | 2 | 3 }) {
  if (score === 3)
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full"
        style={{ background: "#FEE2E2", color: "#B91C1C" }}>🔴 Hot</span>
    );
  if (score === 2)
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full"
        style={{ background: "#FEF3C7", color: "#92400E" }}>🟠 Warm</span>
    );
  if (score === 1)
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full"
        style={{ background: "#FFF9C4", color: "#854D0E" }}>🟡 Lukewarm</span>
    );
  return (
    <span className="inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full"
      style={{ background: "#F0F4F9", color: "#64748B" }}>—</span>
  );
}

function RatingBadge({ rating }: { rating: string }) {
  const r = rating.toLowerCase();
  const style =
    r.includes("outstanding")
      ? { background: "#D1FAE5", color: "#065F46" }
      : r.includes("good")
        ? { background: "#DCFCE7", color: "#166534" }
        : r.includes("requires")
          ? { background: "#FEF3C7", color: "#92400E" }
          : r.includes("inadequate")
            ? { background: "#FEE2E2", color: "#B91C1C" }
            : { background: "#F0F4F9", color: "#64748B" };

  const label =
    r.includes("requires") ? "Req. Improvement"
    : r.includes("inadequate") ? "Inadequate"
    : r.includes("outstanding") ? "Outstanding"
    : r.includes("good") ? "Good"
    : "Not rated";

  return (
    <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={style}>
      {label}
    </span>
  );
}

function SortArrow({ field, current, dir }: { field: SortField; current: SortField; dir: "asc" | "desc" }) {
  if (field !== current) return <span className="opacity-30 text-[10px]">↕</span>;
  return <span className="text-[10px]">{dir === "desc" ? "↓" : "↑"}</span>;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProspectRadar() {

  // ── State ─────────────────────────────────────────────────────────────────
  const [prospects,     setProspects]     = useState<Prospect[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [loadPhase,     setLoadPhase]     = useState("");
  const [progress,      setProgress]      = useState(0);
  const [error,         setError]         = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [totalScanned,  setTotalScanned]  = useState(0);

  // Settings
  const [googleKey,    setGoogleKey]    = useState("");
  const [gppsUrl,      setGppsUrl]      = useState(GPPS_DEFAULT_URL);
  const [showSettings, setShowSettings] = useState(false);

  // Filters + sort
  const [filterHeat,   setFilterHeat]   = useState<HeatFilter>("all");
  const [filterRegion, setFilterRegion] = useState("all");
  const [sortField,    setSortField]    = useState<SortField>("heat");
  const [sortDir,      setSortDir]      = useState<"asc" | "desc">("desc");
  const [page,         setPage]         = useState(1);
  const [copiedId,     setCopiedId]     = useState<string | null>(null);

  const abortRef = useRef(false);

  // ── Restore from localStorage on mount ───────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    setGoogleKey(localStorage.getItem(LS_GKEY)     ?? "");
    setGppsUrl(  localStorage.getItem(LS_GPPS_URL) ?? GPPS_DEFAULT_URL);

    const cached = localStorage.getItem(LS_PROSPECTS);
    const ts     = localStorage.getItem(LS_PROSPECTS_TS);
    const total  = localStorage.getItem(LS_TOTAL);
    if (cached && ts) {
      try {
        setProspects(JSON.parse(cached) as Prospect[]);
        setLastRefreshed(new Date(Number(ts)).toLocaleString("en-GB"));
        setTotalScanned(Number(total ?? "0"));
      } catch { /* ignore corrupt cache */ }
    }
  }, []);

  function saveSettings() {
    localStorage.setItem(LS_GKEY,     googleKey);
    localStorage.setItem(LS_GPPS_URL, gppsUrl);
    setShowSettings(false);
  }

  // ── CQC data fetch (paginated) ────────────────────────────────────────────
  async function fetchAllCQC(force: boolean): Promise<CQCLocation[]> {
    setLoadPhase("Fetching CQC GP locations…");

    if (!force) {
      const cached = localStorage.getItem(LS_CQC_DATA);
      const ts     = localStorage.getItem(LS_CQC_TS);
      if (cached && ts && Date.now() - Number(ts) < CACHE_TTL) {
        return JSON.parse(cached) as CQCLocation[];
      }
    }

    const all: CQCLocation[] = [];
    let pg = 1;
    let totalPages = 1;

    do {
      if (abortRef.current) throw new Error("Aborted");

      const res = await fetch(`/api/cqc-proxy?page=${pg}&perPage=1000`);
      if (!res.ok) throw new Error(`CQC API error ${res.status}`);

      const data = await res.json() as {
        locations?:      CQCLocation[];
        totalLocations?: number;
        total?:          number;
        totalPages?:     number;
      };

      if (data.locations?.length) all.push(...data.locations);

      const total = data.totalLocations ?? data.total ?? 0;
      totalPages  = data.totalPages ?? (total > 0 ? Math.ceil(total / 1000) : 1);
      // CQC fetch drives 0-40% of overall progress bar
      setProgress(Math.round((pg / totalPages) * 40));
      pg++;
    } while (pg <= totalPages);

    localStorage.setItem(LS_CQC_DATA, JSON.stringify(all));
    localStorage.setItem(LS_CQC_TS,   Date.now().toString());
    return all;
  }

  // ── GPPS data fetch + parse ────────────────────────────────────────────────
  /** Returns a map of ODS code → overall experience % positive, and sets the 25th-percentile threshold */
  async function fetchGPPS(force: boolean): Promise<Map<string, number>> {
    setLoadPhase("Fetching GP Patient Survey data…");
    setProgress(42);

    const map = new Map<string, number>();

    if (!force) {
      const cached = localStorage.getItem(LS_GPPS_DATA);
      const ts     = localStorage.getItem(LS_GPPS_TS);
      if (cached && ts && Date.now() - Number(ts) < CACHE_TTL) {
        const arr = JSON.parse(cached) as Array<[string, number]>;
        arr.forEach(([k, v]) => map.set(k, v));
        return map;
      }
    }

    const url = localStorage.getItem(LS_GPPS_URL) ?? gppsUrl;
    if (!url) return map;

    try {
      const res = await fetch(`/api/gpps-proxy?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`GPPS HTTP ${res.status}`);

      const text = await res.text();
      const rows = parseCSVRows(text);
      if (!rows.length) throw new Error("GPPS CSV appears empty");

      const headers  = Object.keys(rows[0]);
      const codeCol  = detectCodeCol(headers);
      const scoreCol = detectOverallCol(headers);

      if (!codeCol || !scoreCol) {
        console.warn("[ProspectRadar] GPPS column detection failed. Headers:", headers.slice(0, 15));
        return map;
      }

      const scores: number[] = [];
      for (const row of rows) {
        const code = (row[codeCol] ?? "").trim().toUpperCase();
        const val  = parseFloat((row[scoreCol] ?? "").replace("%", ""));
        if (code && !isNaN(val)) { map.set(code, val); scores.push(val); }
      }

      // 25th-percentile threshold for "bottom quartile" flag
      if (scores.length) {
        scores.sort((a, b) => a - b);
        const p25 = scores[Math.floor(scores.length * 0.25)];
        localStorage.setItem(LS_GPPS_P25, p25.toString());
      }

      localStorage.setItem(LS_GPPS_DATA, JSON.stringify(Array.from(map.entries())));
      localStorage.setItem(LS_GPPS_TS,   Date.now().toString());
    } catch (err) {
      // GPPS failure is non-fatal — continue without it
      console.warn("[ProspectRadar] GPPS fetch failed:", err);
    }

    return map;
  }

  // ── Google Places fetch for one practice ──────────────────────────────────
  async function fetchGoogle(loc: CQCLocation): Promise<GoogleResult> {
    const cacheKey = `pr_google_${loc.locationId}`;
    const cached   = localStorage.getItem(cacheKey);
    if (cached) {
      try { return JSON.parse(cached) as GoogleResult; } catch { /* */ }
    }

    const key = localStorage.getItem(LS_GKEY) ?? "";
    if (!key) return { found: false, rating: null, count: 0 };

    const q = `${loc.locationName} ${loc.postalCode ?? ""} GP`;
    try {
      const res  = await fetch(`/api/google-places-proxy?q=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`);
      const data = await res.json() as GoogleResult;
      if (res.ok) localStorage.setItem(cacheKey, JSON.stringify(data));
      return data;
    } catch {
      return { found: false, rating: null, count: 0 };
    }
  }

  // ── Build a Prospect from a CQC location ─────────────────────────────────
  function buildProspect(loc: CQCLocation, gppsMap: Map<string, number>, gppsP25: number): Prospect {
    const ratings           = loc.currentRatings;
    const cqcOverall        = getOverallRating(ratings);
    const cqcResponsive     = getResponsiveRating(ratings);
    const lastInspectionDate = getReportDate(ratings);
    const cqcFlag           = cqcResponsive === "Requires Improvement" || cqcResponsive === "Inadequate";

    const odsCode  = (loc.odsCode ?? "").trim().toUpperCase();
    const gppsScore = gppsMap.has(odsCode) ? (gppsMap.get(odsCode) ?? null) : null;
    const gppsFlag  = gppsScore !== null && gppsP25 > 0 && gppsScore < gppsP25;

    const address = [
      loc.postalAddressLine1,
      loc.postalAddressTownCity,
      loc.postalAddressCounty,
    ].filter(Boolean).join(", ");

    return {
      locationId:           loc.locationId,
      practiceName:         loc.locationName,
      address,
      postcode:             loc.postalCode  ?? "",
      phone:                loc.phonenumber ?? "",
      website:              loc.website     ?? "",
      region:               loc.region      ?? "",
      odsCode,
      cqcOverallRating:     cqcOverall,
      cqcResponsiveRating:  cqcResponsive,
      lastInspectionDate,
      cqcFlag,
      gppsScore,
      gppsFlag,
      googleRating:         null,
      googleCount:          0,
      googleFlag:           false,
      heatScore:            computeHeat(cqcFlag, gppsFlag, false),
    };
  }

  // ── Main data refresh ─────────────────────────────────────────────────────
  async function refresh(force: boolean) {
    if (loading) return;
    abortRef.current = false;
    setLoading(true);
    setError(null);
    setProgress(0);

    try {
      // 1 ── CQC (0–40%)
      const cqcAll = await fetchAllCQC(force);
      setTotalScanned(cqcAll.length);

      // 2 ── GPPS (40–50%)
      const gppsMap = await fetchGPPS(force);
      const gppsP25 = parseFloat(localStorage.getItem(LS_GPPS_P25) ?? "0");
      setProgress(52);

      // 3 ── Build initial prospects (50–60%)
      setLoadPhase("Building prospect list…");
      const list: Prospect[] = cqcAll.map((loc) => buildProspect(loc, gppsMap, gppsP25));
      list.sort((a, b) => b.heatScore - a.heatScore);
      setProspects([...list]);
      setProgress(60);

      // 4 ── Google ratings for flagged practices (60–100%)
      const key = localStorage.getItem(LS_GKEY) ?? "";
      const toGoogle = list.filter((p) => p.cqcFlag).slice(0, GOOGLE_LIMIT);

      if (key && toGoogle.length > 0) {
        const cqcById = new Map(cqcAll.map((l) => [l.locationId, l]));

        for (let i = 0; i < toGoogle.length; i += GOOGLE_BATCH) {
          if (abortRef.current) break;

          const batch = toGoogle.slice(i, i + GOOGLE_BATCH);
          await Promise.all(
            batch.map(async (p) => {
              const loc    = cqcById.get(p.locationId)!;
              const result = await fetchGoogle(loc);
              p.googleRating = result.rating;
              p.googleCount  = result.count;
              p.googleFlag   = result.found && result.rating !== null && result.rating <= 3.0;
              p.heatScore    = computeHeat(p.cqcFlag, p.gppsFlag, p.googleFlag);
            })
          );

          const done = Math.min(i + GOOGLE_BATCH, toGoogle.length);
          setProgress(60 + Math.round((done / toGoogle.length) * 40));
          setLoadPhase(`Fetching Google ratings (${done} / ${toGoogle.length})…`);
          // Re-render with partial Google data
          setProspects([...list].sort((a, b) => b.heatScore - a.heatScore));

          if (i + GOOGLE_BATCH < toGoogle.length) {
            await new Promise<void>((r) => setTimeout(r, GOOGLE_DELAY));
          }
        }
      }

      // 5 ── Final sort + cache
      const final = [...list].sort((a, b) => b.heatScore - a.heatScore);
      setProspects(final);
      const now = Date.now();
      localStorage.setItem(LS_PROSPECTS,    JSON.stringify(final));
      localStorage.setItem(LS_PROSPECTS_TS, now.toString());
      localStorage.setItem(LS_TOTAL,        cqcAll.length.toString());
      setLastRefreshed(new Date(now).toLocaleString("en-GB"));
      setProgress(100);
    } catch (err) {
      if (!abortRef.current) {
        setError(err instanceof Error ? err.message : "Unknown error occurred");
      }
    } finally {
      setLoading(false);
      setLoadPhase("");
    }
  }

  // ── Copy email ────────────────────────────────────────────────────────────
  function copyEmail(p: Prospect) {
    navigator.clipboard
      .writeText(buildPitchEmail(p))
      .then(() => { setCopiedId(p.locationId); setTimeout(() => setCopiedId(null), 2000); })
      .catch(() => alert("Copy failed — please try a different browser"));
  }

  // ── Sort handler ──────────────────────────────────────────────────────────
  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
    setPage(1);
  }

  // ── Derived: filter + sort + paginate ─────────────────────────────────────
  const regions = Array.from(new Set(prospects.map((p) => p.region).filter(Boolean))).sort();

  const filtered = prospects
    .filter((p) => {
      if (filterHeat === "hot"      && p.heatScore !== 3) return false;
      if (filterHeat === "warm"     && p.heatScore !== 2) return false;
      if (filterHeat === "lukewarm" && p.heatScore !== 1) return false;
      if (filterRegion !== "all"    && p.region !== filterRegion) return false;
      return true;
    })
    .sort((a, b) => {
      let diff = 0;
      switch (sortField) {
        case "heat":
          diff = a.heatScore - b.heatScore; break;
        case "google":
          diff = (a.googleRating ?? 99) - (b.googleRating ?? 99); break;
        case "gpps":
          diff = (a.gppsScore ?? 100) - (b.gppsScore ?? 100); break;
        case "inspection": {
          const dA = a.lastInspectionDate ? new Date(a.lastInspectionDate).getTime() : 0;
          const dB = b.lastInspectionDate ? new Date(b.lastInspectionDate).getTime() : 0;
          diff = dA - dB;
          break;
        }
      }
      return sortDir === "desc" ? -diff : diff;
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hotCount   = prospects.filter((p) => p.heatScore === 3).length;
  const warmCount  = prospects.filter((p) => p.heatScore === 2).length;

  // ── Classes ───────────────────────────────────────────────────────────────
  const thCls = "px-4 py-3 text-[11px] font-bold text-slate-light uppercase tracking-wider text-left whitespace-nowrap";
  const tdCls = "px-4 py-3.5 text-sm align-top";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 lg:p-8 max-w-full">

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-nhs-blue-dark">🎯 Prospect Radar</h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
              style={{ background: "#FEE2E2", color: "#B91C1C" }}>
              Internal Only
            </span>
          </div>
          <p className="text-sm text-slate-light mt-0.5">
            Highest-value Feedbacker sales targets — cross-referenced across CQC, GPPS &amp; Google Reviews
          </p>
          {lastRefreshed && (
            <p className="text-xs text-slate-light mt-1">Last refreshed: {lastRefreshed}</p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowSettings((s) => !s)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-border text-slate hover:border-nhs-blue hover:text-nhs-blue transition-colors">
            ⚙️ Settings
          </button>
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-border text-slate hover:border-nhs-blue hover:text-nhs-blue transition-colors">
            🖨️ Print / PDF
          </button>
          <button onClick={() => refresh(true)} disabled={loading}
            className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg bg-nhs-blue text-white hover:bg-nhs-blue-dark disabled:opacity-50 transition-colors shadow-sm">
            {loading ? "Loading…" : "🔄 Refresh Data"}
          </button>
        </div>
      </div>

      {/* ── Settings panel ───────────────────────────────────────────── */}
      {showSettings && (
        <div className="mb-5 bg-white rounded-[10px] border border-border p-5"
          style={{ boxShadow: "0 2px 12px rgba(0,94,184,0.08)" }}>
          <h3 className="text-sm font-bold text-nhs-blue-dark mb-4">Data Sources &amp; API Keys</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-slate mb-1.5">
                Google Places API Key
                <span className="ml-1 font-normal text-slate-light">(stored in browser only — never sent to Xano)</span>
              </label>
              <input type="password" value={googleKey}
                onChange={(e) => setGoogleKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-nhs-blue/30 focus:border-nhs-blue" />
              <p className="text-[11px] text-slate-light mt-1">
                Enable the <em>Places API</em> in Google Cloud Console. Leave blank to skip Google ratings.
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate mb-1.5">
                GPPS Practice-Level CSV URL
                <span className="ml-1 font-normal text-slate-light">(update annually)</span>
              </label>
              <input type="text" value={gppsUrl}
                onChange={(e) => setGppsUrl(e.target.value)}
                placeholder="https://www.gp-patient.co.uk/..."
                className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-nhs-blue/30 focus:border-nhs-blue" />
              <p className="text-[11px] text-slate-light mt-1">
                Find the direct CSV download link at{" "}
                <a href="https://www.gp-patient.co.uk/performance" target="_blank" rel="noreferrer"
                  className="text-nhs-blue underline">gp-patient.co.uk/performance</a>.
                Leave blank to skip GPPS scoring.
              </p>
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button onClick={saveSettings}
              className="text-sm font-semibold px-4 py-2 rounded-lg bg-nhs-blue text-white hover:bg-nhs-blue-dark transition-colors">
              Save Settings
            </button>
          </div>
        </div>
      )}

      {/* ── Progress bar ─────────────────────────────────────────────── */}
      {loading && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-semibold text-nhs-blue">{loadPhase}</p>
            <p className="text-xs text-slate-light">{progress}%</p>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "#E8EFF7" }}>
            <div className="h-full bg-nhs-blue rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* ── Error banner ─────────────────────────────────────────────── */}
      {error && (
        <div className="mb-5 bg-red-50 border border-red-200 rounded-[10px] px-4 py-3 text-sm text-red-700">
          ⚠️ {error}
        </div>
      )}

      {/* ── KPI stats ────────────────────────────────────────────────── */}
      {(prospects.length > 0 || totalScanned > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: "GP Practices Scanned", value: (totalScanned || prospects.length).toLocaleString(), color: "#005EB8" },
            { label: "🔴 Hot Prospects",      value: hotCount.toLocaleString(),                          color: "#B91C1C" },
            { label: "🟠 Warm Prospects",      value: warmCount.toLocaleString(),                         color: "#92400E" },
            { label: "Showing (filtered)",     value: filtered.length.toLocaleString(),                   color: "#425563" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-[10px] border border-border p-4"
              style={{ boxShadow: "0 2px 12px rgba(0,94,184,0.08)" }}>
              <p className="text-xs text-slate-light mb-0.5">{s.label}</p>
              <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Filter bar ───────────────────────────────────────────────── */}
      {prospects.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {/* Heat filter pills */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(["all", "hot", "warm", "lukewarm"] as HeatFilter[]).map((h) => (
              <button key={h}
                onClick={() => { setFilterHeat(h); setPage(1); }}
                className={`text-xs font-semibold px-3 py-2 border-r last:border-r-0 border-border transition-colors ${
                  filterHeat === h
                    ? "bg-nhs-blue text-white"
                    : "bg-white text-slate hover:bg-off-white"
                }`}>
                {h === "all" ? "All" : h.charAt(0).toUpperCase() + h.slice(1)}
              </button>
            ))}
          </div>
          {/* Region dropdown */}
          <select value={filterRegion}
            onChange={(e) => { setFilterRegion(e.target.value); setPage(1); }}
            className="text-sm border border-border rounded-lg px-3 py-2 bg-white text-slate focus:outline-none focus:ring-2 focus:ring-nhs-blue/30 focus:border-nhs-blue">
            <option value="all">All Regions</option>
            {regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <span className="text-xs text-slate-light ml-auto">{filtered.length.toLocaleString()} matching practices</span>
        </div>
      )}

      {/* ── Empty / call-to-action ────────────────────────────────────── */}
      {!loading && prospects.length === 0 && (
        <div className="bg-white rounded-[10px] border border-border p-16 text-center"
          style={{ boxShadow: "0 2px 12px rgba(0,94,184,0.08)" }}>
          <div className="text-5xl mb-4">🎯</div>
          <h2 className="text-lg font-bold text-nhs-blue-dark mb-2">No data yet</h2>
          <p className="text-sm text-slate-light mb-2 max-w-md mx-auto">
            Click <strong>Refresh Data</strong> to scan all ~6,500 GP practices across England via the CQC API,
            overlay GP Patient Survey scores, and identify your hottest sales targets.
          </p>
          <p className="text-xs text-slate-light mb-6">
            Add your Google Places API key in ⚙️ Settings to also pull live star ratings.
          </p>
          <button onClick={() => refresh(false)}
            className="text-sm font-semibold px-5 py-2.5 rounded-xl bg-nhs-blue text-white hover:bg-nhs-blue-dark transition-colors shadow-md">
            Load Prospect Data
          </button>
        </div>
      )}

      {/* ── Prospects table ───────────────────────────────────────────── */}
      {prospects.length > 0 && (
        <div className="bg-white rounded-[10px] border border-border overflow-hidden mb-6"
          style={{ boxShadow: "0 2px 12px rgba(0,94,184,0.08)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead>
                <tr className="border-b border-border bg-off-white">
                  <th className={thCls}>Practice</th>
                  <th className={thCls}>Address</th>
                  <th className={thCls}>CQC Ratings</th>
                  <th className={thCls}>
                    <button onClick={() => toggleSort("inspection")}
                      className="flex items-center gap-1 hover:text-nhs-blue transition-colors">
                      Last Inspection <SortArrow field="inspection" current={sortField} dir={sortDir} />
                    </button>
                  </th>
                  <th className={thCls}>
                    <button onClick={() => toggleSort("gpps")}
                      className="flex items-center gap-1 hover:text-nhs-blue transition-colors">
                      GPPS Score <SortArrow field="gpps" current={sortField} dir={sortDir} />
                    </button>
                  </th>
                  <th className={thCls}>
                    <button onClick={() => toggleSort("google")}
                      className="flex items-center gap-1 hover:text-nhs-blue transition-colors">
                      Google Rating <SortArrow field="google" current={sortField} dir={sortDir} />
                    </button>
                  </th>
                  <th className={thCls}>
                    <button onClick={() => toggleSort("heat")}
                      className="flex items-center gap-1 hover:text-nhs-blue transition-colors">
                      Heat Score <SortArrow field="heat" current={sortField} dir={sortDir} />
                    </button>
                  </th>
                  <th className={thCls + " text-right"}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((p) => {
                  const overdue = (ageInYears(p.lastInspectionDate) ?? 0) > 3;
                  const rowBg =
                    p.heatScore === 3 ? "rgba(254,226,226,0.35)"
                    : p.heatScore === 2 ? "rgba(254,243,199,0.35)"
                    : undefined;

                  return (
                    <tr key={p.locationId}
                      className="hover:bg-off-white/60 transition-colors"
                      style={rowBg ? { background: rowBg } : undefined}>

                      {/* Practice name + phone + website */}
                      <td className={tdCls} style={{ minWidth: 200 }}>
                        <p className="font-semibold text-nhs-blue-dark leading-tight">{p.practiceName}</p>
                        {p.phone && <p className="text-xs text-slate-light mt-0.5">{p.phone}</p>}
                        {p.website && (
                          <a href={p.website.startsWith("http") ? p.website : `https://${p.website}`}
                            target="_blank" rel="noreferrer"
                            className="text-[11px] text-nhs-blue hover:underline mt-0.5 block truncate max-w-[200px]">
                            {p.website}
                          </a>
                        )}
                      </td>

                      {/* Address */}
                      <td className={tdCls} style={{ minWidth: 160 }}>
                        <p className="text-xs text-slate leading-snug">{p.address || "—"}</p>
                        <p className="font-mono text-[11px] text-slate-light mt-0.5">{p.postcode}</p>
                        <p className="text-[11px] text-slate-light">{p.region}</p>
                      </td>

                      {/* CQC ratings */}
                      <td className={tdCls} style={{ minWidth: 180 }}>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-slate-light">Overall:</span>
                            <RatingBadge rating={p.cqcOverallRating} />
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-slate-light">Responsive:</span>
                            <RatingBadge rating={p.cqcResponsiveRating} />
                          </div>
                        </div>
                      </td>

                      {/* Last inspection date */}
                      <td className={tdCls}>
                        <span className={`text-xs font-medium ${overdue ? "text-red-600" : "text-slate"}`}>
                          {formatDate(p.lastInspectionDate)}
                        </span>
                        {overdue && p.lastInspectionDate && (
                          <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ background: "#FEE2E2", color: "#B91C1C" }}>
                            Overdue
                          </span>
                        )}
                      </td>

                      {/* GPPS overall experience */}
                      <td className={tdCls}>
                        {p.gppsScore !== null ? (
                          <div>
                            <span className={`text-sm font-bold ${p.gppsFlag ? "text-amber-700" : "text-slate"}`}>
                              {p.gppsScore.toFixed(0)}%
                            </span>
                            {p.gppsFlag && (
                              <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                style={{ background: "#FEF3C7", color: "#92400E" }}>
                                Bottom 25%
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-light">—</span>
                        )}
                      </td>

                      {/* Google rating */}
                      <td className={tdCls}>
                        {p.googleRating !== null ? (
                          <div>
                            <span className={`text-sm font-bold ${p.googleFlag ? "text-red-600" : "text-slate"}`}>
                              ★ {p.googleRating.toFixed(1)}
                            </span>
                            {p.googleCount > 0 && (
                              <span className="text-xs text-slate-light ml-1">({p.googleCount})</span>
                            )}
                            {p.googleFlag && (
                              <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                style={{ background: "#FEE2E2", color: "#B91C1C" }}>
                                Low
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-light">—</span>
                        )}
                      </td>

                      {/* Heat score */}
                      <td className={tdCls}>
                        <HeatBadge score={p.heatScore} />
                      </td>

                      {/* Actions */}
                      <td className={tdCls + " text-right"}>
                        <button onClick={() => copyEmail(p)}
                          title="Copy personalised pitch email to clipboard"
                          className="text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-border text-slate hover:border-nhs-blue hover:text-nhs-blue transition-colors whitespace-nowrap">
                          {copiedId === p.locationId ? "✓ Copied!" : "📋 Copy Email"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-off-white">
              <p className="text-xs text-slate-light">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString()}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border text-slate hover:border-nhs-blue hover:text-nhs-blue disabled:opacity-40 transition-colors">
                  ← Prev
                </button>
                <span className="text-xs text-slate-light font-medium">
                  {page} / {totalPages}
                </span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border text-slate hover:border-nhs-blue hover:text-nhs-blue disabled:opacity-40 transition-colors">
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Print styles ──────────────────────────────────────────────── */}
      <style>{`
        @media print {
          body { font-size: 9px; background: white !important; }
          .lg\\:ml-60 { margin-left: 0 !important; }
          aside, nav { display: none !important; }
          .overflow-x-auto { overflow: visible !important; }
          td, th { padding: 3px 6px !important; font-size: 8px !important; }
          button { display: none !important; }
          select { display: none !important; }
          input  { display: none !important; }
        }
        @media print {
          @page { size: A4 landscape; margin: 1cm; }
        }
      `}</style>
    </div>
  );
}
