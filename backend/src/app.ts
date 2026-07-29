import express from "express";
import cors from "cors";
import helmet from "helmet";
import { dealRouter } from "./routes/dealRouter";

/**
 * CORS allowlist for browser clients (the Next.js PWA). Native mobile apps
 * don't send an Origin header, so they're unaffected either way.
 *
 * Allowed out of the box:
 *   - http(s)://localhost:3000 / 127.0.0.1:3000  (next dev on this machine)
 *   - private LAN IPs on port 3000               (phone hitting your laptop:
 *     10.x.x.x, 192.168.x.x, 172.16-31.x.x)
 * Production origins are added via CORS_ORIGINS, comma-separated:
 *   CORS_ORIGINS=https://penny.example.com,https://staging.penny.example.com
 *
 * Note: when the web app uses the default Next rewrite proxy (/api/* →
 * this server), requests arrive same-origin from the Next server and CORS
 * never comes into play. This allowlist covers direct cross-origin calls
 * (NEXT_PUBLIC_API_URL set) and keeps arbitrary websites from scripting
 * the API with users' browsers.
 */
const STATIC_ORIGINS = new Set(
  [
    "http://localhost:3000",
    "https://localhost:3000",
    "http://127.0.0.1:3000",
    "https://127.0.0.1:3000",
    ...(process.env.CORS_ORIGINS?.split(",").map((o) => o.trim()) ?? []),
  ].filter(Boolean)
);

const PRIVATE_LAN_ORIGIN =
  /^https?:\/\/(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):3000$/;

function isAllowedOrigin(origin: string): boolean {
  return STATIC_ORIGINS.has(origin) || PRIVATE_LAN_ORIGIN.test(origin);
}

/**
 * App factory, separate from the listener in index.ts so integration tests
 * can mount the exact production middleware stack via supertest without
 * binding a port.
 */
export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      // `origin: callback` runs per-request. Requests WITHOUT an Origin
      // header (native apps, curl, server-to-server, the Next proxy) pass
      // through untouched; browser requests get CORS headers only when the
      // origin is on the allowlist — disallowed origins get no
      // Access-Control-Allow-Origin, so the browser blocks the response.
      origin(origin, callback) {
        if (!origin || isAllowedOrigin(origin)) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      },
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"],
      maxAge: 86_400, // cache preflight for a day — fewer OPTIONS round-trips
    })
  );
  app.use(express.json({ limit: "100kb" })); // small bodies only — reports are tiny

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/deals", dealRouter);

  // Central error handler — anything thrown in asyncHandler routes lands here.
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error(err);
      res.status(500).json({ error: "InternalServerError" });
    }
  );

  return app;
}
