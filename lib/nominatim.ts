/**
 * Nominatim (OpenStreetMap) — geocoding gratuit, aucune clé API requise.
 * Un User-Agent identifiable est obligatoire (règle d'usage de Nominatim).
 */

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const USER_AGENT = "CHIVI-App/1.0";

export interface ReverseGeocodeResult {
  address: string;
  lat: number;
  lng: number;
}

/** Coordonnées GPS -> adresse humaine lisible. */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
  try {
    const url = `${NOMINATIM_BASE}/reverse?lat=${lat}&lon=${lng}&format=json`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;

    const data = (await res.json()) as { display_name?: string; error?: string };
    if (!data.display_name) return null;

    return { address: data.display_name, lat, lng };
  } catch (err) {
    console.error("[nominatim] reverseGeocode FAILED", err);
    return null;
  }
}

export interface PlaceSearchResult {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

/** Recherche un lieu par texte libre (quartier, repère…), restreint au Bénin. */
export async function searchPlace(query: string): Promise<PlaceSearchResult | null> {
  try {
    const url = `${NOMINATIM_BASE}/search?q=${encodeURIComponent(query)}&countrycodes=bj&format=json&limit=3&addressdetails=1`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;

    const data = (await res.json()) as { display_name: string; lat: string; lon: string }[];
    if (!data.length) return null;

    const top = data[0];
    return { name: top.display_name, address: top.display_name, lat: parseFloat(top.lat), lng: parseFloat(top.lon) };
  } catch (err) {
    console.error("[nominatim] searchPlace FAILED", err);
    return null;
  }
}
