# Telescope analysis — Perplexity AI (reference model)

This document captures a **full-stack, multi-layer breakdown** of the Perplexity product surface: features, subsystems, behaviours, and configuration. It is a **reference taxonomy** for planning and gap analysis, not an official Perplexity spec.

---

## Layer 1 — Galaxy view

The Perplexity ecosystem as five macro-systems:

| Galaxy | Scope |
|--------|--------|
| **Search engine** | Real-time web search, source-grounded answers, multi-step reasoning |
| **LLM interface** | Chat, file analysis, model selection, reasoning modes |
| **Knowledge management** | Spaces, Pages, saved threads, contextual memory |
| **Execution systems** | Deep Research (autonomous multi-step agent), Labs (custom apps), Comet (AI browser) |
| **Platform infrastructure** | Connectors, settings, API |

---

## Layer 2 — Constellations

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
- Academic search (via web)  

### 2. LLM constellation

- Chat interface  
- Model selection  
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

### 5. Platform constellation

- API keys  
- Connectors (Drive, Dropbox)  
- Privacy controls  
- Model quotas  

---

## Layer 3 — Star view

### Search features

Real-time web search; source-grounded answers; citation list; step-by-step reasoning; related questions; image search; news search; academic search (via web); multi-source aggregation; Pro Search; Deep Search; “Include Web” toggle; Space-context-only search; file-context-only search.

### Chat / LLM features

Chat interface; model selection; “Best” auto-select; code generation/explanation/debugging; table/chart generation; multi-file reasoning; image understanding/captioning/Q&A; long-context reasoning; voice input/dictation; multi-turn memory.

### File features

Upload PDFs, images, text, docs; multi-file analysis; file-aware search/chat/Deep Research; file syncing (Pro/Max); connectors (Drive, Dropbox).

### Spaces features

Save threads; organize research; upload files; add instructions; toggle web search; persistent context; Space-level memory; Space-level behaviour override.

### Pages features

Convert answers to Pages; auto-formatting; versioning (implicit).

### Deep Research features

Multi-step autonomous agent; planning; searching; synthesizing; summarizing; tables/charts; long-running tasks; progress updates; multi-source evidence; multi-file integration.

### Labs features

Build mini-apps; UI components; data pipelines; interactive dashboards; model selection; custom logic.

### Settings features

**Answer instructions:** role, tone, structure, behaviour, constraints, formatting rules.  

**Search:** include web by default; use Space context; file context; connectors.  

**General:** default model/mode; theme; notifications.  

**Privacy:** delete history; clear Spaces; shared Pages; connectors.  

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

### Deep Research micro-behaviours

Plans before searching; parallel search; post-gather synthesis; automatic tables/charts; long runs; progress UI; retries; clustering and deduplication.

### Labs micro-behaviours

Sandboxed apps; model + search access; UI rendering; sharing; persisted state.

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

*Document version: 2.0 — final feature taxonomy (reference model).*
