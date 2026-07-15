# CampusGuard — AI-Generated Phishing Detector

Hackathon prototype: students paste a suspicious email/SMS, get a **risk score**, **red flags**, and **one safe next action**. Deep investigation is powered by a **[Pi](https://github.com/earendil-works/pi-mono) agent** with **Tavily** web search (no shell access).

## Features

| Mode | What it does |
|------|----------------|
| **Quick Check** | Instant keyword/heuristic score (no network, no LLM) |
| **Deep Investigate** | Pi agent + optional Tavily `web_search` / `web_fetch` → structured report |

Outputs match the problem brief: label (Safe / Suspicious / High Risk), score, red flags with snippets, evidence, one safe next action.

## Setup

```bash
cd /home/aman/code/phish
cp .env.example .env
# edit .env — set TAVILY_API_KEY=tvly-...

npm install

# Install Tavily extension for this project (or use global ~/.pi install)
pi install -l npm:@tavily/pi-extension
```

Model auth uses your existing Pi credentials (`~/.pi/agent/auth.json` / models). Default on this machine is often `supergrok` / `grok-4.5`.

## Run

```bash
# API + UI (Vite proxies /api → :8787)
npm run dev
```

- UI: http://127.0.0.1:5173  
- API: http://127.0.0.1:8787  

CLI one-shot:

```bash
npm run cli -- server/fixtures/scholarship-scam.txt
```

## Project layout

```
server/
  index.ts              # Hono API + SSE
  parse-email.ts
  quick-check.ts
  fixtures/
  agent/
    run-phish-agent.ts  # Pi SDK wrapper
    system-prompt.ts
    parse-result.ts
web/                    # Vite + React UI
.pi/settings.json       # project package: @tavily/pi-extension
```

## Security notes

- Agent tools are **only** `web_search` and `web_fetch` (no bash/write).
- Emails are not persisted (in-memory Pi session).
- Use mock messages for demos; never collect OTPs/passwords/bank details.

## API

- `POST /api/quick` `{ "email": "..." }` → heuristic result  
- `POST /api/analyze` `{ "email": "..." }` → SSE stream (`quick`, `status`, `tool_*`, `text`, `report`, `done`)  
- `GET /api/fixtures` · `GET /api/fixtures/:id`
