"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleAlert, LoaderCircle, PackageSearch, RefreshCw } from "lucide-react";
import { DealCard } from "@/components/DealCard";
import { fetchNearbyDeals, type NearbyDeal } from "@/lib/api";

const RADIUS_MILES = 25;

// Fallback when geolocation is denied/unavailable so the feed still works
// (matches the seeded demo area). A banner tells the user it's approximate.
const FALLBACK = { latitude: 39.5486, longitude: -104.872, label: "Lone Tree, CO" };

type Position = { latitude: number; longitude: number; approximate: boolean };

/**
 * Wraps callback-style navigator.geolocation in a promise. Resolves the
 * fallback (never rejects) so the feed always renders something.
 * NOTE: iOS Safari only exposes geolocation on secure contexts (https or
 * localhost) — over plain http on a LAN IP this rejects immediately.
 */
function getPosition(): Promise<Position> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ ...FALLBACK, approximate: true });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
          approximate: false,
        }),
      () => resolve({ ...FALLBACK, approximate: true }),
      // Cached-position tolerance + timeout keep the feed snappy; miles-level
      // search doesn't need a fresh high-accuracy GPS fix.
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
    );
  });
}

export default function FeedPage() {
  const [deals, setDeals] = useState<NearbyDeal[] | null>(null);
  const [approximate, setApproximate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const pos = await getPosition();
      setApproximate(pos.approximate);
      const res = await fetchNearbyDeals(
        pos.latitude,
        pos.longitude,
        RADIUS_MILES
      );
      setDeals(res.deals);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load deals.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <div className="pt-safe">
      <header className="flex items-center justify-between px-4 pb-2 pt-4">
        <h1 className="text-xl font-bold">Penny Feed</h1>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          aria-label="Refresh deals"
          className="rounded-full border border-slate-800 bg-slate-900 p-2 text-slate-400 active:scale-95"
        >
          <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
        </button>
      </header>

      {approximate && (
        <p className="mx-4 mb-2 rounded-lg border border-amber-900 bg-amber-950/60 px-3 py-2 text-xs text-amber-400">
          Location unavailable — showing deals near {FALLBACK.label}. Allow
          location access (requires https) for results near you.
        </p>
      )}

      {/* Loading */}
      {deals === null && !error && (
        <div className="flex flex-col items-center gap-3 px-8 py-24 text-slate-500">
          <LoaderCircle size={32} className="animate-spin text-green-500" />
          <p className="text-sm">Finding penny deals near you…</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex flex-col items-center gap-3 px-8 py-24 text-center">
          <CircleAlert size={36} className="text-red-500" />
          <p className="text-sm text-red-300">{error}</p>
          <button
            type="button"
            onClick={refresh}
            className="rounded-full bg-green-500 px-5 py-2 text-sm font-bold text-green-950 active:scale-95"
          >
            Try again
          </button>
        </div>
      )}

      {/* Feed */}
      {deals !== null && !error && (
        <>
          <p className="px-4 pb-3 text-[13px] text-slate-400">
            {deals.length} penny deal{deals.length === 1 ? "" : "s"} within{" "}
            {RADIUS_MILES} miles
          </p>
          <div className="flex flex-col gap-3 px-4">
            {deals.map((deal) => (
              <DealCard key={deal.id} deal={deal} />
            ))}
            {deals.length === 0 && (
              <div className="flex flex-col items-center gap-3 px-8 py-20 text-center text-slate-500">
                <PackageSearch size={40} className="text-slate-700" />
                <p className="text-sm leading-relaxed">
                  No penny deals reported nearby yet.
                  <br />
                  Scan an item to be the first!
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
