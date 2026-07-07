/**
 * Wrapper Google Maps (Geocoding + Places) — dégradation gracieuse : si
 * GOOGLE_MAPS_API_KEY est absente, chaque fonction retourne null au lieu
 * de lever une exception (même philosophie que Resend/Groq ailleurs dans
 * ce projet).
 */

const GEOCODE_BASE = "https://maps.googleapis.com/maps/api/geocode/json";
const PLACES_TEXTSEARCH_BASE = "https://maps.googleapis.com/maps/api/place/textsearch/json";

export interface ReverseGeocodeResult {
  address: string;
  lat: number;
  lng: number;
}

/** Coordonnées GPS -> adresse humaine lisible. */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn("[google-maps] GOOGLE_MAPS_API_KEY absente — reverse geocoding ignoré");
    return null;
  }

  try {
    const url = `${GEOCODE_BASE}?latlng=${lat},${lng}&language=fr&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as { status: string; results: { formatted_address: string }[] };
    if (data.status !== "OK" || !data.results?.length) return null;

    return { address: data.results[0].formatted_address, lat, lng };
  } catch (err) {
    console.error("[google-maps] reverseGeocode FAILED", err);
    return null;
  }
}

export interface PlaceSearchResult {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

/** Recherche un lieu par texte libre (nom de quartier, repère…), restreint autour de Cotonou. */
export async function searchPlace(query: string): Promise<PlaceSearchResult | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn("[google-maps] GOOGLE_MAPS_API_KEY absente — recherche de lieu ignorée");
    return null;
  }

  try {
    const biasedQuery = `${query}, Cotonou, Bénin`;
    const url = `${PLACES_TEXTSEARCH_BASE}?query=${encodeURIComponent(biasedQuery)}&language=fr&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as {
      status: string;
      results: { name: string; formatted_address: string; geometry: { location: { lat: number; lng: number } } }[];
    };
    if (data.status !== "OK" || !data.results?.length) return null;

    const top = data.results[0];
    return {
      name: top.name,
      address: top.formatted_address,
      lat: top.geometry.location.lat,
      lng: top.geometry.location.lng,
    };
  } catch (err) {
    console.error("[google-maps] searchPlace FAILED", err);
    return null;
  }
}
