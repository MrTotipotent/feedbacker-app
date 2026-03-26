// Server-side proxy for the Google Places "Find Place from Text" API.
// Routes requests through the server so the API key is never embedded in
// browser-visible network requests and CORS restrictions are bypassed.
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface PlaceCandidate {
  name?: string;
  rating?: number;
  user_ratings_total?: number;
}

interface PlacesApiResponse {
  status?: string;
  candidates?: PlaceCandidate[];
  error_message?: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const query  = searchParams.get("q");
  const apiKey = searchParams.get("key");

  if (!query || !apiKey) {
    return NextResponse.json({ error: "q and key are required" }, { status: 400 });
  }

  const upstream = new URL(
    "https://maps.googleapis.com/maps/api/place/findplacefromtext/json"
  );
  upstream.searchParams.set("input",     query);
  upstream.searchParams.set("inputtype", "textquery");
  upstream.searchParams.set("fields",    "name,rating,user_ratings_total");
  upstream.searchParams.set("key",       apiKey);

  try {
    const res  = await fetch(upstream.toString(), { cache: "no-store" });
    const data = (await res.json()) as PlacesApiResponse;

    if (data.status === "OK" && data.candidates?.[0]) {
      const c = data.candidates[0];
      return NextResponse.json({
        found:  true,
        rating: c.rating                ?? null,
        count:  c.user_ratings_total    ?? 0,
        name:   c.name                  ?? "",
      });
    }

    return NextResponse.json({ found: false, rating: null, count: 0 });
  } catch (err) {
    return NextResponse.json(
      { error: "Google Places API failed", detail: String(err) },
      { status: 502 }
    );
  }
}
