import express from "express";
import cors from "cors";
import helmet from "helmet";
import { dealRouter } from "./routes/dealRouter";

const app = express();

app.use(helmet());
app.use(cors()); // MVP: open CORS; lock to app origins before production
app.use(express.json({ limit: "100kb" })); // small bodies only — reports are tiny

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/deals", dealRouter);

// Central error handler — anything thrown in asyncHandler routes lands here.
app.use(
  (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "InternalServerError" });
  }
);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`Panny API listening on http://localhost:${port}`);
});
