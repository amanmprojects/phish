# Phish

Hackathon prototype: students paste a suspicious email/SMS, get a **risk score**, **red flags**, and **one safe next action**. Deep investigation is powered by a **[Pi](https://github.com/earendil-works/pi-mono) agent** with **Tavily** web search (no shell access).

## Features

| Mode | What it does |
|------|----------------|
| **Quick Check** | Instant keyword/heuristic score (no network, no LLM) |
| **Deep Investigate** | Pi agent + optional Tavily `web_search` / `web_fetch` → structured report |

Outputs: label (Safe / Suspicious / High Risk), score, red flags with snippets, evidence, one safe next action.

## Setup

```bash
# from the project root
cp .env.example .env   # Windows: copy .env.example .env
# edit .env — set TAVILY_API_KEY=tvly-... (optional but recommended)

npm install

# Install Tavily extension for this project (or use global ~/.pi install)
pi install -l npm:@tavily/pi-extension
```

Model auth uses your existing Pi credentials (`~/.pi/agent/auth.json` / models). Default is often `supergrok` / `grok-4.5`. Override with `PI_PROVIDER` + `PI_MODEL` in `.env`.

## Run

```bash
# API + UI (starts API first, waits for health, then Vite)
npm run dev
```

You should see:

```text
[dev] API ready at http://127.0.0.1:8787/api/health
[web]   ➜  Local:   http://127.0.0.1:5173/
```

- UI: http://127.0.0.1:5173  
- API: http://127.0.0.1:8787  

If the UI shows proxy errors, free stuck ports then restart:

```powershell
# Windows PowerShell
Get-NetTCPConnection -LocalPort 8787,5173 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
npm run dev
```


LAN / public bind (cross-platform):

```bash
npm run dev:public
```

Production (build UI, serve from API):

```bash
npm run start:prod
```

CLI one-shot:

```bash
npm run cli -- server/fixtures/scholarship-scam.txt
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | API + Vite UI |
| `npm run dev:public` | Bind `0.0.0.0`, open CORS for LAN demos |
| `npm run build` | Build web UI to `web/dist` |
| `npm start` | API only (serves `web/dist` if present) |
| `npm run start:prod` | `build` then `start` |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit tests (parse, quick-check, highlight, schema) |
| `npm run cli -- <file>` | One-shot analyze |

## Project layout

```
server/
  index.ts              # Hono API + SSE (limits, rate limit, abort)
  parse-email.ts
  quick-check.ts
  known-domains.ts
  limits.ts
  fixtures/
  agent/
    run-phish-agent.ts  # Pi SDK wrapper (abort + JSON retry)
    system-prompt.ts
    parse-result.ts
web/                    # Vite + React UI
.pi/settings.json       # project package: @tavily/pi-extension
```

## Security notes

- Agent tools are **only** `web_search` and `web_fetch` (no bash/write).
- Emails are not persisted (in-memory Pi session).
- Cancel aborts the client fetch **and** disposes the server agent session.
- Body size cap, concurrent deep-run limit, and per-IP rate limit on `/api/analyze`.
- Use mock messages for demos; never collect OTPs/passwords/bank details.
- Session history is **browser-only** (`sessionStorage`); settings use `localStorage`.

## API

- `POST /api/quick` `{ "email": "..." }` → heuristic result  
- `POST /api/analyze` `{ "email": "...", "enableWeb"?: true, "includeQuick"?: true }` → SSE stream (`quick`, `status`, `tool_*`, `text`, `report`, `done`)  
- `GET /api/fixtures` · `GET /api/fixtures/:id`  
- `GET /api/health`
