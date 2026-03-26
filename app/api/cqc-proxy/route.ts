// Server-side proxy for the CQC Public API paginated GP locations list.
// Strategy:
//   1. Try the live CQC REST API (api.cqc.org.uk) with a full browser header set.
//   2. On 403/blocked, fall back to the CQC monthly bulk-data CSV
//      (cqc.org.uk/sites/default/files/…_HSCA_Active_Locations.csv).
//      Tries the 6 most recent month files automatically.

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ─── Full browser header set including sec-fetch-* ───────────────────────────
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:            "application/json, text/plain, */*",
  "Accept-Language": "en-GB,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Referer:           "https://www.cqc.org.uk/",
  Origin:            "https://www.cqc.org.uk",
  "sec-fetch-dest":  "empty",
  "sec-fetch-mode":  "cors",
  "sec-fetch-site":  "same-origin",
};

// ─── CSV fallback helpers ─────────────────────────────────────────────────────

/** Build candidate CQC bulk-data CSV URLs for the last N months */
function recentCsvUrls(count = 6): string[] {
  const MONTHS = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
  ];
  const now  = new Date();
  const urls: string[] = [];
  for (let i = 0; i < count; i++) {
    const d     = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = MONTHS[d.getMonth()];
    const year  = d.getFullYear();
    urls.push(
      `https://www.cqc.org.uk/sites/default/files/${month}_${year}_HSCA_Active_Locations.csv`
    );
  }
  return urls;
}

/** Minimal CSV parser — handles double-quoted fields containing commas */
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  function splitLine(line: string): string[] {
    const fields: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        // Handle escaped double-quotes ("")
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else { inQ = !inQ; }
      } else if (c === "," && !inQ) {
        fields.push(cur.trim());
        cur = "";
      } else {
        cur += c;
      }
    }
    fields.push(cur.trim());
    return fields;
  }

  const rawHeaders = splitLine(lines[0]);
  const headers    = rawHeaders.map((h) => h.replace(/^"|"$/g, "").trim());

  return lines.slice(1).map((line) => {
    const vals = splitLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? "").replace(/^"|"$/g, "").trim(); });
    return obj;
  });
}

/** Map a CQC CSV column header to the value, trying multiple known variants */
function col(row: Record<string, string>, ...candidates: string[]): string {
  for (const c of candidates) {
    if (row[c] !== undefined) return row[c];
  }
  return "";
}

/**
 * Fetch the CQC bulk CSV, parse it, filter for GP practices, and return a
 * paginated JSON response in the same shape as the REST API.
 */
async function csvFallback(page: number, perPage: number): Promise<NextResponse> {
  const urls = recentCsvUrls(6);

  for (const url of urls) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/csv,text/plain,*/*",
        },
        cache: "no-store",
      });
    } catch {
      continue; // try next URL
    }
    if (!res.ok) continue;

    const text = await res.text();
    if (text.trim().length < 100) continue; // empty / error page

    const rows = parseCSV(text);

    // Filter for GP / primary medical services locations only
    const gp = rows.filter((r) => {
      const cat = col(r,
        "Location Primary Inspection Category",
        "Primary Inspection Category",
      ).toLowerCase();
      return (
        cat.includes("gp") ||
        cat.includes("primary medical") ||
        cat.includes("doctor")
      );
    });

    // Build API-compatible location objects
    const locations = gp.map((r) => {
      const overallRating    = col(r, "Location Latest Overall Rating",    "Latest Overall Rating");
      const responsiveRating = col(r, "Location Latest Responsive Rating", "Latest Responsive Rating");
      const reportDate       = col(r, "Location Latest Overall Rating Date","Latest Overall Rating Date");

      return {
        locationId:           col(r, "Location ID"),
        locationName:         col(r, "Location Name"),
        odsCode:              col(r, "Location ODS Code", "ODS Code"),
        postalCode:           col(r, "Location Postcode", "Postcode"),
        region:               col(r, "Location Region",   "Region"),
        localAuthority:       col(r, "Location Local Authority", "Local Authority"),
        postalAddressLine1:   col(r, "Location Street Address", "Street Address"),
        postalAddressTownCity: col(r, "Location City", "City"),
        postalAddressCounty:  col(r, "Location County", "County"),
        phonenumber:          col(r, "Telephone Number", "Phone Number"),
        website:              col(r, "Web Address", "Website"),
        primaryInspectionCategory: col(r, "Location Primary Inspection Category"),
        currentRatings: {
          overall: overallRating
            ? { rating: overallRating, reportDate }
            : undefined,
          keyQuestions: {
            safe:      { rating: col(r, "Location Latest Safe Rating",      "Latest Safe Rating")      },
            effective: { rating: col(r, "Location Latest Effective Rating",  "Latest Effective Rating")  },
            caring:    { rating: col(r, "Location Latest Caring Rating",     "Latest Caring Rating")     },
            responsive:{ rating: responsiveRating                                                         },
            wellLed:   { rating: col(r, "Location Latest Well-led Rating",   "Latest Well-led Rating")   },
          },
        },
        _source: "csv", // tag so the frontend knows which source was used
      };
    });

    // Paginate
    const total      = locations.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const startIdx   = (page - 1) * perPage;
    const slice      = locations.slice(startIdx, startIdx + perPage);

    return NextResponse.json({
      locations:      slice,
      total,
      totalLocations: total,
      page,
      perPage,
      totalPages,
      _dataSource: `csv:${url}`,
    });
  }

  return NextResponse.json(
    {
      error:
        "CQC API returned 403 and all CSV fallback URLs also failed. " +
        "Visit https://www.cqc.org.uk/about-us/transparency/using-cqc-data " +
        "to find the latest data file URL.",
    },
    { status: 503 }
  );
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const page    = Math.max(1, Number(searchParams.get("page")    ?? "1"));
  const perPage = Math.min(Number(searchParams.get("perPage") ?? "500"), 500);

  // ── 1. Try live CQC REST API ───────────────────────────────────────────────
  const upstream = new URL("https://api.cqc.org.uk/public/v1/locations");
  upstream.searchParams.set("page",                      page.toString());
  upstream.searchParams.set("perPage",                   perPage.toString());
  upstream.searchParams.set("primaryInspectionCategory", "GP");

  try {
    const res = await fetch(upstream.toString(), {
      headers: BROWSER_HEADERS,
      cache:   "no-store",
    });

    if (res.ok) {
      const json: unknown = await res.json();
      return NextResponse.json(json);
    }

    // On 403 (or any non-2xx), fall through to CSV fallback
    if (res.status !== 403) {
      return NextResponse.json(
        { error: `CQC API upstream error: HTTP ${res.status}` },
        { status: res.status }
      );
    }
    // 403 → fall through ↓
  } catch {
    // Network error → fall through to CSV ↓
  }

  // ── 2. CSV fallback ────────────────────────────────────────────────────────
  return csvFallback(page, perPage);
}
