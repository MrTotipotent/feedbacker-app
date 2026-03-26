// Proxy for the CQC Public API — avoids CORS issues in the browser.
// The client sends ?page=N&perPage=1000; this forwards to CQC and returns JSON.
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const page    = searchParams.get("page")    ?? "1";
  const perPage = searchParams.get("perPage") ?? "1000";

  const upstream = new URL("https://api.cqc.org.uk/public/v1/locations");
  upstream.searchParams.set("page",                      page);
  upstream.searchParams.set("perPage",                   perPage);
  upstream.searchParams.set("primaryInspectionCategory", "GP");

  try {
    const res = await fetch(upstream.toString(), {
      headers: { "User-Agent": "Feedbacker-ProspectRadar/1.0" },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `CQC upstream error ${res.status}` },
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
