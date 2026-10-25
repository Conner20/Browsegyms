import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const query = searchParams.get("q")?.trim();
  const rawLat = searchParams.get("lat");
  const rawLng = searchParams.get("lng");
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  const reverse = rawLat !== null && rawLng !== null && Number.isFinite(lat) && Number.isFinite(lng);
  if (!query && !reverse) return NextResponse.json({ message: "Location is required." }, { status: 400 });

  try {
    if (reverse) {
      const url = new URL("https://nominatim.openstreetmap.org/reverse");
      url.searchParams.set("lat", String(lat));
      url.searchParams.set("lon", String(lng));
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("addressdetails", "1");
      const response = await fetch(url, { headers: { "User-Agent": "Browsegyms/1.0 (https://browsegyms.com)" }, next: { revalidate: 300 } });
      const result = response.ok ? await response.json() : null;
      const address = result?.address as Record<string, string> | undefined;
      const city = address?.city ?? address?.town ?? address?.village ?? address?.municipality ?? address?.borough ?? address?.city_district ?? address?.county ?? "";
      if (!city) return NextResponse.json({ message: "City not found." }, { status: 404 });
      return NextResponse.json({ city, state: address?.state ?? address?.region ?? "", country: address?.country_code?.toUpperCase() ?? address?.country ?? "" });
    }
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query!);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "5");
    url.searchParams.set("countrycodes", "us");
    url.searchParams.set("addressdetails", "1");
    const response = await fetch(url, {
      headers: { "User-Agent": "Browsegyms/1.0 (https://browsegyms.com)" },
      next: { revalidate: 300 },
    });
    const results = response.ok ? await response.json() : [];
    const [result] = results;
    const resultLat = Number(result?.lat), resultLng = Number(result?.lon);
    if (!Number.isFinite(resultLat) || !Number.isFinite(resultLng)) return NextResponse.json({ message: "Location not found." }, { status: 404 });
    return NextResponse.json({
      lat: resultLat,
      lng: resultLng,
      label: result.display_name,
      results: results.map((item: { place_id: number; display_name: string; lat: string; lon: string; address?: Record<string, string> }) => ({
        id: String(item.place_id),
        label: item.display_name,
        lat: Number(item.lat),
        lng: Number(item.lon),
        city: item.address?.city ?? item.address?.town ?? item.address?.village ?? item.address?.municipality ?? item.address?.borough ?? item.address?.city_district ?? item.address?.county ?? "",
        state: item.address?.state ?? item.address?.region ?? "",
        country: item.address?.country_code?.toUpperCase() ?? item.address?.country ?? "",
      })),
    });
  } catch {
    return NextResponse.json({ message: "Location lookup failed." }, { status: 502 });
  }
}
