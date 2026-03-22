# Roadmap — remaining work in overnight batches

This splits **everything left** vs `docs/PERPLEXITY-TELESCOPE-ANALYSIS.md` into **four large batches** (each suitable for one automated coding run). Phases **1–6** are treated as **done** (see links below).

---

## Agent persona (paste with every batch)

**You are an autonomous implementation agent** for this repository: a senior **TypeScript / React / Vite** engineer who ships **real, end-to-end behavior**. You read surrounding code before editing, match existing patterns and naming, install any new dependencies explicitly, and leave the repo in a state where **`npm run verify`** passes. **No stubs:** do not add placeholder panels, fake progress, inert toggles, or “coming soon” UI—if something cannot be implemented correctly in this pass, **omit it** and document the gap in code comments or a short note, rather than shipping a facade.

Each batch file below also lists **Goals** (concrete outcomes) and **Governance** (batch-specific). Paste the **entire** batch `.md` as the first message to the coding agent.

**Governance (all batches):** every user-visible control must **do real work** or **not exist**. Run `npm run verify` before handoff.

---

## Completed (Phases 1–6)

| Phase | Topic | Doc |
|-------|--------|-----|
| 1 | Include web, Tavily gating | [PHASE-01-COMPLETE](PHASE-01-COMPLETE.md) |
| 2 | Thread history, focus vs web | [PHASE-02-COMPLETE](PHASE-02-COMPLETE.md) |
| 3 | Model Council + priors | [PHASE-03-COMPLETE](PHASE-03-COMPLETE.md) |
| 4 | Answer instructions + privacy clear | [PHASE-04-COMPLETE](PHASE-04-COMPLETE.md) |
| 5 | Markdown export / Pages-lite | [PHASE-05-COMPLETE](PHASE-05-COMPLETE.md) |
| 6 | Default model, theme, desktop notifications | [PHASE-06-COMPLETE](PHASE-06-COMPLETE.md) |

---

## Batch index (what to run overnight)

| Batch | File | Theme |
|-------|------|--------|
| **7** | [batches/BATCH-07-SEARCH-AND-TRACE.md](batches/BATCH-07-SEARCH-AND-TRACE.md) | Search transparency: dedupe, clustering, step trace, related questions |
| **8** | [batches/BATCH-08-DEEP-RESEARCH.md](batches/BATCH-08-DEEP-RESEARCH.md) | Deep Research MVP: plan → multi-search → synthesize + progress |
| **9** | [batches/BATCH-09-SPACES-KNOWLEDGE.md](batches/BATCH-09-SPACES-KNOWLEDGE.md) | Spaces parity: per-space web toggle, files, thread organization |
| **10** | [batches/BATCH-10-VOICE-AND-PLATFORM.md](batches/BATCH-10-VOICE-AND-PLATFORM.md) | Voice input, export-all-data, best-model heuristic, quotas display |

**Explicitly out of scope for these batches (product size):** Comet (AI browser), full Labs platform, server-side Pages hosting, billing, accounts — revisit only with a separate product decision.

---

## Order

Run **7 → 8 → 9 → 10** in order (each may assume previous batches are merged). If you must parallelize, only **7** and **9** are loosely independent; **8** touches search orchestration and **10** touches settings — merge **7** before **8** if both touch `api.ts` heavily.

---

## Automation hint

For each overnight run: open a new agent, paste the **entire** contents of the batch’s `.md` file as the first message, ensure branch is up to date with `main` / your integration branch, then `npm run verify` at the end.
