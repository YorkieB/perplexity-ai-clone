# Image generation layer

Vendor-neutral types and a **stub** provider live under `src/lib/image/`. Phases **0–8** are implemented: secure proxy, thread/UI wiring, UX guardrails, inline persistence tradeoffs, reference edits, photoreal prompts, error mapping, tests, and documentation.

---

## Phase 0 — Types and `NullImageProvider`

| Path | Role |
|------|------|
| `src/lib/image/types.ts` | `GeneratedImage`, `ImageGenerationOptions`, `ImageGenerationStatus`, `MessageImageGenerationState` |
| `src/lib/image/provider.ts` | `ImageGenerationProvider`, `NullImageProvider`, `ImageProviderStub`, `ImageGenerationNotImplementedError` |
| `src/lib/image/index.ts` | Barrel re-exports for `@/lib/image` |

`Message` (`src/lib/types.ts`) includes optional `generatedImages` and `imageGeneration` (see TSDoc in `types.ts` for URL expiry vs `localStorage` size).

---

## Phase 1 — `POST /api/images` proxy + client

- **`vite-plugins/openai-proxy.ts`:** `POST /api/images` reads JSON (`mode`, `prompt`, `size`, `quality`, `photoreal`, `references`, `referenceRightsConfirmed`), calls OpenAI **`images/generations`** (`dall-e-3`, `b64_json`) or **`images/edits`** (`dall-e-2`, multipart `FormData` + PNG reference).
- **`src/lib/image/generateImages.ts`:** `generateImagesViaApi()` → same-origin `fetch('/api/images', …)`; normalizes responses to `GeneratedImage[]` (adds `dataUrl` when `base64` + `mimeType` present).
- **`src/lib/image/apiTypes.ts`:** `ImageProxyRequest`, `ImageProxyResponse`, `ImageGenerationPayload` (UI → `handleImageGenerate`).

API keys stay in `.env` / server env only (`OPENAI_API_KEY`); never `VITE_*` for secrets.

---

## Phase 2 — Threads + UI wiring

- **`src/App.tsx`:** `handleImageGenerate` appends user + assistant messages, sets `imageGeneration: pending`, calls `generateImagesViaApi`, then updates messages with `generatedImages` + `complete` or `failed`.
- **`src/components/QueryInput.tsx`:** Image mode toggle, photoreal, edit mode + PNG reference file input, rights checkbox; submits `ImageGenerationPayload` via `onImageGenerate`.
- **`src/components/Message.tsx`:** Image modality chip, pending pulse, `role="alert"` on failure, grid of generated images (`dataUrl` / `url` / `base64`); avoids duplicate body text while pending/failed for image generation.

---

## Phase 3 — UX polish (toasts, limits, cooldown)

- **`src/lib/image/limits.ts`:** Prompt length, max references, max reference bytes, **`IMAGE_GENERATION_COOLDOWN_MS`** after failures.
- **`src/lib/image/uxCopy.ts`:** `toastBodyForImageError`, `imageCopy` strings.
- **`src/App.tsx`:** Sonner toasts on failure; `clearImageGenerationCooldown()` before mapping errors so retries are not blocked incorrectly.

---

## Phase 4 — Stable storage vs URL expiry

- Proxy returns **`b64_json`** for generations so the client can build **`dataUrl`** and persist in **`localStorage`** with threads (URLs from providers may expire; inline base64 is larger but survives refresh—see TSDoc on `GeneratedImage`).

---

## Phase 5 — Reference images (edits)

- Client sends **`references: [{ base64, mimeType }]`** (PNG). Server validates size/type, requires **`referenceRightsConfirmed`** for edits.
- OpenAI **`images/edits`** with `multipart/form-data` (`image`, `prompt`, `model`, `n`, `size`).

---

## Phase 6 — Photoreal quality

- **`photoreal`** appends a server-side suffix (see `IMAGE_PHOTOREAL_SUFFIX` in `openai-proxy.ts`) for skin/hair/detail wording; client **`PHOTOREAL_PROMPT_SUFFIX`** in `promptTemplates.ts` documents alignment.
- Generations use DALL-E 3 **`quality`**: `hd` when photoreal, else `standard`.

---

## Phase 7 — Errors and moderation mapping

- **`src/lib/image/errors.ts`:** `ImageGenerationError` + codes (`RATE_LIMITED`, `MODERATION_BLOCKED`, `REFERENCE_REQUIRED`, `RIGHTS_NOT_CONFIRMED`, etc.).
- **`generateImagesViaApi`:** Maps HTTP status and error message substrings to codes; does not log raw bodies.

---

## Phase 8 — Tests and docs

- **Tests:** `tests/image/generateImages.test.ts`, `tests/image/uxCopy.test.ts`, `tests/components/Message.image.test.tsx`.
- **This doc** and **`README.md`** link (Documentation section).

### Verification

```bash
npm run verify
```

Runs **lint**, **tests** (`vitest run`), **build**, **audit** (per `package.json`).

### Production note

The Vite middleware runs in **dev** and **`vite preview`**. A static production host still needs a backend route equivalent to `POST /api/images` with the same contract.
