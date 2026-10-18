/* global process */
import "dotenv/config";
import express from "express";
import cors from "cors";
import { postgresRouter } from "./routes/postgres.js";
import { closeAllPools } from "./db.js";

const PORT = Number.parseInt(process.env.POSTGRES_API_PORT ?? "5001", 10);
const HOST = process.env.POSTGRES_API_HOST ?? "127.0.0.1";
const TOKEN = process.env.POSTGRES_API_TOKEN ?? "";
const CORS_ORIGIN = process.env.POSTGRES_API_CORS_ORIGIN ?? "*";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "10mb" }));

const origin =
  CORS_ORIGIN === "*"
    ? true
    : CORS_ORIGIN.split(",")
        .map((s) => s.trim())
        .filter(Boolean);
app.use(cors({ origin }));

if (TOKEN) {
  app.use((req, res, next) => {
    if (req.path === "/health") return next();
    const provided = req.header("x-drawdb-token");
    if (provided !== TOKEN) {
      return res.status(401).json({
        ok: false,
        error: { message: "Unauthorized: invalid or missing token" },
      });
    }
    next();
  });
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "drawdb-postgres-api" });
});

app.use("/api/postgres", postgresRouter);

app.use((err, _req, res) => {
  res.status(500).json({
    ok: false,
    error: { message: err?.message ?? "Internal server error" },
  });
});

const server = app.listen(PORT, HOST, () => {
  console.log(
    `drawDB PostgreSQL API listening on http://${HOST}:${PORT} (CORS: ${CORS_ORIGIN})`,
  );
});

async function shutdown() {
  server.close();
  await closeAllPools();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
