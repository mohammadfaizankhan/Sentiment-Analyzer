# Sentiment Analyzer

A React dashboard for English `.txt` conversations. VADER provides fast, deterministic local sentiment; optional NVIDIA Nemotron 3 Super adds summaries, emotions, call KPIs and contextual review of ambiguous sentences. The SignalSense interface follows the supplied reference: registration, persistent sign-in, uploads, pasted transcripts, and sample calls.

**Deployed and verified on Vercel.** See [REQUIREMENTS.md](REQUIREMENTS.md) for the assignment and follow-up audit.

- [Live application](https://sentiment-analyzer-xi-five.vercel.app/)
- [Public backend API documentation](https://sentiment-analyzer-api-one.vercel.app/docs)

Choose **Register** on the hosted app to create your account with a name, email, and password. Existing accounts use **Sign in**. Browser authentication uses a 24-hour signed HttpOnly cookie; refreshing restores your session.

## Architecture

```text
React login / upload / Add AI insights
  → FastAPI authentication and file validation
  → compiled LangGraph
      parse turns and sentences
      → VADER scores and labels
      → local ambiguity flags
      → baseline and calculated KPIs
      → AI OFF: local results
      → AI ON: one bounded NVIDIA request
          call insights + batch of flagged sentence reviews
          → strict JSON, evidence and role validation
          → valid: apply labels and recalculate distribution / overall
          → failure: original VADER results and a notice
  → typed JSON → dashboard
```

LangGraph satisfies the PDF's allowance for n8n **or another agentic orchestration tool**. Account storage is separate from analysis: SQLite locally and private Vercel Blob in production. No transcripts are stored.

| Responsibility | Engine |
| --- | --- |
| Original sentence scores and baseline overall label/score | Local VADER |
| Ambiguity flags | Configurable local rules |
| Counts, percentages, volatility, trend, final aggregation | Python calculations |
| Summary, emotions, satisfaction indication, resolution, outcome, risk, topics | Optional Nemotron |
| Selected ambiguous sentence labels | Optional Nemotron; original scores preserved |

Interview explanation: “We use VADER as the primary sentiment analyzer because it is fast, deterministic, local and inexpensive. Nemotron is used selectively for semantic tasks that require contextual understanding, such as emotion analysis, conversation summaries, call outcomes and ambiguous sentiment. This reduces latency and API dependency while improving contextual handling.” Regression examples do not establish benchmark accuracy.

## Stack and files

React 19, Vite 7, plain CSS; FastAPI, LangGraph, VADER, pySBD, HTTPX, Pydantic; pytest/Ruff and Vitest/Testing Library/ESLint.

- `frontend/src/App.jsx`: registration, cookie session restoration, upload/paste/sample, opt-in and API states.
- `frontend/src/components/Results.jsx`: overview, score, chart, trend, table, KPIs and evidence.
- `backend/app/main.py`, `auth.py`, `accounts.py`, `models.py`: authenticated API, durable accounts, signed sessions and response schemas.
- `backend/app/sentiment.py`: parsing, speaker labels and VADER.
- `backend/app/config.py`, `ambiguity.py`, `kpis.py`: settings, review rules and numeric calculations.
- `backend/app/workflow.py`: compiled orchestration and safe fallback.
- `backend/app/insights.py`: backend-only NVIDIA request and strict output validation.
- `samples/evaluation.json`: 20 manual evaluation cases, never used for training.

## Windows PowerShell setup

Requires Python 3.12+ and Node.js 22.12+; verified with Python 3.12 and Node 24. Existing environment files are preserved.

Clone the repository first:

```powershell
git clone https://github.com/mohammadfaizankhan/Sentiment-Analyzer.git
Set-Location .\Sentiment-Analyzer
```

Start each terminal from the cloned project root. First-time backend setup:

```powershell
Set-Location .\backend
if (!(Test-Path .venv)) { python -m venv .venv }
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
```

Use **Register** to create a local account. Local accounts live in ignored `backend/data/accounts.sqlite3`; a persistent signing secret is generated in that same ignored directory. You can instead configure `AUTH_SECRET` (at least 32 random characters). `APP_USERNAME`/`APP_PASSWORD` are optional legacy Basic credentials for API scripts; they do not create browser email accounts.

Backend, terminal 1:

```powershell
Set-Location .\backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Frontend, terminal 2:

```powershell
Set-Location .\frontend
npm.cmd ci
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm.cmd run dev -- --port 5173 --strictPort
```

Open [the local app](http://127.0.0.1:5173/). Use existing servers if they are already running. Restart the backend after changing its `.env`; restart/rebuild Vite after changing its environment.

## Environment and security

| Variable | Location | Purpose |
| --- | --- | --- |
| `APP_USERNAME`, `APP_PASSWORD` | Backend only | Optional legacy Basic auth for API scripts. Blank/example passwords fail closed. |
| `AUTH_SECRET` | Backend only | Required on Vercel: at least 32 random characters for session signing. Rotating it signs out every account. |
| `BLOB_READ_WRITE_TOKEN` / `BLOB_STORE_ID` | Backend only | Private Vercel Blob account store; populated when connected to the backend project. |
| `ACCOUNTS_DB_PATH` | Local backend | Optional SQLite path; defaults to `backend/data/accounts.sqlite3`. Never used as a fallback on Vercel. |
| `NVIDIA_API_KEY` | Backend only | Optional provider key. Never expose through a `VITE_` variable. |
| `NVIDIA_MODEL` | Backend only | Default `nvidia/nemotron-3-super-120b-a12b`. |
| `AMBIGUITY_THRESHOLD` | Backend only | Default `0.20`; finite number from 0 to 1. Invalid settings fail explicitly. |
| `CORS_ORIGINS` | Backend only | Exact comma-separated frontend origins; localhost/127.0.0.1:5173 by default. |
| Same-origin `/api` routing | Frontend config | Vite proxies to port 8000 locally; Vercel rewrites to the public backend. No frontend API environment variable is required. |

Example AI configuration (placeholder only):

```dotenv
NVIDIA_API_KEY=your-nvidia-api-key
NVIDIA_MODEL=nvidia/nemotron-3-super-120b-a12b
AMBIGUITY_THRESHOLD=0.20
```

Obtain a key from [NVIDIA Build](https://build.nvidia.com/nvidia/nemotron-3-super-120b-a12b), then enter it directly in `backend/.env`. Existing process variables take precedence over `.env`. The [NVIDIA hosted chat endpoint](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-super-120b-a12b) is called with thinking disabled for this bounded extraction task.

The frontend never receives provider keys or account hashes. Passwords are hashed with scrypt and unique random salts. Production account records are stored in a **private** Blob store under hashed email paths with create-only writes. Cookies are HttpOnly, SameSite=Lax, Secure on HTTPS, and expire after 24 hours. Authentication responses disable caching; cross-origin cookie mutations are rejected. The first-party API proxy avoids third-party cookie dependence. Neither passwords nor session tokens are stored in localStorage/sessionStorage.

Logout clears the browser cookie. Signed sessions are stateless: a copied cookie remains valid until expiry or `AUTH_SECRET` rotation. Registration does not verify email ownership and password recovery is not implemented, matching the reference's scope. For broader public use, add email verification/recovery and provider-level authentication rate limits. User accounts are persisted; transcripts and analysis results are not. AI opt-in discloses transmission to NVIDIA, whose service terms apply. Leave LangSmith tracing disabled when transcripts must remain local. `.gitignore` excludes environment files, account data and generated output.

## Analysis rules

1. **Parsing:** one speaking turn per line, with pySBD splitting multiple sentences. Recognized labels: Customer/Caller/Client and Agent/Advisor/Representative/Support, case-insensitively. Inline labels apply to that line; standalone `Customer:` labels apply to following lines until another label. Optional leading timestamps are removed. Other names remain unlabeled; roles are not guessed.
2. **VADER:** compound ≥ 0.05 is Positive; ≤ −0.05 is Negative; otherwise Neutral. Curly apostrophes are normalized for negation. The lexicon's mildly positive entry for `number` is neutralized because call identifiers are factual.
3. **Ambiguity:** `abs(compound_score) < AMBIGUITY_THRESHOLD`, contrast, negation, mixed polarity, tentative wording, indirect complaints, sarcasm cues and escalation language flag possible review. These are heuristics, not confidence probabilities. Neutral factual statements may be flagged but should stay Neutral after review.
4. **Overall aggregation:** the baseline applies VADER thresholds to the equally weighted mean original sentence score. If AI changes no labels, it remains the final overall label. If a label changes, the most frequent final label wins. Ties retain the baseline if it is tied; otherwise they become Neutral. The same rule applies to the labeled-customer subset. Aggregation is deterministic for a given validated response.
5. **Numeric integrity:** sentence and overall compound scores never change after review. `vader_baseline` preserves original label/counts/percentages. Final counts/distribution reflect reviewed labels, so the final overall label can differ from the unchanged raw score. The dashboard explicitly explains this distinction.
6. **Calculated KPIs:** counts, percentages, customer metrics and population standard deviation of original scores (volatility). One sentence has zero volatility. At least three sentences produce three contiguous beginning/middle/end groups using all speakers and raw scores. First-to-last change remains in the API. Trend is not a resolution or satisfaction measurement.
7. **AI interpretation:** emotions, satisfaction indication, resolution, outcome, escalation risk, primary issue, topics and complaint indicator include explanations and source IDs. Role-specific findings require that role's labeled evidence; insufficient evidence means Unknown. Promised future delivery is not completed resolution. No duration, numeric CSAT or confidence is invented.

## AI behavior, validation and limits

**AI OFF:** no NVIDIA request, even with a configured key. **AI ON:** one request combines call insights and up to **20 flagged sentence reviews**. Language cues take priority over merely weak polarity. Clear sentences retain VADER; remaining unreviewed flagged sentences also retain VADER, with a batch-limit notice.

The request uses JSON output mode and a schema in the prompt. Strict Pydantic validation rejects malformed/truncated output, extra fields, unsupported labels, duplicate emotions, missing/duplicate evidence IDs, incorrect speaker references, and review IDs outside the exact selected batch. This validates structure/references, not semantic truth. React never parses uncontrolled prose.

- Upload: UTF-8 with optional BOM, `.txt`, at most 100,000 bytes, 500 sentences, 2,000 characters per sentence. Empty, whitespace-only, binary, invalid encoding and punctuation/number-only files are rejected.
- AI input: at most 100 sentences / 12,000 text characters, at least three words. Oversized input is analyzed fully with VADER; it is not silently truncated for AI.
- One request, no automatic retries, 4,096 output tokens, 5-second connection / 45-second read timeout. Frontend allows 65 seconds with AI and 30 seconds without it.
- Missing/invalid key, retired model, rate limit, service failure, timeout or invalid response preserves the exact local result with a notice. Very short inputs have a limited-context notice and no fabricated trend.

VADER can miss English context and sarcasm. Nemotron can misinterpret emotions or outcomes. Capped review and output limits can trigger fallback. Human review is needed; no benchmark accuracy claim is made.

## API

[Interactive API schema](http://127.0.0.1:8000/docs).

| Endpoint | Input | Response |
| --- | --- | --- |
| `GET /api/auth` | Session cookie | Public `user` (name/email), or null |
| `POST /api/auth` | JSON action `register`, `login`, or `logout`; name/email/password as needed | Public `user`; sets or clears session cookie |
| `POST /api/login` | Legacy HTTP Basic, no body | `username` |
| `POST /api/analyze` | Session cookie or legacy HTTP Basic; multipart `file`, `include_insights` default false | Filename, overall label/score, distribution, baseline, sentences, calculated KPIs, optional insights/notices |

Each sentence has `id`, `speaker`, `text`, `sentiment`, `vader_sentiment`, `compound_score`, `analyzer` (`vader` or `nemotron-contextual`), ambiguity reasons, contextual explanation and source IDs. Top-level `analyzer` is `hybrid` if a label changed. `insights` contains validated finding objects. `kpis.counts`/`percentages` are calculated locally. Errors have readable `detail`, without provider secrets or internal error text.

From project root, curl prompts for the configured password:

```powershell
curl.exe -u analyst -X POST http://127.0.0.1:8000/api/login
curl.exe -u analyst -F "file=@samples/hybrid-demo.txt" -F "include_insights=false" http://127.0.0.1:8000/api/analyze
```

## Automated verification

```powershell
Set-Location .\backend
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check app tests
Set-Location '..\frontend'
npm.cmd ci
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

Tests block live NVIDIA calls and simulate provider success/failure. They cover auth, file validation, segmentation, scores, ambiguity, batching, schemas/evidence, roles, exact fallback, aggregation, volatility/trend, login, upload, opt-in, loading, retry, filtering and rendering. `requirements-lock.txt` records the Python environment; `package-lock.json` locks npm dependencies. See [REQUIREMENTS.md](REQUIREMENTS.md) for final counts. One upstream Starlette/AnyIO deprecation warning is emitted; it does not fail the tests.

Live synthetic transcript checks also passed via the backend and browser: four reviewed sentences, two corrections, factual agent sentences Neutral, final counts 1 Positive / 2 Negative / 2 Neutral, raw compound score unchanged at +0.2425.

## Interview demo

1. Register or sign in with your email account.
2. Upload `samples/trend-demo.txt`, AI OFF. Show distribution, raw scores and Negative → Neutral → Positive trend.
3. Upload `samples/hybrid-demo.txt`, AI OFF. Point out VADER's literal reading of “Great, I've been waiting for three hours.”
4. Enable **Add AI insights** and reanalyze. Expand **Context reviewed · label changed**. Explain the corrected label and unchanged raw score. Review resolution, emotions, topics and evidence.
5. Filter Negative sentences and search a phrase. KPIs still describe the full transcript.
6. Use `samples/evaluation.json` for 20 cases covering sarcasm, negation, unknown roles, promises, escalation and limitations. Acceptable labels are reviewer guidance; some examples specifically test trend/roles rather than one overall label. No training uses this dataset.

Export an evaluation case to a file, from project root:

```powershell
$demoCases = Get-Content .\samples\evaluation.json -Raw | ConvertFrom-Json
$demoCases | Select-Object id, category
($demoCases | Where-Object id -eq '06-sarcasm-charge').text | Set-Content .\samples\selected-demo.txt -Encoding utf8
```

For missing-key fallback without editing the stored key: stop the backend, set `$env:NVIDIA_API_KEY = ' '` in that terminal, restart, and analyze with AI ON. Local results remain with a notice. Stop it, run `Remove-Item Env:NVIDIA_API_KEY`, then restart to restore `.env`. Automated tests demonstrate service failures without external calls.

## Deployment

`frontend/vercel.json` and `backend/vercel.json` configure separate frontend and FastAPI projects. Both are deployed in the `sentiment-analyzer1` Vercel team: `sentiment-analyzer` (frontend) and `sentiment-analyzer-api` (backend). GitHub sign-in is linked to the owner's Vercel account. These deployments were published with the CLI from their respective subdirectories.

The backend uses Python 3.12 and a 60-second function limit. Ruff settings live in `backend/ruff.toml`, so Vercel installs runtime dependencies from `requirements.txt` rather than treating a lint-only `pyproject.toml` as a Python package. Production `CORS_ORIGINS` is restricted to the live frontend origin, and the frontend rewrites `/api/*` to the public backend. The signing secret, Blob token, optional legacy password, and NVIDIA key are backend-only environment variables.

Hosted verification passed: public access, authenticated login, unauthorized-request rejection, CORS preflight, `.txt` upload, VADER results, empty-file rejection, live Nemotron insights, contextual corrections, score preservation, chart rendering, filtering and evidence expansion. One initial NVIDIA timeout preserved the local results; a subsequent browser analysis successfully returned all AI insights. No browser errors or page-wide horizontal overflow were observed. The published JavaScript bundle contains neither the provider key nor the production password.

To publish updates from the already-linked local workspace:

```powershell
Set-Location .\backend
npx.cmd vercel deploy --prod --scope sentiment-analyzer1
Set-Location ..\frontend
npx.cmd vercel deploy --prod --scope sentiment-analyzer1
```

For a new Vercel account or fresh project setup:

1. Authenticate with `npx.cmd vercel login`.
2. From `backend`, run `npx.cmd vercel` to link the project. Create and connect a private Blob store using `npx.cmd vercel blob create-store signalsense-accounts --access private --yes --environment production`. Set a random `AUTH_SECRET` of at least 32 characters, `CORS_ORIGINS`, and optional `NVIDIA_API_KEY`/`NVIDIA_MODEL` in backend hosting settings. Deploy with `npx.cmd vercel --prod`.
3. From `frontend`, run `npx.cmd vercel`; set the `/api/:path*` rewrite destination in `frontend/vercel.json` to your backend HTTPS origin plus `/api/:path*`. Deploy with `npx.cmd vercel --prod`.
4. Set backend `CORS_ORIGINS` to the exact frontend HTTPS production origin and redeploy. Ensure hosting request-duration limits accommodate optional inference and deployment protection permits browser API requests/preflight.
5. Test production registration, login, refresh, logout, upload, local analysis, live AI and fallback before marking deployment complete.

References: [LangGraph](https://docs.langchain.com/oss/python/langgraph/graph-api), [VADER](https://github.com/cjhutto/vaderSentiment), [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [FastAPI on Vercel](https://vercel.com/docs/frameworks/backend/fastapi).
