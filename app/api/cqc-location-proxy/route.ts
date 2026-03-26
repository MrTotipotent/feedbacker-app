// Server-side proxy for individual CQC location detail records.
// GET /api/cqc-location-proxy?locationId=1-xxxxxxxxx
// Returns the full CQC location JSON including currentRatings, contacts, etc.

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Full browser header set — same as cqc-proxy to avoid WAF fingerprinting.
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

export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get("locationId");

  if (!locationId) {
    return NextResponse.json(
      { error: "locationId query param is required" },
      { status: 400 }
    );
  }

  // Sanitise: locationId must match CQC format e.g. "1-12345678"
  if (!/^[\w-]{1,30}$/.test(locationId)) {
    return NextResponse.json({ error: "Invalid locationId format" }, { status: 400 });
  }

  const upstream = `https://api.cqc.org.uk/public/v1/locations/${encodeURIComponent(locationId)}`;

  try {
    const res = await fetch(upstream, {
      headers: BROWSER_HEADERS,
      cache:   "no-store",
    });

    if (res.status === 403) {
      return NextResponse.json(
        {
          error:
            "CQC API returned 403 for this location. " +
            "The bulk data proxy (/api/cqc-proxy) includes a CSV fallback — " +
            "individual location detail is not available when the API is blocked.",
        },
        { status: 403 }
      );
    }

    if (res.status === 404) {
      return NextResponse.json({ error: "Location not found" }, { status: 404 });
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: `CQC upstream error: HTTP ${res.status}` },
        { status: res.status }
      );
    }

    const json: unknown = await res.json();
    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json(
      { error: "CQC API unreachable", detail: String(err) },
      { status: 502 }
    );
  }
}
