# Telescope analysis — Perplexity AI (reference model)

This document captures a **full-stack, multi-layer breakdown** of the Perplexity product surface: features, subsystems, behaviours, and configuration. It is a **reference taxonomy** for planning and gap analysis, not an official Perplexity spec.

An **appendix** maps each area to **this repository** (`nexus` / Perplexity-style clone) so multi-agent work can prioritize realistically.

---

## Layer 1 — Galaxy view

The Perplexity ecosystem as five macro-systems:

| Galaxy | Scope |
|--------|--------|
| **Search engine** | Real-time web search, source-grounded answers, multi-step reasoning |
| **LLM interface** | Chat, file analysis, model selection, reasoning modes |
| **Knowledge management** | Spaces, Pages, saved threads, contextual memory (Space-level) |
| **Execution systems** | Deep Research (autonomous multi-step agent), Labs (custom apps), Comet (AI browser) |
| **Platform infrastructure** | Accounts, plans, connectors, settings, API |

Everything in Perplexity’s product can be classified under one of these five.

---

## Layer 2 — Constellations

Major subsystems inside each galaxy.

### 1. Search constellation

- Web search  
- Pro search  
- Deep search  
- Multi-source aggregation  
- Citation engine  
- Step-by-step reasoning trace  
- Related questions  
- Source clustering  
- Image search  
- News search  
- Academic search (via web)  

### 2. LLM constellation

- Chat interface  
- Model selection  
- Sonar (default model)  
- GPT-5  
- Claude  
- Gemini  
- “Best model” auto-selector  
- Code interpreter (implicit)  
- Table generator  
- Chart generator  
- Multi-file reasoning  
- Image understanding  

### 3. Knowledge constellation

**Spaces**

- Persistent context  
- Space-level instructions  
- File storage  
- Thread storage  
- Web toggle  
- Sharing  
- Collaboration  

**Pages**

- Publish answers  
- Auto-formatted layout  
- Public link  
- Versioning (implicit)  

### 4. Execution constellation

**Deep Research**

- Multi-step autonomous agent  
- Planning, searching, synthesizing, summarizing  
- Table/chart generation  
- Long-running tasks  
- Progress updates  

**Labs**

- Custom mini-apps  
- UI components  
- Data pipelines  
- Interactive dashboards  
- Shareable apps  

**Comet (Max)**

- AI browser  
- Multi-tab research  
- Auto-summaries  
- Real-time browsing  
- Integrated search  
- Reading mode  

### 5. Platform constellation

- Account  
- Billing  
- Usage  
- API keys  
- Connectors (Drive, Dropbox)  
- Privacy controls  
- Model quotas  
- Device sync  

---

## Layer 3 — Star view

Exhaustive feature list by subsystem (Perplexity reference).

### Search features

Real-time web search; source-grounded answers; citation list; step-by-step reasoning; related questions; image search; news search; academic search (via web); multi-source aggregation; Pro Search; Deep Search; “Include Web” toggle; Space-context-only search; file-context-only search.

### Chat / LLM features

Chat interface; model selection; Sonar; GPT-5; Claude; Gemini; “Best” auto-select; code generation/explanation/debugging; table/chart generation; multi-file reasoning; image understanding/captioning/Q&A; long-context reasoning; voice input/dictation; multi-turn memory (Space-level).

### File features

Upload PDFs, images, text, docs; multi-file analysis; file-aware search/chat/Deep Research; file syncing (Pro/Max); connectors (Drive, Dropbox).

### Spaces features

Save threads; organize research; upload files; add instructions; toggle web search; share Space; collaborate; persistent context; Space-level memory; Space-level behaviour override.

### Pages features

Convert answers to Pages; auto-formatting; public sharing; SEO-friendly layout; versioning (implicit).

### Deep Research features

Multi-step autonomous agent; planning; searching; synthesizing; summarizing; tables/charts; long-running tasks; progress updates; multi-source evidence; multi-file integration.

### Labs features

Build mini-apps; UI components; data pipelines; interactive dashboards; shareable apps; model selection; custom logic.

### Comet features (Max)

AI browser; multi-tab research; auto-summaries; real-time browsing; integrated search; reading mode; page-aware Q&A.

### Settings features

**Answer instructions:** role, tone, structure, behaviour, constraints, formatting rules.  

**Search:** include web by default; use Space context; file context; connectors.  

**General:** default model/mode; theme; notifications.  

**Privacy:** delete history; clear Spaces; shared Pages; connectors.  

**Account:** plan, billing, usage, model quotas, device sync.

---

## Layer 4 — Surface detail

Micro-settings, toggles, behaviours, and hidden UI surfaces.

### Answer instructions (micro-behaviours)

Perplexity-style product respects: role, tone, structure, reasoning style, output format, constraints, “always/never”, domain focus, persona, planning/research/execution behaviour.  

Typically **natural-language only** (not `.rules` files, JSON schemas, or hidden system prompt slots in the consumer UI—those are product-specific).

### Search micro-behaviours

- Include Web ON → web + Space + files  
- OFF → Space + files only  
- No Space context → web only  
- Files uploaded → files can dominate context  
- Model choice trades speed/cost vs depth  

### Deep Research micro-behaviours

Plans before searching; parallel search; post-gather synthesis; automatic tables/charts; long runs; progress UI; retries; clustering and deduplication.

### Labs micro-behaviours

Sandboxed apps; model + search access; UI rendering; sharing; persisted state.

### Comet micro-behaviours

Automatic page read/summarize; entity extraction; multi-tab reasoning; chat integration.

---

## Layer 5 — Subsurface mechanics

Behavioural and context engines as typically described for Perplexity-class products.

### Behaviour engine

Persistent **behavioural contract** (e.g. answer instructions) applied with priority over ad-hoc prompts, often **per Space**.

### Context engine

Merges Space instructions, Space files, threads, user message, web results, and model reasoning into a **single context window** for synthesis.

### Search engine

Multiple providers (product-dependent); aggregate, rank, snippet; feed LLM; LLM writes the answer.

### Deep Research engine

Autonomous loop: plan → search/read → extract → summarize → synthesize → structured output (tables, charts, long reports).

---

## Appendix A — This repository: coverage matrix

**Legend:** ✅ implemented (usable) · 🟡 partial / UI-only / different semantics · ❌ not present  

**Scope:** Open-source React/Vite app with Tavily search, OpenAI-compatible LLM via `/api/llm` proxy, `localStorage` persistence. **Not** the commercial Perplexity service.

### Galaxy → this repo

| Galaxy (Perplexity) | This repo |
|---------------------|-----------|
| Search engine | 🟡 Tavily + focus modes; single provider; citations via `SourceCard` / markdown |
| LLM interface | 🟡 Chat, attachments, model pick (UI), Model Council; no Sonar/GPT-5 branding |
| Knowledge management | 🟡 **Workspaces** ≈ light Spaces; **Threads** saved locally; no Pages, no cloud sync |
| Execution systems | 🟡 “Advanced” search depth + indicators; **not** a full Deep Research agent; no Labs/Comet |
| Platform | 🟡 Settings + OAuth connectors (BYO client ids); **no** accounts/billing/API product |

### Constellation highlights

| Area | Status | Notes |
|------|--------|--------|
| Web search | 🟡 | `executeWebSearch` → Tavily; optional key |
| Pro / Deep search (product sense) | 🟡 | “Advanced” toggles deeper Tavily params; not Perplexity Pro |
| Citations | ✅ | Sources attached to messages; markdown rendering |
| Related / follow-up questions | 🟡 | `generateFollowUpQuestions` (LLM-generated) |
| Step-by-step reasoning trace | ❌ | No dedicated trace UI |
| Image / news / academic search | 🟡 | Focus modes bias query; not separate search backends |
| Chat | ✅ | Core flow |
| Model selection | 🟡 | Select in UI; council uses configured model IDs; proxy must support them |
| Sonar / GPT-5 / auto “best” | ❌ | OpenAI-compatible models only unless proxy points to OpenRouter etc. |
| Code/table/chart generators | ❌ | No dedicated interpreters; model may emit markdown tables |
| Multi-file + images | 🟡 | Upload + text extraction path; image preview; analysis via LLM |
| Spaces (full) | 🟡 | Workspaces + custom system prompt; no sharing/collab/web toggle per Space |
| Pages | ❌ | No publish/Pages product |
| Deep Research (agent) | 🟡 | UI pieces exist; **no** autonomous multi-step agent pipeline |
| Labs / Comet | ❌ | Out of scope |
| Account / billing / usage | ❌ | Out of scope |
| Connectors | 🟡 | OAuth + cloud file browser; user-supplied OAuth apps |

### Layer 3 star features — quick map

- **Search stars:** mostly 🟡 (subset via Tavily + focus modes).  
- **Chat/LLM stars:** 🟡 chat + files + council; ❌ voice, auto-best, vendor-specific models as products.  
- **File stars:** 🟡 upload + analysis dialog; 🟡 connectors.  
- **Spaces stars:** 🟡 threads + workspace prompt; ❌ share, collab, Space-only web toggle.  
- **Pages / Deep Research / Labs / Comet / full settings:** largely ❌ or 🟡 as noted above.

### Layer 4–5 mechanics — this repo

- **Behaviour:** workspace `customSystemPrompt` + optional advanced mode instructions → closest to “answer instructions” **per workspace**, not global Perplexity-style profile.  
- **Context:** user message + Tavily snippets + file text + system prompt merged in `App.tsx` / `api.ts` prompt strings — **no** separate retrieval/RAG stack.  
- **Search:** single Tavily call path (no multi-provider ranker).  
- **Deep Research:** not implemented as an agent loop; “deep” ≈ richer search + longer prompts.

---

## Appendix B — Suggested implementation phases (for parity direction)

Priorities depend on product goals; a **pragmatic** ordering for *this* codebase:

1. **Core search + chat parity:** robust “include web” / workspace-only modes, clearer citation UX, follow-ups.  
2. **Spaces parity:** Space-level files, web toggle, optional thread listing per Space.  
3. **Deep Research parity:** job queue, planner, multi-search loop, progress stream, export.  
4. **Pages:** static export of answers to shareable HTML/Markdown routes.  
5. **Platform:** auth, billing only if productized.  
6. **Labs / Comet:** separate products; iframe or new shell.

---

*Document version: 1.0 — aligned to repository state at time of authoring.*
