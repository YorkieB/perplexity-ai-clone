# Batch 8 complete — Deep Research MVP

**Status:** Implemented on branch [`cursor/deep-research-flow-9fd2`](https://github.com/YorkieB/perplexity-ai-clone/tree/cursor/deep-research-flow-9fd2).

**Feature commit:** `4cff526` — *Implement deep research orchestration with progress UI*.

**Related commits (verification & fixes):** `086ebda` (ESLint peer alignment), `e046260` (TypeScript / `chart.tsx`), `c7010bc` (optional tooltip payload guard).

Prompt reference: [batches/BATCH-08-DEEP-RESEARCH.md](batches/BATCH-08-DEEP-RESEARCH.md).

## What shipped

### Deep Research orchestration (plan → multi-search → synthesize)

- **`executeDeepResearch(...)`** in **`src/lib/api.ts`**.
- **Planner** LLM step produces structured sub-queries (safe parsing + fallback).
- **Search loop** runs sub-queries **sequentially** (rate-aware) via existing **`executeWebSearch(...)`** with deep settings.
- **Synthesis** LLM step combines all collected snippets into the final answer.

**Documented constants:**

- `DEEP_RESEARCH_MIN_SUB_QUERIES = 3`
- `DEEP_RESEARCH_MAX_SUB_QUERIES = 5`
- `DEEP_RESEARCH_SEARCH_CONCURRENCY = 1`

### Include web / focus / workspace / files

- **Include web** is required for Deep Research (**chosen policy**): when off, Deep Research is **disabled** with UI explanation and toasts.
- Deep Research respects **focus mode**, **workspace prompt** (`customSystemPrompt`), and **attached file context**.

### Advanced vs Deep Research (UX)

- **Advanced analysis** = single enriched pass.
- **Deep research** = planner + multiple searches + synthesis.
- **QueryInput** copy and controls distinguish the two; plus-menu **Deep Research** entry drives the actual mode.

### Progress UI

- **`DeepResearchIndicator`**: step list — **Planning** → **Searching** (i/n + current sub-query) → **Synthesizing**, integrated into the message stream during generation.

### Sub-search error policy

- **Toast + continue**: failed sub-searches are surfaced; final response notes **partial coverage** where applicable.

### Persistence metadata

- **`Message`** extended with `isDeepResearch?: boolean` and `deepResearchMeta?: DeepResearchMeta` (planned / successful / failed sub-queries, timing, limits) for export and history.

### Single-flight guard

- **Generation lock** in **`App.tsx`** prevents overlapping runs.

### Message tagging

- Assistant Deep Research replies show a **Deep Research** badge and **sub-query count**.

## Repo-level verification fixes (same branch)

To satisfy **`npm install && npm run verify`**:

- **`verify`** script in **`package.json`** (`lint` && `build`).
- **ESLint** peer alignment: `@eslint/js` → `^9.39.1` (compatible with **eslint 9**).
- Strict TS fixes in **`src/components/ui/chart.tsx`**.
- Optional tooltip payload guard (**`c7010bc`**).

## Verification

```bash
npm install && npm run verify
```

**Result:** pass (lint + build).

## How to test (manual)

1. Enable **Include web** → start **Deep Research** on a multi-part question → watch progress steps and final synthesized answer.
2. Turn **Include web** off → Deep Research is **disabled** with clear messaging.
3. Trigger a sub-search failure path → **toast**, run continues, answer notes partial coverage.
4. Confirm **no overlapping** sends while a run is in progress.
