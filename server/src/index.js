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

server.on("error", async (err) => {
  if (err?.code === "EADDRINUSE") {
    let ours = false;
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/health`);
      const body = await res.json().catch(() => ({}));
      ours = res.ok && body?.service === "drawdb-postgres-api";
    } catch {
      ours = false;
    }
    console.log("");
    if (ours) {
      console.log(
        `An instance of the drawdb-plus-sql API is already running on port ${PORT} — the web app will keep using it.`,
      );
      console.log(
        "Stop it first with:  npm run server:stop   (or check: npm run server:status)",
      );
      console.log("");
      process.exit(0);
    }
    console.log(
      `Port ${PORT} is already in use by another program. Free it or set POSTGRES_API_PORT in server/.env, then retry.`,
    );
    console.log("");
    process.exit(1);
  }
  throw err;
});

async function shutdown() {
  server.close();
  await closeAllPools();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
