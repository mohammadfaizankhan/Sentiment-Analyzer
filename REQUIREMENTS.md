# Requirement audit

Sources: `Assignment Sentiment Analyzer Full Stack AI.pdf` (external assignment input, read in full before changes and not included in the repository) and the user's 19-phase hybrid improvement request. The existing application was extended; no rebuild or extra infrastructure was introduced.

## Before-change audit

| Assignment requirement / follow-up | Status at audit | Required change |
| --- | --- | --- |
| React login, authenticated text upload | Working | Preserve flow and validation |
| Local sentence/overall VADER | Working | Expose numeric scores and preserve original labels |
| Orchestration | Working compiled LangGraph | Keep the PDF-permitted alternative to n8n |
| Optional NVIDIA insights | Summary/emotion/outcome available | Expand typed findings and add batched contextual review |
| Ambiguity detection / source tracking | Missing | Configurable rules, candidate cap, review metadata |
| Aggregation and KPIs | Basic mean and counts | Explain correction-aware aggregation, volatility and customer sentiment |
| Trend, score table, richer call dashboard | Partial | Add raw score display, three-part trend and grounded call findings |
| Tests | Backend suite; no frontend test/lint setup | Add regression coverage, frontend tests and linting |
| Evaluation examples | One transcript | Add 20 manual cases plus targeted demo files |
| Deployment | Configuration present | Hosting-account access and production verification still required |

## Assignment PDF checklist

| Requirement | Status | Implementation / evidence |
| --- | --- | --- |
| React / Next.js frontend | Complete | Existing React 19 + Vite application; production build passes |
| Deploy frontend to Netlify / Vercel | Complete | [Live frontend](https://sentiment-analyzer-xi-five.vercel.app/) and [public backend](https://sentiment-analyzer-api-one.vercel.app/docs); hosted workflow verified |
| Login (basic authentication acceptable) | Complete | Reference-style registration/sign-in, scrypt password hashes, durable private accounts, HttpOnly sessions; legacy Basic API access retained |
| `.txt` upload | Complete | Frontend chooser/dropzone; authenticated multipart API, UTF-8/content/size checks |
| Dashboard with sentiment breakdown | Complete | Overall label, raw score, final counts/percentages, stacked chart, readable sentence table |
| n8n or another agentic orchestration tool | Complete | Actual compiled LangGraph invoked for every analysis |
| Overall Positive / Negative / Neutral | Complete | VADER baseline and documented deterministic aggregation after contextual corrections |
| Sentence-level sentiment | Complete | pySBD segmentation, VADER scores, optional selected label review |
| KPIs derivable from phone-call text | Complete | Calculated counts, customer sentiment, volatility, trend; optional evidence-backed AI call KPIs |
| Logical AI quality and clear reasoning when using an LLM | Implemented and tested within stated limits | Preserved scores, bounded context review, strict schema/reference checks and expandable source evidence; no benchmark accuracy guarantee |
| Clean frontend / orchestration / AI separation | Complete | React → FastAPI → LangGraph → VADER / backend-only NVIDIA |
| Creativity examples: chart, emotions, summary, extra KPIs | Complete | Distribution chart, trend, emotions, summary, topics, resolution, outcome and escalation risk |

## Follow-up phases

| Phase / requirement | Status | Implementation |
| --- | --- | --- |
| 1. Inspect/audit before editing | Complete | PDF/code/config/tests reviewed; initial audit above and communicated before edits |
| 2. VADER core, score, percentages | Complete | `sentiment.py`, `kpis.py`, `vader_baseline`; no provider required |
| 3. Sentence label and score | Complete | Typed response and score column in `Results.jsx` |
| 4. Configurable ambiguity | Complete | `config.py`, `ambiguity.py`; threshold plus contrast/negation/complaint/sarcasm/escalation clues |
| 5. AI opt-in | Complete | OFF never calls NVIDIA, including with a key; ON combines insights/review in one request |
| 6. Structured, validated output | Complete | JSON mode, Pydantic schema, exact review set and evidence/role validation; safe fallback |
| 7. Separate calculated and AI KPIs | Complete | `kpis.py` owns numbers; typed `insights` owns interpretations |
| 8. Analyzer source tracking | Complete | Original label/score, `analyzer`, reasons and context references per sentence |
| 9. Explainable aggregation | Complete | Mean baseline; after changed labels, most frequent final label with documented tie rule |
| 10. Call-specific findings | Complete | Explicit roles only; customer sentiment, emotion, complaint, resolution, outcome, satisfaction indication, risk |
| 11. Sentiment trend | Complete | Three contiguous groups of original scores; insufficient input is clearly indicated |
| 12. Dashboard | Complete | Core overview first, chart, KPIs, trend, searchable/filterable table, optional AI findings and evidence |
| 13. Loading/errors/fallback | Complete | Invalid files, short input, provider limits/key/auth/service/timeout/JSON failures; local results preserved |
| 14. Key security | Complete locally | Backend-only key, placeholder examples, broader env ignore rules, source and bundle scan with no key exposure |
| 15. Automated tests | Complete | 102 backend + 21 frontend tests; Ruff and ESLint pass |
| 16. Manual evaluation dataset | Complete | 20 cases in `samples/evaluation.json`; evaluation only, no training |
| 17. Architecture separation | Complete | Preserved existing LangGraph and API boundaries; no unnecessary services |
| 18. Performance | Complete | One optional request; at most 20 prioritized reviews; bounded input/output and timeouts; no automatic retries |
| 19. README | Complete | Setup, architecture, rules, API, limitations, security, tests, deployment and interview demo |

## Final verification — 4 September 2026

| Check | Result |
| --- | --- |
| Backend pytest | **102 passed, 0 failed** |
| Frontend Vitest / Testing Library | **21 passed, 0 failed** |
| Total automated tests | **123 passed, 0 failed** |
| Ruff | Passed |
| ESLint | Passed |
| Vite production build | Passed |
| Login and `.txt` upload in browser | Passed against running FastAPI |
| VADER with AI OFF | Passed; displayed raw scores, distribution and Negative → Neutral → Positive demo trend |
| Live Nemotron with AI ON | Passed via backend and browser using configured model/key |
| Ambiguous contextual review | Two corrections on hybrid demo; four reviewed sentences; clear final positive sentence retained |
| Core numeric integrity | Original compound +0.2425 preserved; final 1 Positive / 2 Negative / 2 Neutral, customer negativity 66.7% |
| Missing key / provider failures | Automated API/pipeline and UI fallback cases passed; no external requests in tests |
| Dashboard chart and evidence | Present in browser; frontend tests cover rendering, filters and expandable reasoning |
| Browser errors | None in observed error logs |
| Secret scan | Configured key absent from source, fixtures, documentation and built frontend; actual `.env` excluded |
| Production hosting | Both projects deployed to Vercel; public access and hosted workflow verified |

A live response initially contained duplicate emotion labels and was rejected without losing VADER results. The prompt now explicitly requires unique emotions; subsequent live backend and browser requests passed validation. Validation remains strict. Test execution emits one upstream Starlette/AnyIO deprecation warning, with no failures.

## Practical limits

VADER is English and lexicon-based. AI interpretations can still be wrong despite valid structure/references. Scores and trends remain raw VADER even when final labels change; the dashboard explains that distinction. Neutral sentences can be flagged by low polarity, and only a bounded prioritized subset is reviewed. Unknown roles remain unavailable/Unknown. Resolution is a semantic judgment supported by cited text, not independently verified fact. There is no duration or measured CSAT score, no transcript persistence, and no accuracy benchmark claim.

## Hosted verification — 4 September 2026

- GitHub account `mohammadfaizankhan` linked to Vercel; both projects published in team `sentiment-analyzer1`.
- Frontend: https://sentiment-analyzer-xi-five.vercel.app/
- Backend: https://sentiment-analyzer-api-one.vercel.app/ (API documentation at `/docs`).
- Public frontend/backend documentation returned HTTP 200. Valid login passed; missing authentication returned 401.
- Exact production-origin CORS preflight passed. Authenticated `.txt` upload produced five VADER sentence results; an empty upload returned 400.
- Live production browser analysis returned validated Nemotron insights: four reviewed sentences, two corrected labels, 20% Positive / 40% Negative / 40% Neutral, unchanged raw mean +0.2425.
- Negative filtering showed two of five sentences without changing conversation KPIs. Contextual explanation expanded correctly. Chart, scores, trend and AI findings rendered with no observed browser errors or page-wide horizontal overflow.
- The first hosted AI request timed out at the provider and correctly preserved VADER results. A subsequent browser request succeeded; this also exercised the real hosted fallback path.
- Production password and NVIDIA key are backend-only sensitive environment variables. Production login is stored in the ignored local `backend/.env.production` file. Neither secret is present in the published frontend bundle or committed source.
- Backend packaging uses `.python-version` and `requirements.txt`; development lint configuration was moved to `ruff.toml` to avoid Vercel treating it as a package definition.

**No mandatory assignment deliverables remain unimplemented.** The deployed AI service remains subject to provider availability and the practical interpretation limits above.

## SignalSense reference adaptation

- Adapted the supplied ZIP design to React/FastAPI: navy/mint/purple registration and sign-in, responsive workspace, editable uploads, pasted text and sample call.
- Added durable accounts using SQLite locally and a private Vercel Blob store in production; no transcript persistence.
- Passwords use salted scrypt; 24-hour signed HttpOnly cookies restore the session after refresh. Same-origin API rewrites avoid third-party cookie issues.
- Retained VADER/LangGraph/Nemotron behavior, opt-in, original scores, evidence, filters and safe fallback. Added a distribution donut and per-sentence score chart.
- Automated coverage includes duplicate accounts, invalid fields, tampered/expired cookies, cross-origin rejection, production storage configuration and failures, registration/login/logout UI, and existing analysis regression cases.

Hosted reference update verified: real registration, sign-out and returning-user email login; session restored in a fresh page; sample call and UTF-8 file uploads; live Nemotron on hybrid-demo.txt (four reviews, two label changes, unchanged +0.2425); Negative filter shows two of five sentences; responsive page has no horizontal overflow.
