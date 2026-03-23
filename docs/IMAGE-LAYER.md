# Image generation layer

Vendor-neutral types and a **stub** provider live under `src/lib/image/`. **Phase 0** does not add HTTP routes, image APIs, or new environment variables.

---

## Phase 0 — Types and `NullImageProvider`

### Module layout

| Path | Role |
|------|------|
| `src/lib/image/types.ts` | `GeneratedImage`, `ImageGenerationOptions`, `ImageGenerationStatus`, `MessageImageGenerationState` |
| `src/lib/image/provider.ts` | `ImageGenerationProvider`, `NullImageProvider`, `ImageProviderStub`, `ImageGenerationNotImplementedError` |
| `src/lib/image/index.ts` | Barrel re-exports for `@/lib/image` |

### `GeneratedImage`

- `id`, `promptSnapshot`, `width`, `height`, `mimeType`
- Optional payload (see TSDoc in source): **`url`**, **`dataUrl`**, **`base64`** — tradeoffs between **URL expiry** vs **localStorage size** for inline data.

### `ImageGenerationOptions`

- `width`, `height` (required in type)
- Optional `n`, `model`

### Async lifecycle

- **`ImageGenerationStatus`:** `'pending' | 'complete' | 'failed'`
- **`MessageImageGenerationState`:** `status`, optional `errorMessage` when failed

### `ImageGenerationProvider`

- Optional `generatePlaceholder?()` → empty array on stub
- Optional `generateImages?(prompt, options)` → **`NullImageProvider` throws `ImageGenerationNotImplementedError`**

### `Message` (`src/lib/types.ts`)

Backward-compatible optional fields:

- `generatedImages?: GeneratedImage[]`
- `imageGeneration?: MessageImageGenerationState`

Imports from `./image/types` alongside existing `./voice/types`.

### Verification

```bash
npm run verify
```

Runs **lint**, **tests** (`vitest run`), **build**, **audit** (per `package.json`).

---

## Next (not Phase 0)

- **Phase 1:** `POST /api/images` (or equivalent) proxy + one text-to-image provider; keys server-side only.
- **Phase 2:** Thread + UI wiring (`generatedImages`, loading/error states).
- **Phase 3:** UX polish (toasts, limits, rate limits).
- **Phase 4+:** Stable storage vs URL expiry; **reference images**; **photoreal** presets — see planning docs / issue tracker.
