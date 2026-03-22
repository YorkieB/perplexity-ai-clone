# Batch 10 — AI prompt — Voice & platform polish

**Paste this entire file as the first message to a new coding agent.**

---

## Prerequisite

Phases **1–6**; Batches **7–9** merged or you accept merge conflicts during integration.

---

## Goal

Address remaining **Chat/LLM** and **Platform** items that fit a **client-only** app: **voice input** for the query box, **export all local data** (privacy), **best-model heuristic** (optional, honest), and **model quota / usage display** as **local estimates** only (no billing API).

---

## Deliverables

1. **Voice input** — Use **Web Speech API** (`SpeechRecognition`) where available; **graceful fallback** (hide mic or show “not supported”) with **feature detection**. Wire to **QueryInput** textarea: transcript **appends** or replaces draft per UX choice (document). **HTTPS/localhost** requirements noted in code comment.

2. **Export all data** — New Settings action: download **JSON** export of all **`localStorage` keys** this app owns (`threads`, `workspaces`, `user-settings`, etc. — **list explicitly** in code). **No** secrets in export beyond what user already stored; warn in dialog.

3. **Best model (light heuristic)** — Optional toggle “Auto model”: e.g. route short queries to **mini**, long/complex to **larger** model using **simple heuristics** (length, attachment presence) — **document rules** in code; user can **override** in UI; **no** claim of “optimal” vs OpenAI.

4. **Usage / quotas (local)** — Display **approximate** token or character counts **client-side** from recent messages (rough estimate ok) with disclaimer “**local estimate only**”; **no** server quota without backend.

---

## Out of scope

- Billing, accounts, server analytics, Comet, Labs, push beyond Batch 6.

---

## Verification

```bash
npm install && npm run verify
```

**Manual:** Mic in supported browser; export JSON opens and parses; auto-model if shipped behaves predictably; estimates don’t crash.

---

## Governance

No fake “cloud sync” or “quota enforced” without a server. Wording must be honest.
