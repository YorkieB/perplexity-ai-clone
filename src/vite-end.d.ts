/// <reference types="vite/client" />
import type { DetailedHTMLProps, HTMLAttributes } from 'react'

/** Electron preload (`electron/preload.cjs`) — only present in desktop shell. */
interface ElectronInAppBrowserAPI {
  readonly webviewPartition: string
  openExternal: (url: string) => Promise<boolean>
  loadExtensionFolder: (folderPath: string) => Promise<{
    ok: boolean
    name?: string
    version?: string
    error?: string
  }>
  pickExtensionFolder: () => Promise<string | null>
  onDownloadComplete: (handler: (payload: { filename: string; path: string }) => void) => () => void
}

declare global {
  interface Window {
    electronInAppBrowser?: ElectronInAppBrowserAPI
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & {
          src?: string
          partition?: string
          allowpopups?: boolean | string
          httpreferrer?: string
          useragent?: string
        },
        HTMLElement
      >
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ImportMetaEnv {
  readonly VITE_TAVILY_API_KEY?: string
  /** When true, use DigitalOcean inference with token from server `DIGITALOCEAN_API_KEY` in `.env` */
  readonly VITE_USE_DO_INFERENCE?: string
  /** When "1" / "true", show A2E creative models and Studio (API key via `A2E_API_KEY` on the dev/proxy server). */
  readonly VITE_ENABLE_A2E?: string
  /** URL opened for A2E live streaming / streaming avatar console (default: https://video.a2e.ai). */
  readonly VITE_A2E_STREAMING_URL?: string
  /**
   * Optional JSON object merged into every A2E POST JSON body (extra keys override app defaults).
   * Use only fields supported by your A2E API tier; this app does not filter A2E prompts or media.
   */
  readonly VITE_A2E_POST_BODY_EXTRA?: string
  /** Optional: full Spotify iframe embed URL — locks the player (presets ignored). */
  readonly VITE_SPOTIFY_EMBED_URL?: string
  /** Default playlist/track: `playlist/ID` or full open.spotify.com / spotify: URI. */
  readonly VITE_SPOTIFY_CONTENT?: string
  /** Presets: `Name1:playlist/id1,Name2:https://open.spotify.com/track/…` */
  readonly VITE_SPOTIFY_PRESETS?: string
  /** Optional full TuneIn embed iframe URL; if set, station switching uses this URL only. */
  readonly VITE_TUNEIN_EMBED_URL?: string
  /** TuneIn station id (e.g. s24939). Open a station on tunein.com — id is the trailing s… in the URL. */
  readonly VITE_TUNEIN_STATION_ID?: string
  /** Presets: `Name1:s111,Name2:s222` for quick station switching in the TuneIn module. */
  readonly VITE_TUNEIN_PRESETS?: string
  /** Approximate model context window in tokens (for client budgeting; default 40960). */
  readonly VITE_LLM_CONTEXT_WINDOW_TOKENS?: string
  /** Desired max completion tokens when headroom allows (default 16384). */
  readonly VITE_LLM_MAX_COMPLETION_TOKENS?: string
  /** OpenAI TTS voice for read-aloud (e.g. shimmer, coral). Default shimmer. */
  readonly VITE_TTS_VOICE?: string
  /** TTS model: default gpt-4o-mini-tts (supports accent instructions); use tts-1-hd if needed. */
  readonly VITE_TTS_MODEL?: string
  /** Overrides default British female steering prompt for gpt-4o-mini-tts; set to "-" to disable. */
  readonly VITE_TTS_INSTRUCTIONS?: string
  /** When `elevenlabs`, read-aloud uses ElevenLabs (Settings or `ELEVENLABS_*` in .env on the proxy). */
  readonly VITE_TTS_PROVIDER?: string
  /** Default ElevenLabs voice id when not saved in Settings (optional). */
  readonly VITE_ELEVENLABS_VOICE_ID?: string
  /** ElevenLabs model id (e.g. eleven_multilingual_v2). */
  readonly VITE_ELEVENLABS_MODEL_ID?: string
  /** Comma-separated chat model ids to hide and clear from preferences (unavailable on your inference provider). */
  readonly VITE_BLOCKED_CHAT_MODEL_IDS?: string
  /** Max HTTP attempts for /api/llm on 429/502/503 (default 8). Set 0 or false to disable retries. */
  readonly VITE_LLM_RATE_LIMIT_RETRIES?: string
  /** X (Twitter) profile screen name for the left-rail embedded timeline (no @). Default BBCBreaking. */
  readonly VITE_SOCIAL_X_SCREEN_NAME?: string
  /** Comma-separated Threads post URLs to embed (Meta / Instagram embed script). */
  readonly VITE_THREADS_POST_URLS?: string
  /**
   * NOW rail: JSON array of bookmarks (not from NOW). Example:
   * `[{"title":"…","meta":"S1 · E1","progress":40,"href":"https://www.nowtv.com"}]`
   */
  readonly VITE_NOWTV_BOOKMARKS?: string
  /** Override “Open NOW” URL (default https://www.nowtv.com). */
  readonly VITE_NOWTV_HOME_URL?: string
}

export {}
