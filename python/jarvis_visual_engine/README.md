# Jarvis Visual Engine (in-repo)

Serves `GET/POST /api/v1/context` and `POST /api/v1/analyze` on port **5000** (override with `VISION_ENGINE_PORT`). Uses **OpenCV** to open the default webcam and report live status to the Jarvis app.

## Install (same Python Electron uses)

From the repository root:

```bash
python -m pip install -e python/jarvis_visual_engine
```

Or with conda:

```bash
conda activate your-env
python -m pip install -e python/jarvis_visual_engine
```

## Run

```bash
python -m jarvis_visual_engine
```

Matches `.env`:

```env
VISION_ENGINE_URL=http://127.0.0.1:5000
JARVIS_VISION_ENGINE_COMMAND=python -m jarvis_visual_engine
```

If multiple Pythons exist, use the full path to `python.exe` in `JARVIS_VISION_ENGINE_COMMAND`.

If the wrong camera opens, set `JARVIS_VISION_CAMERA_INDEX` to `0`–`3` (OpenCV device index). eMeet is often **`2`** when other devices (integrated, IR, virtual) occupy `0` and `1`.

## API key

Clients send `X-API-Key: jarvis-vision-local` by default. Set `VISION_API_KEY` in the environment for both the engine and the Electron/Vite proxy if you change it.

## Rich scene + mood (OpenAI)

The engine uses **`OPENAI_API_KEY`** (same as the rest of Jarvis) to run a vision model on webcam frames: room description, clothing, and a conservative **emotion** object for voice `[VISUAL CONTEXT UPDATE]` lines.

- **`VISION_LLM_ENABLED`**: `1` (default) or `0` to disable and use numeric fallback only.
- **`VISION_LLM_MIN_INTERVAL_SEC`**: minimum seconds between vision API calls (default `5`) — context polling is ~3s; this avoids excessive spend.
- **`VISION_OPENAI_MODEL`**: default `gpt-4o-mini`. For fewer “generic office” mistakes, try `gpt-4o`.
- **`VISION_OPENAI_IMAGE_DETAIL`**: `low` | `high` | `auto` — default **`high`** (better grounding; more tokens).
- **`VISION_FRAME_MAX_SIDE`**: default **1280** (JPEG before API; lower if bandwidth matters).

When Electron starts the engine, it inherits `.env` from the shell (including `OPENAI_API_KEY`). If you run `python -m jarvis_visual_engine` manually, run it from the repo root or export the key.
