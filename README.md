<div align="center">
    <img width="64" alt="drawDB logo (upstream, reused under AGPL-3.0)" src="./src/assets/icon-dark.png">
    <h1>drawdb-plus-sql</h1>
</div>

<h3 align="center">A connected fork of <a href="https://github.com/drawdb-io/drawdb">drawDB</a> — design your schema on canvas <em>and</em> work directly against your real PostgreSQL database.</h3>

<div align="center" style="margin-bottom:12px;">
    <a href="./LICENSE" style="display: flex; align-items: center;">
        <img src="https://img.shields.io/badge/License-AGPL--3.0--only-blue" alt="AGPL-3.0 license"/>
    </a>
    <a href="https://github.com/drawdb-io/drawdb" style="display: flex; align-items: center;">
        <img src="https://img.shields.io/badge/Upstream-drawDB%20by%20drawdb--io%20(1ilit)-0081?logo=github" alt="Upstream drawDB"/>
    </a>
</div>

<h3 align="center"><img width="700" style="border-radius:5px;" alt="drawDB screenshot demo" src="drawdb.png"></h3>

This project is a fork of [drawdb-io/drawdb](https://github.com/drawdb-io/drawdb), forked from upstream `main` at commit `7683bdf` (October 2026). All credit for the ERD editor and most of this codebase belongs to upstream's author ([1ilit](https://github.com/1ilit)) and the drawDB community. This repository is a **modified version** of drawDB (required notice under AGPL-3.0 §4); every modification is listed below and in the commit history.

All of the original capabilities are here: intuitive diagram editor, SQL export for PostgreSQL / MySQL / MariaDB / SQL Server / Oracle / SQLite, DBML import/export, sharing, reverse-engineering from scripts, and more. On top of that, this fork adds something upstream intentionally does **not** have: a **live connection to a real PostgreSQL database**, turning drawDB from "design a diagram, get a static script" into "design on canvas, connect to your database, inspect, migrate, explore data, and run code — from one place."

## How this fork differs

### What is new (not in upstream)

- **Connect to live PostgreSQL** — enter host/port/database/user (or trust auth), optional SSL, from the editor header. A small local API server proxies everything; the browser never talks to the database directly.
- **SQL console** — run arbitrary SQL against the connected database: multi-statement scripts, transactions, server notices, per-statement timings and full result grids, run the whole script or only a selection, `Ctrl/Cmd+Enter` shortcut.
- **One-click SQL templates + form builder** — 37 ready-made PostgreSQL templates (DDL, querying, data, permissions, transactions, JSONB, PL/pgSQL logic). Click a chip to append ready SQL to the editor without wiping your script, or open a form builder with live SQL preview, repeating rows (tables/columns/conditions), and **table & column autocompletion driven by the connected database's catalog**.
- **Import a live schema into a diagram** — introspect an existing database and turn its tables, columns, primary keys and relations into a drawDB diagram.
- **Apply migrations to the database** — compare the diagram against the live schema, get a generated diff (CREATE / ALTER / DROP …), review the diff statement-by-statement, and apply it with one click. Sequence changes are generated with proper ownership transfer; constraints and unique indexes are handled safely.
- **Data browser** — list the connected tables (across schemas), page through rows, and insert/update/delete rows inline with parameterized queries.

## Architecture

```text
Browser (Vite dev server / static build, :3148)
   │  HTTP only, to its own trusted API
   ▼
postgres-api (Express + pg in ./server, :5001)
   │  libpq-style TCP, connection pooling
   ▼
Your PostgreSQL server
```

- The frontend holds connection details (host, port, database, user, SSL flag) and sends them with each request to the companion API server.
- The API server always talks to **the PostgreSQL server on your own network** — typically a local or development database. Nothing is stored: connection pools are cached in memory and closed after an idle timeout.
- Optional shared secret (`POSTGRES_API_TOKEN`) requires the frontend to present `x-drawdb-token` on every request.
- Every query served through this API runs with the credentials you supply, so point it at databases you are responsible for — local and internal development, never internet-facing ones.

## Getting Started

Prerequisites: Node.js 20+ and a PostgreSQL server you can reach.

### Local Development

```bash
git clone https://github.com/<you>/drawdb-plus-sql.git
cd drawdb-plus-sql
npm install

# optional: configure the companion API
cp .env.sample .env
cp server/.env.sample server/.env

npm run dev          # starts web app (:3148) and the postgres API (:5001) together
```

Then open `http://localhost:3148`, click **Connect** → **Connect to PostgreSQL** and enter your connection details.

### Run modes: private vs public

Two launcher scripts manage everything (web app, companion API, and the security posture) in one command:

```bash
npm run start:private   # everything on localhost — only this machine can use it
npm run start:public    # web app + API reachable from the local network, token protected
npm run server:stop     # stop everything
npm run server:status   # what is running, and where PostgreSQL is listening
```

- **private**: the web app and the API bind to `127.0.0.1` only. Use this on your own laptop or workstation.
- **public**: the web app and the API bind to `0.0.0.0`, and CORS is fully open, so any device on your network can open the web app. The script generates a random `POSTGRES_API_TOKEN` (or reuses the one in `server/.env`) and pairs it into `public/config.js`, which browsers read at page load — no manual setup. **PostgreSQL itself must stay loopback-only** (the default `listen_addresses = 'localhost'`); the script checks this and warns loudly if port 5432 is ever exposed. `server/.env` and `public/config.js` are runtime files and are git-ignored — never commit them.

PostgreSQL is never exposed by this project: every query goes browser → companion API → your database.

### Build

```bash
npm install
npm run build
```

### Docker Build

```bash
docker build -t drawdb-plus-sql .
docker run -p 3000:80 drawdb-plus-sql
```

### Environment variables

**Frontend** (`.env`, see `.env.sample`)

| Variable                  | Default                 | Description                                                                                                                   |
| ------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `VITE_BACKEND_URL`        | —                       | Optional upstream-style server for file sharing / feedback (see [drawdb-server](https://github.com/drawdb-io/drawdb-server)). |
| `VITE_POSTGRES_API_URL`   | `http://localhost:5001` | URL of the companion PostgreSQL API server.                                                                                   |
| `VITE_POSTGRES_API_TOKEN` | empty                   | Shared secret, required only if the server sets `POSTGRES_API_TOKEN`.                                                         |

**Companion API** (`server/.env`, see `server/.env.sample`)

| Variable                         | Default     | Description                                                   |
| -------------------------------- | ----------- | ------------------------------------------------------------- |
| `POSTGRES_API_PORT`              | `5001`      | Port the API listens on.                                      |
| `POSTGRES_API_HOST`              | `127.0.0.1` | Bind address. Keep loopback for local-only access.            |
| `POSTGRES_API_CORS_ORIGIN`       | `*`         | Comma-separated allowed CORS origins.                         |
| `POSTGRES_API_TOKEN`             | empty       | Optional shared secret checked in `x-drawdb-token`.           |
| `POSTGRES_API_STATEMENT_TIMEOUT` | `30000`     | Default statement timeout per query (ms, 0 = disabled).       |
| `POSTGRES_API_MAX_ROWS`          | `5000`      | Maximum rows returned per result set.                         |
| `POSTGRES_API_POOL_IDLE`         | `60000`     | Idle timeout before a cached connection pool is dropped (ms). |

## Linting & CI

```bash
npm run lint
npm run build
```

The Build workflow runs both on push/PR for Node 20/22; the Docker workflow publishes `ghcr.io/<repo>` images on tags.

## License & attribution

**License: GNU Affero General Public License v3.0 only (`AGPL-3.0-only`)** — see [LICENSE](./LICENSE).

- drawdb-plus-sql is a **derivative work of drawDB** and is therefore distributed under the same license as upstream, with no relicensing, no additional restrictions, and the upstream license text kept verbatim.
- The SPDX identifier is **`AGPL-3.0-only`** because the work carries the bare AGPL-3.0 text and no per-file "or (at your option) any later version" notice; per GNU and REUSE licensing convention the absence of that notice means the code is licensed **only** under version 3. (The fork cannot grant itself the "later versions" option — only the upstream copyright holder could.)
- No source file carries a proprietary or conflicting license; `AGPL-3.0-only` is declared in both `package.json` files so tooling and GitHub must agree.
- **Network-upload clause:** if you host a modified version to serve over a network (as drawDB's AGPL §13 requires), you must offer its full source code to the users of that instance.

### Attribution

None of this would exist without [1ilit](https://github.com/1ilit) and the [drawdb-io](https://github.com/drawdb-io) contributors, who spent years turning drawDB into the tool tens of thousands of developers open every day. drawdb-plus-sql simply picks that work up and adds a PostgreSQL connection to it — the hard part wasn't ours.

If this project is useful to you, the kindest thing you can do is say thanks to the original author: the upstream [FUNDING.yml](./.github/FUNDING.yml) is deliberately still in this repo, so GitHub's "Sponsor this project" button funds 1ilit directly rather than us. And when you deploy drawdb-plus-sql, its footer keeps the credit visible too — "drawdb-plus-sql, an AGPL-3.0 fork of drawDB".

## Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to this project.
