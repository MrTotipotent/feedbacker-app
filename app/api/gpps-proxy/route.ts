// Proxy that fetches any public CSV URL server-side and returns the raw text.
// Used to fetch the GP Patient Survey (GPPS) practice-level results CSV,
// which does not expose CORS headers for browser requests.
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "url param required" }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/csv,text/plain,*/*",
        "Accept-Language": "en-GB,en;q=0.9",
        Referer: "https://www.gp-patient.co.uk/performance",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${res.status}` },
        { status: res.status }
      );
    }
    const text = await res.text();
    return new NextResponse(text, {
      headers: { "Content-Type": "text/csv; charset=utf-8" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "GPPS CSV fetch failed", detail: String(err) },
      { status: 502 }
    );
  }
}
