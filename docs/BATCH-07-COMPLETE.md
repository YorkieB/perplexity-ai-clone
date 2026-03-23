# Batch 7 complete — Search transparency & sources

**Status:** Implemented on branch [`cursor/search-transparency-and-sources-76d9`](https://github.com/YorkieB/perplexity-ai-clone/tree/cursor/search-transparency-and-sources-76d9). Commit **`59b56e9`** — *Implement search transparency and source clustering*.

Prompt reference: [batches/BATCH-07-SEARCH-AND-TRACE.md](batches/BATCH-07-SEARCH-AND-TRACE.md).

## What shipped

### Source deduplication (normalized URL)

- URL normalization in **`src/lib/search-utils.ts`** (`normalizeSourceUrl`): hash fragments stripped; trailing-slash policy documented in code comments.
- **`executeWebSearch`** deduplicates results by normalized URL: keeps **higher score** on conflict; **first occurrence** on score ties.

### Source grouping (clustering) by registrable domain

- **`getRegistrableDomain`** in **`src/lib/search-utils.ts`**.
- **`src/components/Message.tsx`**: single-source domains use the existing **`SourceCard`** flow; multiple sources under one domain render in **collapsible** grouped sections (e.g. `example.com (3)`).

### Search step trace / transparency

- **`SearchTrace`** in **`src/lib/types.ts`**, attached to assistant messages where applicable.
- **`executeWebSearch`** returns **`{ sources, trace }`** on success.
- **Message UI**: collapsible **Search steps** only when a **successful** web search path ran. Includes query sent, focus mode label, advanced on/off, result count, timestamp. **Omitted** when search is skipped or errors.

### Related questions consistency

- **`generateFollowUpQuestions`**: de-duplicates generated questions; filters questions already present in assistant response text.
- **Model council** path also generates and stores follow-up questions (fixes missing follow-ups there).
- **`FollowUpQuestions`**: empty-state when none are generated.

### Dev-only telemetry

- **`import.meta.env.DEV`** debug logging of search params inside **`executeWebSearch`** (not user-facing).

## Files touched (on implementation branch)

`src/lib/search-utils.ts` (new), `src/lib/types.ts`, `src/lib/api.ts`, `src/App.tsx`, `src/components/Message.tsx`, `src/components/FollowUpQuestions.tsx`

## Verification

**Target:** `npm install && npm run verify`

On the implementation run, **`npm install`** failed due to an **existing peer dependency conflict** in the repo (e.g. **`@eslint/js` major vs `eslint` 9** resolution). **Alternative validation** succeeded:

- `npm run lint` — pass  
- `npm run build` — pass  

Agents should resolve install/peer alignment on the integration branch when merging (see Dependabot PRs for ESLint-related bumps if applicable).

## How to test (manual)

1. Run with web search on → confirm **deduped** sources, **domain groups**, **Search steps** expand/collapse, **related questions** (main and council paths).
2. Turn **Include web** off → **no** Search steps block.
3. Confirm empty follow-ups show the **empty state** when the LLM returns none.
