# Roadmap — remaining work in overnight batches

This splits **everything left** vs `docs/PERPLEXITY-TELESCOPE-ANALYSIS.md` into **four large batches** (each suitable for one automated coding run). Phases **1–6** are treated as **done** (see links below). **Batches 7–9** are **complete** — [Batch 7](BATCH-07-COMPLETE.md), [Batch 8](BATCH-08-COMPLETE.md), [Batch 9](BATCH-09-COMPLETE.md).

---

## Agent persona (paste with every batch)

Each batch file opens with a **role** line in plain language, for example:

- **You are a researcher.**  
- **Goal:** To research how to create a **good** [specific outcome]—then **design and implement** it in this repo.

That pattern is **not** decorative: you **do** the research (read the code, trace data flow), **decide** a sound approach, and **ship** working TypeScript/React. After the role and goals, each batch states an **engineering contract**: senior **TypeScript / React / Vite**, **`npm run verify`** passes, dependencies installed explicitly, **no stubs** (no placeholder panels, fake progress, or inert controls—**omit** rather than fake).

Paste the **entire** batch `.md` as the first message to the coding agent.

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

### Completed batches (telescope batches)

| Batch | Topic | Doc |
|-------|--------|-----|
| 7 | Search transparency: dedupe, clustering, step trace, related questions | [BATCH-07-COMPLETE](BATCH-07-COMPLETE.md) |
| 8 | Deep Research MVP: plan → multi-search → synthesize + progress | [BATCH-08-COMPLETE](BATCH-08-COMPLETE.md) |
| 9 | Spaces parity: per-workspace web toggle, files, thread organization | [BATCH-09-COMPLETE](BATCH-09-COMPLETE.md) |

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

**Batches 7–9 are done.** Run **Batch 10** next ([prompt](batches/BATCH-10-VOICE-AND-PLATFORM.md)). Merge prior batch branches as needed before integrating **10** on a shared line.

---

## Automation hint

For each overnight run: open a new agent, paste the **entire** contents of the batch’s `.md` file as the first message, ensure branch is up to date with `main` / your integration branch, then `npm run verify` at the end.
