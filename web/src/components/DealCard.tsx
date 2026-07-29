"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageOff, MapPin, ThumbsDown, ThumbsUp } from "lucide-react";
import { voteOnDeal, type NearbyDeal } from "@/lib/api";

// MVP stand-in for the authed user; replace with the real session user id
// once auth lands. The backend enforces one vote per (deal, user).
const DEMO_USER_ID = "demo-user";

const RETAILER_LABELS: Record<string, string> = {
  HOME_DEPOT: "Home Depot",
  LOWES: "Lowe's",
  WALMART: "Walmart",
  TARGET: "Target",
  DOLLAR_GENERAL: "Dollar General",
  OTHER: "Other",
};

interface Props {
  deal: NearbyDeal;
}

/**
 * One deal in the feed: image, title, price badge, retailer + distance,
 * and the thumbs up/down verification widget with optimistic updates.
 */
export function DealCard({ deal }: Props) {
  // Optimistic local tallies — updated on tap, reconciled with the server
  // response, rolled back on error.
  const [upvotes, setUpvotes] = useState(deal.upvotes);
  const [downvotes, setDownvotes] = useState(deal.downvotes);
  const [myVote, setMyVote] = useState<1 | -1 | null>(null);

  async function castVote(value: 1 | -1) {
    if (myVote === value) return; // no-op: same vote twice
    const prev = { upvotes, downvotes, myVote };

    setUpvotes((n) => n + (value === 1 ? 1 : 0) - (myVote === 1 ? 1 : 0));
    setDownvotes((n) => n + (value === -1 ? 1 : 0) - (myVote === -1 ? 1 : 0));
    setMyVote(value);

    try {
      const res = await voteOnDeal(deal.id, DEMO_USER_ID, value);
      if (res.deal) {
        setUpvotes(res.deal.upvotes);
        setDownvotes(res.deal.downvotes);
      }
    } catch {
      // Network/API failure — restore what the user saw before the tap.
      setUpvotes(prev.upvotes);
      setDownvotes(prev.downvotes);
      setMyVote(prev.myVote);
    }
  }

  const retailer = RETAILER_LABELS[deal.store.retailer] ?? deal.store.retailer;

  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex gap-3">
        {/* Product image with graceful placeholder */}
        {deal.product.imageUrl ? (
          <Image
            src={deal.product.imageUrl}
            alt={deal.product.title}
            width={64}
            height={64}
            unoptimized
            className="h-16 w-16 shrink-0 rounded-xl bg-slate-800 object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-slate-800">
            <ImageOff size={26} className="text-slate-600" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 text-[15px] font-semibold leading-snug">
            {deal.product.title}
          </h2>
          <p className="mt-0.5 flex items-center gap-1 text-[13px] text-slate-400">
            <MapPin size={13} className="shrink-0" />
            {retailer} · {deal.distanceMiles.toFixed(1)} mi
          </p>
          <p className="truncate text-xs text-slate-500">
            {deal.store.address}, {deal.store.city}
          </p>
        </div>

        {/* Price badge — the whole point of the app */}
        <span
          className={`h-fit shrink-0 rounded-full border px-2.5 py-1.5 text-sm font-extrabold ${
            deal.status === "PENNY"
              ? "border-green-500 bg-green-950 text-green-500"
              : "border-slate-600 bg-slate-800 text-green-500"
          }`}
        >
          ${deal.price.toFixed(2)}
        </span>
      </div>

      {/* Verification widget */}
      <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-2.5">
        <span className="text-[13px] text-slate-500">Still ringing up?</span>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => castVote(1)}
            className={`flex items-center gap-1.5 rounded-full border bg-slate-950 px-3 py-1.5 text-[13px] font-semibold text-slate-300 transition-colors active:scale-95 ${
              myVote === 1 ? "border-green-500" : "border-slate-800"
            }`}
          >
            <ThumbsUp
              size={16}
              className={myVote === 1 ? "text-green-500" : "text-slate-400"}
            />
            {upvotes}
          </button>
          <button
            type="button"
            onClick={() => castVote(-1)}
            className={`flex items-center gap-1.5 rounded-full border bg-slate-950 px-3 py-1.5 text-[13px] font-semibold text-slate-300 transition-colors active:scale-95 ${
              myVote === -1 ? "border-red-500" : "border-slate-800"
            }`}
          >
            <ThumbsDown
              size={16}
              className={myVote === -1 ? "text-red-500" : "text-slate-400"}
            />
            {downvotes}
          </button>
        </div>
      </div>
    </article>
  );
}
