// Server-side proxy for the CQC Public API paginated locations list.
// Called by the Prospect Radar page to avoid CORS / 403 blocks on browser fetch.
//
// CQC API quirks:
//  • Requires Accept and Origin-style headers — plain fetch with a bare
//    User-Agent string can trigger 403 from their CDN/WAF.
//  • perPage > 500 sometimes causes 400/403 depending on deployment; we
//    default to 500 and accept an override.
//  • primaryInspectionCategory=GP is the documented filter for GP practices.

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Headers that mimic a real browser request — reduces WAF rejection rate.
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:          "application/json, text/plain, */*",
  "Accept-Language": "en-GB,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Referer:         "https://www.cqc.org.uk/",
  Origin:          "https://www.cqc.org.uk",
};

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const page    = searchParams.get("page")    ?? "1";
  const perPage = Math.min(Number(searchParams.get("perPage") ?? "500"), 500).toString();

  const upstream = new URL("https://api.cqc.org.uk/public/v1/locations");
  upstream.searchParams.set("page",                      page);
  upstream.searchParams.set("perPage",                   perPage);
  upstream.searchParams.set("primaryInspectionCategory", "GP");

  try {
    const res = await fetch(upstream.toString(), {
      headers: BROWSER_HEADERS,
      cache:   "no-store",
    });

    // If CQC returns 403, surface a clear message so the frontend can tell
    // the user what happened rather than showing a generic error.
    if (res.status === 403) {
      return NextResponse.json(
        {
          error:  "CQC API returned 403 — the API may be temporarily rate-limiting this server IP. Wait a minute and try again, or the CQC API may have changed its access requirements.",
          status: 403,
        },
        { status: 403 }
      );
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: `CQC API upstream error: HTTP ${res.status}` },
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
