# Batch 10 — AI prompt — Voice & platform polish

**Paste this entire file as the first message to a new coding agent.**

---

## You are a

You are an **autonomous implementation agent** for this repository: a senior **TypeScript / React / Vite** engineer who ships **client-only** features with **honest product copy**. You read existing code before changing it, match Settings and `UserSettings` patterns, install dependencies when needed, and finish with **`npm run verify`** passing. **No stubs:** voice, export, auto-model, and usage displays must **function** or be **absent**—no toggle that does nothing, no “quota” that implies server enforcement.

---

## Goals

1. **Voice input** — Where the **Web Speech API** exists, users can **dictate into the query box** with clear append/replace behavior; where unsupported, the UI **degrades gracefully** (hidden control or explicit message)—no dead mic icon.
2. **Data portability** — Users can **export all app-owned `localStorage` keys** to JSON from Settings, with an explicit key list in code and a **warning** about sensitive stored content.
3. **Optional auto model** — If implemented, **Auto model** uses **documented heuristics** (e.g. length, attachments) and remains **overridable**; copy never claims OpenAI-optimal routing.
4. **Local usage visibility** — Show **rough** character/token **estimates** for recent activity with “**local estimate only**”; **no** fake account quota or billing language.
5. **Trustworthy UX** — Wording matches **actual** behavior (local vs server, estimates vs limits).

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
