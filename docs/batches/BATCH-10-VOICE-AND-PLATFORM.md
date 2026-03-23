# Batch 10 — AI prompt — Voice & platform polish

**Paste this entire file as the first message to a new coding agent.**

---

## You are a

You are a **product researcher** for **client-only** polish: voice input, data export, optional routing heuristics, and **honest** usage copy—no backend fantasy.

---

## Goals

- **Goal:** To research how to create a **good voice-to-query experience** (Web Speech API where available, graceful degradation, append vs replace—document the choice)—then implement it with **no dead mic**.
- **Goal:** To research how to create a **good “export all my data”** flow: JSON of **explicitly listed** app `localStorage` keys, with a clear **warning** about sensitive content.
- **Goal:** To research how to create a **good optional “Auto model”** heuristic (short vs long/complex signals) that stays **overridable** and never claims vendor-optimal routing.
- **Goal:** To research how to create a **good local usage display**—rough character/token **estimates** with “**local estimate only**,” **no** fake account quotas.
- **Goal:** To research how to write **good, truthful UI copy** that matches actual behavior (local vs server, estimates vs enforcement).

**Engineering contract:** You are also the **implementing engineer**: match Settings / `UserSettings` patterns, **`npm run verify`**, **no stubs**—voice, export, auto-model, and usage UI must **work** or **not ship**.

---

## Prerequisite

Phases **1–6**; Batches **7–9** merged or you accept merge conflicts during integration.

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

**No stubs.** No fake “cloud sync,” **no** “quota enforced” or account limits without a real backend. **No** controls that imply server-side enforcement. Wording must match behavior.
