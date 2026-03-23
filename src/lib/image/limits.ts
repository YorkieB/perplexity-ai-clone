/** Minimum ms between image generation attempts after a failure or success (client guardrail). */
export const IMAGE_GENERATION_COOLDOWN_MS = 8_000

/** Max prompt length sent to the proxy (characters). */
export const IMAGE_MAX_PROMPT_LENGTH = 4_000

/** Max decoded bytes per reference image (OpenAI edits limit is ~4MB; stay under). */
export const IMAGE_MAX_REFERENCE_BYTES = 3_500_000

/** Max reference images per request. */
export const IMAGE_MAX_REFERENCES = 3
