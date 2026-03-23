# Roadmap — remaining work in overnight batches

This splits **everything left** vs `docs/PERPLEXITY-TELESCOPE-ANALYSIS.md` into **four large batches** (each suitable for one automated coding run). Phases **1–6** are treated as **done** (see links below). **Batches 7–10** are **complete** — [Batch 7](BATCH-07-COMPLETE.md), [Batch 8](BATCH-08-COMPLETE.md), [Batch 9](BATCH-09-COMPLETE.md), [Batch 10](BATCH-10-COMPLETE.md). Batch prompt files under [batches/](batches/) remain as **historical copy-paste** references.

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
| 10 | Voice input, export-all-data, auto model heuristic, local usage estimates | [BATCH-10-COMPLETE](BATCH-10-COMPLETE.md) |

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

**All listed batches (7–10) are implemented** (see completion docs above). For **new** overnight automation, define the next slice in a new doc or issue; the prompts in [batches/](batches/) stay available as templates.

---

## Automation hint (historical)

For a batch run: paste the **entire** batch `.md` as the first agent message, sync with `main` / your integration branch, then `npm run verify` at the end.
