import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ── Browser headers to avoid CQC WAF blocking ─────────────────────────────
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Referer: "https://www.cqc.org.uk/",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "same-origin",
};

/**
 * Extract a domain rating from a CQC location page HTML.
 *
 * Strategy:
 *  1. Find the domain as a heading/label (h1-h6, dt, strong)
 *  2. In the following 600 chars, look for rating keywords in order of
 *     specificity (most distinctive first to avoid false positives).
 *  3. Fallback: find domain text anywhere and scan forward.
 */
function extractRating(html: string, domain: string): string {
  const escaped = domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Try to find domain as a section heading first (most reliable)
  const headingRe = new RegExp(
    `<(?:h[1-6]|dt|th|strong|b)[^>]*>\\s*${escaped}\\s*</[^>]+>([\\s\\S]{0,700})`,
    "i"
  );
  const headingMatch = html.match(headingRe);

  // Fallback: find domain text inline and scan forward
  const fallbackIdx = html.toLowerCase().indexOf(domain.toLowerCase());
  const searchIn =
    headingMatch?.[1] ??
    (fallbackIdx >= 0 ? html.slice(fallbackIdx, fallbackIdx + 700) : "");

  if (!searchIn) return "Not yet rated";

  const lower = searchIn.toLowerCase();

  if (lower.includes("outstanding")) return "Outstanding";
  if (
    lower.includes("requires improvement") ||
    lower.includes("requires-improvement") ||
    lower.includes("requiresimprovement")
  )
    return "Requires Improvement";
  if (lower.includes("inadequate")) return "Inadequate";

  // "good" is a common word — only match when it's a rating badge/class
  if (/class="[^"]*\bgood\b[^"]*"|\bgood\b/i.test(searchIn)) return "Good";

  return "Not yet rated";
}

// ── Route handler ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");

  if (!url || !url.startsWith("https://www.cqc.org.uk/location/")) {
    return NextResponse.json(
      { error: "Invalid URL", overall: "Not yet rated", responsive: "Not yet rated" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
    });

    if (!res.ok) {
      return NextResponse.json({
        error: `CQC HTTP ${res.status}`,
        overall: "Not yet rated",
        responsive: "Not yet rated",
      });
    }

    const html = await res.text();

    return NextResponse.json({
      overall:    extractRating(html, "Overall"),
      responsive: extractRating(html, "Responsive"),
    });
  } catch (err) {
    return NextResponse.json({
      error:      String(err),
      overall:    "Not yet rated",
      responsive: "Not yet rated",
    });
  }
}
