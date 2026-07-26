import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { ImageOff, MapPin, ThumbsDown, ThumbsUp } from "lucide-react-native";
import type { NearbyDeal } from "@/lib/api";
import { voteOnDeal } from "@/lib/api";

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
 * One deal in the live feed: image, title, price badge, retailer + distance,
 * and the thumbs up/down verification widget.
 */
export function DealCard({ deal }: Props) {
  // Optimistic local tallies — updated immediately on tap, reconciled with
  // the server response, rolled back on error.
  const [upvotes, setUpvotes] = useState(deal.upvotes);
  const [downvotes, setDownvotes] = useState(deal.downvotes);
  const [myVote, setMyVote] = useState<1 | -1 | null>(null);

  async function castVote(value: 1 | -1) {
    if (myVote === value) return; // no-op: same vote twice
    const prev = { upvotes, downvotes, myVote };

    // Optimistic update: apply the new vote and undo any previous one.
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
    <View style={styles.card}>
      <View style={styles.row}>
        {/* Product image with graceful placeholder */}
        {deal.product.imageUrl ? (
          <Image
            source={{ uri: deal.product.imageUrl }}
            style={styles.image}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.image, styles.imageFallback]}>
            <ImageOff color="#475569" size={28} />
          </View>
        )}

        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={2}>
            {deal.product.title}
          </Text>

          <View style={styles.metaRow}>
            <MapPin color="#94a3b8" size={14} />
            <Text style={styles.meta}>
              {retailer} · {deal.distanceMiles.toFixed(1)} mi
            </Text>
          </View>

          <Text style={styles.address} numberOfLines={1}>
            {deal.store.address}, {deal.store.city}
          </Text>
        </View>

        {/* Price badge — the whole point of the app */}
        <View
          style={[
            styles.priceBadge,
            deal.status === "PENNY" ? styles.penny : styles.markdown,
          ]}
        >
          <Text style={styles.priceText}>${deal.price.toFixed(2)}</Text>
        </View>
      </View>

      {/* Verification widget */}
      <View style={styles.voteRow}>
        <Text style={styles.voteLabel}>Still ringing up?</Text>
        <View style={styles.voteButtons}>
          <Pressable
            onPress={() => castVote(1)}
            style={[styles.voteBtn, myVote === 1 && styles.voteBtnUpActive]}
            hitSlop={8}
          >
            <ThumbsUp color={myVote === 1 ? "#22c55e" : "#94a3b8"} size={18} />
            <Text style={styles.voteCount}>{upvotes}</Text>
          </Pressable>
          <Pressable
            onPress={() => castVote(-1)}
            style={[styles.voteBtn, myVote === -1 && styles.voteBtnDownActive]}
            hitSlop={8}
          >
            <ThumbsDown
              color={myVote === -1 ? "#ef4444" : "#94a3b8"}
              size={18}
            />
            <Text style={styles.voteCount}>{downvotes}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#111827",
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  row: { flexDirection: "row", gap: 12 },
  image: { width: 64, height: 64, borderRadius: 10, backgroundColor: "#1e293b" },
  imageFallback: { alignItems: "center", justifyContent: "center" },
  info: { flex: 1, gap: 3 },
  title: { color: "#f1f5f9", fontSize: 15, fontWeight: "600" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { color: "#94a3b8", fontSize: 13 },
  address: { color: "#64748b", fontSize: 12 },
  priceBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  penny: { backgroundColor: "#052e16", borderWidth: 1, borderColor: "#22c55e" },
  markdown: {
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#475569",
  },
  priceText: { color: "#22c55e", fontWeight: "800", fontSize: 14 },
  voteRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#1e293b",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  voteLabel: { color: "#64748b", fontSize: 13 },
  voteButtons: { flexDirection: "row", gap: 10 },
  voteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#0b0f14",
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  voteBtnUpActive: { borderColor: "#22c55e" },
  voteBtnDownActive: { borderColor: "#ef4444" },
  voteCount: { color: "#cbd5e1", fontSize: 13, fontWeight: "600" },
});
