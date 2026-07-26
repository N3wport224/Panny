import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Location from "expo-location";
import { CircleAlert, PackageSearch } from "lucide-react-native";
import { DealCard } from "@/components/DealCard";
import { fetchNearbyDeals, type NearbyDeal } from "@/lib/api";

const RADIUS_MILES = 25;

/**
 * Live Feed — asks for location permission, then loads active penny deals
 * within RADIUS_MILES sorted by proximity (sorting happens server-side in
 * the PostGIS query; the client just renders).
 */
export default function FeedScreen() {
  const [deals, setDeals] = useState<NearbyDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("Location permission is required to find deals near you.");
        return;
      }
      // Balanced accuracy is plenty for a miles-scale radius search and is
      // much faster/cheaper than full GPS precision.
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const res = await fetchNearbyDeals(
        pos.coords.latitude,
        pos.coords.longitude,
        RADIUS_MILES
      );
      setDeals(res.deals);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load deals.");
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#22c55e" size="large" />
        <Text style={styles.dim}>Finding penny deals near you…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <CircleAlert color="#ef4444" size={36} />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={deals}
      keyExtractor={(deal) => deal.id}
      renderItem={({ item }) => <DealCard deal={item} />}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#22c55e"
        />
      }
      ListHeaderComponent={
        <Text style={styles.header}>
          {deals.length} penny deal{deals.length === 1 ? "" : "s"} within{" "}
          {RADIUS_MILES} miles
        </Text>
      }
      ListEmptyComponent={
        <View style={styles.center}>
          <PackageSearch color="#475569" size={40} />
          <Text style={styles.dim}>
            No penny deals reported nearby yet.{"\n"}Scan an item to be the
            first!
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: "#0b0f14" },
  listContent: { paddingVertical: 14, flexGrow: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 32,
    backgroundColor: "#0b0f14",
  },
  header: {
    color: "#94a3b8",
    fontSize: 13,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  dim: { color: "#64748b", fontSize: 14, textAlign: "center", lineHeight: 20 },
  errorText: { color: "#fca5a5", fontSize: 14, textAlign: "center" },
});
