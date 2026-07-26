import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import { BadgeDollarSign, Camera, RotateCcw, Send } from "lucide-react-native";
import { reportDeal, scanBarcode, type ScanResult } from "@/lib/api";

// MVP: hardcoded to the seeded Home Depot store. Real flow: geolocate the
// user and let them confirm which store they're standing in.
const CURRENT_STORE_ID = "seed-hd-lone-tree";
const CURRENT_STORE_NAME = "Home Depot - Lone Tree";

type ScanState =
  | { phase: "scanning" }
  | { phase: "loading"; barcode: string }
  | { phase: "result"; barcode: string; result: ScanResult }
  | { phase: "not-found"; barcode: string }
  | { phase: "error"; barcode: string; message: string };

/**
 * Barcode Scanner — full-screen camera with a reticle overlay. On a scan
 * event we debounce (the camera fires the same code many times per second),
 * freeze scanning, and hit POST /api/deals/scan.
 */
export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<ScanState>({ phase: "scanning" });
  // Ref (not state) so the rapid-fire scan callback sees the latest value
  // synchronously and duplicate events are dropped without re-renders.
  const lockedRef = useRef(false);

  const handleScan = useCallback(
    async ({ data }: BarcodeScanningResult) => {
      if (lockedRef.current) return; // debounce duplicate fire
      // Client-side validation mirrors the backend's Zod rule: digits only,
      // 8-14 long. Skips QR codes / URLs the camera might pick up.
      if (!/^\d{8,14}$/.test(data)) return;
      lockedRef.current = true;

      setState({ phase: "loading", barcode: data });
      try {
        const result = await scanBarcode(data, CURRENT_STORE_ID);
        setState({ phase: "result", barcode: data, result });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Scan failed";
        // Backend 404 => unknown product; offer manual report instead.
        if (message.toLowerCase().includes("not recognized")) {
          setState({ phase: "not-found", barcode: data });
        } else {
          setState({ phase: "error", barcode: data, message });
        }
      }
    },
    []
  );

  const reset = useCallback(() => {
    lockedRef.current = false;
    setState({ phase: "scanning" });
  }, []);

  const submitPennyReport = useCallback(async (barcode: string) => {
    setState({ phase: "loading", barcode });
    try {
      await reportDeal({ barcode, storeId: CURRENT_STORE_ID, price: 0.01 });
      const result = await scanBarcode(barcode, CURRENT_STORE_ID);
      setState({ phase: "result", barcode, result });
    } catch (e) {
      setState({
        phase: "error",
        barcode,
        message: e instanceof Error ? e.message : "Report failed",
      });
    }
  }, []);

  // --- Permission gates ----------------------------------------------------
  if (!permission) {
    return <View style={styles.container} />;
  }
  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.center]}>
        <Camera color="#22c55e" size={40} />
        <Text style={styles.permissionText}>
          Panny needs camera access to scan barcodes.
        </Text>
        <Pressable style={styles.primaryBtn} onPress={requestPermission}>
          <Text style={styles.primaryBtnText}>Grant camera access</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        // Restrict to retail barcode symbologies — skipping QR et al. cuts
        // false positives and speeds up detection.
        barcodeScannerSettings={{
          barcodeTypes: ["upc_a", "upc_e", "ean13", "ean8", "code128"],
        }}
        onBarcodeScanned={state.phase === "scanning" ? handleScan : undefined}
      />

      {/* Reticle overlay: darkened frame with a clear scan window */}
      <View style={styles.overlay} pointerEvents="box-none">
        <Text style={styles.storeChip}>{CURRENT_STORE_NAME}</Text>
        <View style={styles.reticle}>
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
        </View>
        <Text style={styles.hint}>
          {state.phase === "scanning"
            ? "Line up the barcode inside the frame"
            : " "}
        </Text>
      </View>

      {/* Bottom sheet with scan outcome */}
      {state.phase !== "scanning" && (
        <View style={styles.sheet}>
          {state.phase === "loading" && (
            <>
              <ActivityIndicator color="#22c55e" />
              <Text style={styles.sheetTitle}>Checking {state.barcode}…</Text>
            </>
          )}

          {state.phase === "result" && (
            <>
              {state.result.isPenny ? (
                <View style={styles.pennyBanner}>
                  <BadgeDollarSign color="#22c55e" size={28} />
                  <Text style={styles.pennyText}>PENNY ITEM — $0.01</Text>
                </View>
              ) : (
                <Text style={styles.sheetTitle}>
                  {state.result.deal
                    ? `Marked down: $${Number(state.result.deal.price).toFixed(2)}`
                    : "No deal on record at this store"}
                </Text>
              )}
              <Text style={styles.sheetSub} numberOfLines={2}>
                {state.result.product.title}
              </Text>
              {!state.result.isPenny && (
                <Pressable
                  style={styles.primaryBtn}
                  onPress={() => submitPennyReport(state.barcode)}
                >
                  <Send color="#04120a" size={16} />
                  <Text style={styles.primaryBtnText}>
                    It rang up $0.01 — report it
                  </Text>
                </Pressable>
              )}
            </>
          )}

          {state.phase === "not-found" && (
            <>
              <Text style={styles.sheetTitle}>Unknown barcode</Text>
              <Text style={styles.sheetSub}>
                {state.barcode} isn't in our catalog yet.
              </Text>
              <Pressable
                style={styles.primaryBtn}
                onPress={() => submitPennyReport(state.barcode)}
              >
                <Send color="#04120a" size={16} />
                <Text style={styles.primaryBtnText}>Report as penny deal</Text>
              </Pressable>
            </>
          )}

          {state.phase === "error" && (
            <>
              <Text style={styles.sheetTitle}>Something went wrong</Text>
              <Text style={styles.sheetSub}>{state.message}</Text>
            </>
          )}

          <Pressable style={styles.secondaryBtn} onPress={reset}>
            <RotateCcw color="#94a3b8" size={16} />
            <Text style={styles.secondaryBtnText}>Scan another item</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const RETICLE_SIZE = 260;
const CORNER = 26;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0f14" },
  center: { alignItems: "center", justifyContent: "center", gap: 16, padding: 32 },
  permissionText: { color: "#cbd5e1", fontSize: 15, textAlign: "center" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
  },
  storeChip: {
    color: "#e2e8f0",
    backgroundColor: "rgba(11,15,20,0.75)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    fontSize: 13,
    overflow: "hidden",
  },
  reticle: { width: RETICLE_SIZE, height: RETICLE_SIZE * 0.6 },
  corner: {
    position: "absolute",
    width: CORNER,
    height: CORNER,
    borderColor: "#22c55e",
  },
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
  br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },
  hint: {
    color: "#e2e8f0",
    backgroundColor: "rgba(11,15,20,0.75)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    fontSize: 13,
    overflow: "hidden",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#111827",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 22,
    paddingBottom: 34,
    gap: 12,
    alignItems: "center",
    borderTopWidth: 1,
    borderColor: "#1e293b",
  },
  sheetTitle: { color: "#f1f5f9", fontSize: 17, fontWeight: "700" },
  sheetSub: { color: "#94a3b8", fontSize: 14, textAlign: "center" },
  pennyBanner: { flexDirection: "row", alignItems: "center", gap: 10 },
  pennyText: { color: "#22c55e", fontSize: 20, fontWeight: "900" },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#22c55e",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryBtnText: { color: "#04120a", fontWeight: "700", fontSize: 15 },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  secondaryBtnText: { color: "#94a3b8", fontWeight: "600", fontSize: 14 },
});
