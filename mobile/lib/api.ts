/**
 * Typed API client for the Panny backend.
 *
 * EXPO_PUBLIC_API_URL must point at a host reachable from the device — on a
 * physical phone that's your machine's LAN IP, not localhost.
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

// --- Response shapes (mirror the backend serializers) ----------------------

export type DealStatus = "PENNY" | "ACTIVE" | "EXPIRED";

export interface Product {
  id: string;
  upc: string;
  title: string;
  imageUrl: string | null;
  description?: string | null;
}

export interface NearbyDeal {
  id: string;
  price: number;
  status: DealStatus;
  upvotes: number;
  downvotes: number;
  lastVerifiedAt: string | null;
  distanceMiles: number;
  product: Product;
  store: {
    id: string;
    name: string;
    retailer: string;
    address: string;
    city: string;
    state: string;
  };
}

export interface ScanResult {
  product: Product;
  productSource: "database" | "external";
  deal: {
    id: string;
    price: string;
    status: DealStatus;
    upvotes: number;
    downvotes: number;
  } | null;
  isPenny: boolean;
}

// --- Fetch helpers ---------------------------------------------------------

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    // Surface the backend's structured error message when available.
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? body?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function scanBarcode(barcode: string, storeId: string) {
  return request<ScanResult>("/api/deals/scan", {
    method: "POST",
    body: JSON.stringify({ barcode, storeId }),
  });
}

export function reportDeal(params: {
  barcode: string;
  storeId: string;
  price?: number;
  userId?: string;
}) {
  return request<{ deal: unknown }>("/api/deals/report", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function fetchNearbyDeals(
  latitude: number,
  longitude: number,
  radiusMiles = 25
) {
  const qs = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    radius: String(radiusMiles),
  });
  return request<{ deals: NearbyDeal[]; count: number }>(
    `/api/deals/nearby?${qs.toString()}`
  );
}

export function voteOnDeal(dealId: string, userId: string, value: 1 | -1) {
  return request<{
    changed: boolean;
    deal?: { id: string; upvotes: number; downvotes: number; status: DealStatus };
  }>(`/api/deals/${dealId}/vote`, {
    method: "POST",
    body: JSON.stringify({ userId, value }),
  });
}
