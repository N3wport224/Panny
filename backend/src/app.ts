import express from "express";
import cors from "cors";
import helmet from "helmet";
import { dealRouter } from "./routes/dealRouter";

/**
 * App factory, separate from the listener in index.ts so integration tests
 * can mount the exact production middleware stack via supertest without
 * binding a port.
 */
export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors()); // MVP: open CORS; lock to app origins before production
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
