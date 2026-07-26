/**
 * Mocked external UPC lookup service.
 *
 * In production this would call a real catalog API (UPCItemDB, Barcode
 * Lookup, or a retailer-specific endpoint like Home Depot's product API)
 * behind a cache. The interface is intentionally identical to what a real
 * implementation would expose, so swapping it out later touches no route
 * code.
 */

export interface ExternalProduct {
  upc: string;
  sku: string | null;
  title: string;
  imageUrl: string | null;
  description: string | null;
}

/** Deterministic pseudo-random pick so repeated scans of the same barcode
 *  return the same mock product (nicer demo behavior than pure random). */
function hashCode(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

const MOCK_CATALOG: Omit<ExternalProduct, "upc">[] = [
  {
    sku: "1004-512-887",
    title: "Husky 12-Piece SAE Wrench Set",
    imageUrl: "https://placehold.co/300x300?text=Wrench+Set",
    description: "Chrome vanadium steel wrench set with rack.",
  },
  {
    sku: "1002-119-334",
    title: "Ryobi ONE+ 18V Work Light (Tool Only)",
    imageUrl: "https://placehold.co/300x300?text=Work+Light",
    description: "Compact LED work light, battery not included.",
  },
  {
    sku: "1009-771-205",
    title: "Glacier Bay 8 in. Widespread Bathroom Faucet",
    imageUrl: "https://placehold.co/300x300?text=Faucet",
    description: "Brushed nickel two-handle bathroom faucet.",
  },
  {
    sku: "1001-450-662",
    title: "HDX 27 Gal. Storage Tote",
    imageUrl: "https://placehold.co/300x300?text=Storage+Tote",
    description: "Heavy-duty stackable storage tote with lid.",
  },
];

/**
 * Simulates a network lookup (~150ms latency). Returns `null` for barcodes
 * "not found upstream" so routes exercise the miss path too — any barcode
 * ending in "00" is treated as unknown.
 */
export async function lookupProductByBarcode(
  upc: string
): Promise<ExternalProduct | null> {
  await new Promise((resolve) => setTimeout(resolve, 150));

  if (upc.endsWith("00")) return null;

  const base = MOCK_CATALOG[hashCode(upc) % MOCK_CATALOG.length]!;
  return { upc, ...base };
}
