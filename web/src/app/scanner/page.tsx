"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import {
  BadgeDollarSign,
  Camera,
  LoaderCircle,
  RotateCcw,
  Send,
} from "lucide-react";
import { reportDeal, scanBarcode, type ScanResult } from "@/lib/api";

// MVP: hardcoded to the seeded Home Depot store. Real flow: geolocate the
// user and let them confirm which store they're standing in.
const CURRENT_STORE_ID = "seed-hd-lone-tree";
const CURRENT_STORE_NAME = "Home Depot - Lone Tree";

// Same barcode rule the backend's Zod schema enforces: 8-14 digits. Filters
// out QR codes / URLs the camera might catch before they hit the network.
const BARCODE_RE = /^\d{8,14}$/;

// Ignore repeat reads of the same code within this window. ZXing decodes
// continuously (~every frame it can), so one physical scan fires the
// callback many times per second without this.
const DUPLICATE_COOLDOWN_MS = 3000;

type ScanState =
  | { phase: "idle" } // camera permission not yet granted/requested
  | { phase: "scanning" }
  | { phase: "loading"; barcode: string }
  | { phase: "result"; barcode: string; result: ScanResult }
  | { phase: "not-found"; barcode: string }
  | { phase: "error"; barcode: string | null; message: string };

/**
 * Web barcode scanner built on @zxing/browser.
 *
 * iOS Safari specifics baked in:
 *  - getUserMedia only exists on secure contexts (https / localhost)
 *  - the <video> needs playsInline + muted or iOS forces fullscreen playback
 *  - facingMode: "environment" selects the rear camera
 */
export default function ScannerPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  // ZXing hands back controls to stop the decode loop + camera stream;
  // kept in a ref so unmount cleanup can reach them.
  const controlsRef = useRef<IScannerControls | null>(null);
  // Debounce bookkeeping — refs, not state, because the decode callback
  // fires per-frame and must read the latest values synchronously.
  const lockedRef = useRef(false);
  const lastCodeRef = useRef<{ code: string; at: number } | null>(null);

  const [state, setState] = useState<ScanState>({ phase: "idle" });

  const handleDecoded = useCallback(async (raw: string) => {
    const now = Date.now();
    // Drop frames while a lookup is in flight or the result sheet is open.
    if (lockedRef.current) return;
    // Validate BEFORE debouncing so a stray QR read doesn't start a cooldown.
    if (!BARCODE_RE.test(raw)) return;
    // Duplicate-frame debounce.
    const last = lastCodeRef.current;
    if (last && last.code === raw && now - last.at < DUPLICATE_COOLDOWN_MS) {
      return;
    }
    lastCodeRef.current = { code: raw, at: now };
    lockedRef.current = true;

    setState({ phase: "loading", barcode: raw });
    try {
      const result = await scanBarcode(raw, CURRENT_STORE_ID);
      setState({ phase: "result", barcode: raw, result });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Scan failed";
      // Backend 404 => unknown product; offer manual report instead.
      if (message.toLowerCase().includes("not recognized")) {
        setState({ phase: "not-found", barcode: raw });
      } else {
        setState({ phase: "error", barcode: raw, message });
      }
    }
  }, []);

  /** Ask for the camera and start the continuous decode loop. */
  const startCamera = useCallback(async () => {
    const video = videoRef.current;
    if (!video || controlsRef.current) return;

    // Restrict ZXing to retail 1-D symbologies — skipping QR et al. cuts
    // per-frame work and false positives dramatically.
    const hints = new Map<DecodeHintType, unknown>([
      [
        DecodeHintType.POSSIBLE_FORMATS,
        [
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.CODE_128,
        ],
      ],
    ]);

    try {
      const reader = new BrowserMultiFormatReader(hints);
      // decodeFromConstraints owns the getUserMedia call — this is the line
      // that triggers the iOS permission prompt.
      controlsRef.current = await reader.decodeFromConstraints(
        { video: { facingMode: "environment" } },
        video,
        (result) => {
          if (result) void handleDecoded(result.getText());
          // Per-frame "not found" errors are normal noise — ignored.
        }
      );
      setState({ phase: "scanning" });
    } catch {
      setState({
        phase: "error",
        barcode: null,
        message:
          window.isSecureContext === false
            ? "Camera requires HTTPS. Open this app over https (npm run dev:https) or from localhost."
            : "Camera permission denied. Enable camera access for this site in Settings.",
      });
    }
  }, [handleDecoded]);

  // Stop the decode loop AND release the camera on unmount — leaving the
  // stream open keeps the iOS green camera-indicator on after leaving.
  useEffect(() => {
    return () => {
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, []);

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

  const sheetOpen = state.phase !== "idle" && state.phase !== "scanning";

  return (
    <div className="relative h-[calc(100dvh-4rem-env(safe-area-inset-bottom))] overflow-hidden bg-black">
      {/* Camera preview */}
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        playsInline // REQUIRED on iOS or the video hijacks into fullscreen
        muted
      />

      {/* Reticle overlay */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-5 pt-safe">
        <span className="rounded-full bg-slate-950/75 px-4 py-1.5 text-[13px] text-slate-200">
          {CURRENT_STORE_NAME}
        </span>

        {/* Centered green scanning frame: four corner brackets */}
        <div className="relative h-40 w-64">
          <span className="absolute left-0 top-0 h-7 w-7 rounded-tl-lg border-l-[3px] border-t-[3px] border-green-500" />
          <span className="absolute right-0 top-0 h-7 w-7 rounded-tr-lg border-r-[3px] border-t-[3px] border-green-500" />
          <span className="absolute bottom-0 left-0 h-7 w-7 rounded-bl-lg border-b-[3px] border-l-[3px] border-green-500" />
          <span className="absolute bottom-0 right-0 h-7 w-7 rounded-br-lg border-b-[3px] border-r-[3px] border-green-500" />
        </div>

        <span className="rounded-full bg-slate-950/75 px-4 py-1.5 text-[13px] text-slate-200">
          {state.phase === "scanning"
            ? "Line up the barcode inside the frame"
            : " "}
        </span>
      </div>

      {/* Idle: explicit start button — iOS only allows camera prompts from a
          user gesture, so auto-starting on mount can silently fail. */}
      {state.phase === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950/90 px-8 text-center">
          <Camera size={40} className="text-green-500" />
          <p className="text-[15px] text-slate-300">
            Penny Tracker needs camera access to scan barcodes.
          </p>
          <button
            type="button"
            onClick={startCamera}
            className="rounded-xl bg-green-500 px-5 py-3 text-[15px] font-bold text-green-950 active:scale-95"
          >
            Start scanning
          </button>
        </div>
      )}

      {/* Bottom sheet with the scan outcome */}
      {sheetOpen && (
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 rounded-t-3xl border-t border-slate-800 bg-slate-900 p-6 pb-8">
          {state.phase === "loading" && (
            <>
              <LoaderCircle size={24} className="animate-spin text-green-500" />
              <p className="text-lg font-bold">Checking {state.barcode}…</p>
            </>
          )}

          {state.phase === "result" && (
            <>
              {state.result.isPenny ? (
                <p className="flex items-center gap-2 text-xl font-black text-green-500">
                  <BadgeDollarSign size={28} />
                  PENNY ITEM — $0.01
                </p>
              ) : (
                <p className="text-lg font-bold">
                  {state.result.deal
                    ? `Marked down: $${Number(state.result.deal.price).toFixed(2)}`
                    : "No deal on record at this store"}
                </p>
              )}
              <p className="line-clamp-2 text-center text-sm text-slate-400">
                {state.result.product.title}
              </p>
              {!state.result.isPenny && (
                <button
                  type="button"
                  onClick={() => submitPennyReport(state.barcode)}
                  className="flex items-center gap-2 rounded-xl bg-green-500 px-4 py-3 text-[15px] font-bold text-green-950 active:scale-95"
                >
                  <Send size={16} />
                  It rang up $0.01 — report it
                </button>
              )}
            </>
          )}

          {state.phase === "not-found" && (
            <>
              <p className="text-lg font-bold">Unknown barcode</p>
              <p className="text-sm text-slate-400">
                {state.barcode} isn&apos;t in our catalog yet.
              </p>
              <button
                type="button"
                onClick={() => submitPennyReport(state.barcode)}
                className="flex items-center gap-2 rounded-xl bg-green-500 px-4 py-3 text-[15px] font-bold text-green-950 active:scale-95"
              >
                <Send size={16} />
                Report as penny deal
              </button>
            </>
          )}

          {state.phase === "error" && (
            <>
              <p className="text-lg font-bold">Something went wrong</p>
              <p className="text-center text-sm text-slate-400">
                {state.message}
              </p>
            </>
          )}

          <button
            type="button"
            onClick={state.phase === "error" && !state.barcode ? startCamera : reset}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-400 active:scale-95"
          >
            <RotateCcw size={16} />
            {state.phase === "error" && !state.barcode
              ? "Try camera again"
              : "Scan another item"}
          </button>
        </div>
      )}
    </div>
  );
}
