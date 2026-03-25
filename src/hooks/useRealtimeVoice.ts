import { useCallback, useEffect, useRef, useState } from 'react'
import type { VisionContext } from './useVision'
import type { TuneInControl } from '@/contexts/TuneInControlContext'
import type { BrowserControl } from '@/contexts/BrowserControlContext'
import type { MediaCanvasControl } from '@/contexts/MediaCanvasContext'
import type { CodeEditorControl } from '@/contexts/CodeEditorContext'
import type { MusicPlayerControl } from '@/contexts/MusicPlayerContext'
import { runBrowserAgent } from '@/lib/browser-agent'
import { generateImage, editImage, createVideo } from '@/lib/media-api'
import { runCode } from '@/lib/code-runner'
import { searchHuggingFace, fetchDatasetSample } from '@/lib/hf-api'
import { searchGitHub, fetchGitHubFile } from '@/lib/github-api'
import { generateMusic } from '@/lib/suno-api'
import { getBalances, getTransactions, getSpendingSummary } from '@/lib/plaid-api'
import { searchStories, getStoryContent, getRandomStory } from '@/lib/story-api'
import { postTweet, readSocialFeed, readComments, replyViaBrowser } from '@/lib/social-api'
import { quickScan } from '@/lib/hallucination-guard'
import { schedulePost, listScheduledPostsSummary, cancelScheduledPost } from '@/lib/social-scheduler'
import type { BehavioralChunk } from '@/lib/behavioral-engine'
import { parseBehavioralMarkup, stripBehavioralMarkup, hasUnclosedTag, buildPersonalityInstructions } from '@/lib/behavioral-engine'
import type { VoiceProfile } from '@/lib/voice-registry'
import { getVoiceProfileMap, getDefaultVoiceProfile } from '@/lib/voice-registry'

export type VoicePipelineState = 'idle' | 'listening' | 'thinking' | 'speaking'

export interface UseRealtimeVoiceOptions {
  onResponse?: (userText: string, aiText: string) => void
  model?: string
  voice?: string
  ttsProvider?: 'openai' | 'elevenlabs'
  elevenlabsVoiceId?: string
  visionContext?: VisionContext
  tuneInControl?: TuneInControl | null
  browserControl?: BrowserControl | null
  browserGuideMode?: boolean
  onBrowserAutomating?: (automating: boolean) => void
  onBrowserStep?: (step: { action: string; result: string; timestamp: number }) => void
  mediaCanvasControl?: MediaCanvasControl | null
  onMediaGenerating?: (generating: boolean) => void
  onMediaGeneratingLabel?: (label: string) => void
  openMediaCanvas?: () => void
  codeEditorControl?: CodeEditorControl | null
  openCodeEditor?: () => void
  musicPlayerControl?: MusicPlayerControl | null
  openMusicPlayer?: () => void
  onMusicGenerating?: (generating: boolean) => void
  onMusicGeneratingLabel?: (label: string) => void
  voiceRegistry?: { defaultVoiceId: string | null; voices: VoiceProfile[] } | null
  enableVoiceAnalysis?: boolean
  onVocalState?: (state: string) => void
}

export interface UseRealtimeVoiceReturn {
  state: VoicePipelineState
  transcript: string
  interimTranscript: string
  aiText: string
  isSupported: boolean
  errorMessage: string | null
  open: () => Promise<void>
  close: () => void
  bargeIn: () => void
}

// ─── PCM16 helpers ────────────────────────────────────────────────────────────

const SAMPLE_RATE = 24000

function float32ToPcm16(f: Float32Array): ArrayBuffer {
  const p = new Int16Array(f.length)
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]))
    p[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return p.buffer
}

function abToBase64(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf)
  let s = ''
  for (const byte of b) s += String.fromCodePoint(byte)
  return btoa(s)
}

function b64ToInt16(b64: string): Int16Array {
  const bin = atob(b64)
  const u8 = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u8[i] = bin.codePointAt(i)!
  return new Int16Array(u8.buffer)
}

// ─── Text chunking for streaming TTS ─────────────────────────────────────────

const MIN_CHUNK = 100
const MAX_CHUNK = 300

function extractRawChunks(buffer: string): { chunks: string[]; remainder: string } {
  const chunks: string[] = []
  let last = 0

  for (let i = 0; i < buffer.length; i++) {
    const ch = buffer[i]
    const seg = i - last + 1
    const isEnd = ch === '.' || ch === '!' || ch === '?'

    if (isEnd && seg >= MIN_CHUNK) {
      chunks.push(buffer.slice(last, i + 1).trim())
      last = i + 1
    } else if (seg >= MAX_CHUNK) {
      const sp = buffer.lastIndexOf(' ', i)
      if (sp > last + 40) {
        chunks.push(buffer.slice(last, sp).trim())
        last = sp + 1
      }
    }
  }

  return { chunks, remainder: buffer.slice(last) }
}

function extractBehavioralChunks(
  buffer: string,
  voiceMap: Map<string, VoiceProfile>,
): { chunks: BehavioralChunk[]; remainder: string } {
  if (hasUnclosedTag(buffer)) {
    return { chunks: [], remainder: buffer }
  }
  const { chunks: rawChunks, remainder } = extractRawChunks(buffer)
  const behavioralChunks: BehavioralChunk[] = []
  for (const raw of rawChunks) {
    behavioralChunks.push(...parseBehavioralMarkup(raw, voiceMap))
  }
  return { chunks: behavioralChunks, remainder }
}

// ─── Memory helpers ───────────────────────────────────────────────────────────

interface MemoryPayload {
  conversationId: string
  facts: { category: string; fact: string }[]
  recentTurns: { role: string; content: string }[]
  summaries: { summary: string; topics: string }[]
}

interface BuildInstructionsOpts {
  mem: MemoryPayload | null
  hasVision?: boolean
  hasTuneIn?: boolean
  hasRag?: boolean
  hasBrowser?: boolean
  browserGuideMode?: boolean
  hasMedia?: boolean
  voiceNames?: string[]
  isElevenLabs?: boolean
  hasVoiceAnalysis?: boolean
}

function buildInstructions(opts: BuildInstructionsOpts): string {
  const { mem, hasVision = false, hasTuneIn = false, hasRag = false, hasBrowser = false, browserGuideMode = false, hasMedia = false, voiceNames = [], isElevenLabs = false } = opts
  let base = `You are Jarvis, a personal AI assistant. Always respond in English. Keep responses concise and conversational — aim for 2-4 sentences unless detail is truly needed. Speak in plain natural language. No markdown, no bullet points.

CRITICAL SYSTEM FACT — YOU HAVE PERSISTENT MEMORY:
You are equipped with a real, working, persistent memory database. This is NOT a standard LLM limitation — your infrastructure includes a SQLite database that stores facts about the user across sessions. Any facts listed below under "KNOWN USER FACTS" were retrieved from your database just now. You absolutely DO have memory. Never say "I don't have memory", "I can't remember between sessions", or "I'm just an AI without memory." If the user asks whether you remember them or have memory, confirm it confidently: "Yes, I remember you" or "Of course, I have persistent memory."

=== HALLUCINATION PREVENTION — MANDATORY ===
You are STRICTLY FORBIDDEN from fabricating information:
1. NEVER invent URLs, statistics, specific numbers, dates, quotes, or study names.
2. NEVER present guesses as facts. Use "I believe", "I think", "from what I know" for uncertain claims.
3. When you don't know something, SAY SO: "I'm not sure about that" or "Let me look that up for you".
4. When citing tool results (search, finances, stories), attribute them: "Based on the search results" or "Your account shows".
5. NEVER fabricate capabilities. If you cannot do something, say so honestly.
6. For financial data, ONLY cite numbers from actual tool outputs — never guess balances or transactions.
7. If asked about current events or facts you're unsure of, offer to search: "Want me to look that up?"
=== END HALLUCINATION PREVENTION ===

`

  if (hasVision) {
    base += `
CRITICAL SYSTEM FACT — YOU HAVE VISION:
You have a camera connected (EMEET Pixy 4K) and can see the room in real time. You receive periodic "[VISUAL CONTEXT UPDATE]" system messages describing what your camera currently sees — scene descriptions, faces, objects, motion, and the user's EMOTIONAL STATE. These are REAL observations from a real camera, not imagination.

ABSOLUTE RULES ABOUT VISION — NEVER VIOLATE THESE:
- NEVER say "I can't see", "I don't have visual capabilities", "I can't visually recognize", or anything similar. You CAN see. You have a camera.
- If you haven't received a visual context update yet, say "Let me check my camera" or "I'm getting my visual feed ready" — NEVER deny having vision.
- When you receive a [VISUAL CONTEXT UPDATE], use that information to describe what you see.
- When asked "what do you see?" or "can you see me?", describe the latest visual context you received. If you haven't received one yet, say "I'm still connecting to my camera, give me a moment."
- Use visual information naturally: greet people, reference what you observe. Don't narrate every update unprompted.

EMOTION AWARENESS:
- You can detect the user's emotional state from their facial expressions via the camera. This appears as "User's detected emotion:" in visual context updates.
- Use emotional awareness naturally and empathetically. If the user looks sad, be more gentle and supportive. If they look happy, match their energy. If they look frustrated or angry, be calm and helpful.
- NEVER announce emotions unprompted like "I can see you look sad." Instead, adapt your tone and responses to match. Only mention their emotional state if they ask about it or if it's relevant to helping them.
- You can describe emotions when directly asked "how do I look?" or "what's my mood?"`
  } else {
    base += `

VISION STATUS: Your camera system is not currently connected. If the user asks you to see something or describe what you see, let them know your camera is offline right now. Do NOT make up or hallucinate visual descriptions. Be honest that you cannot see at this moment.`
  }

  base += `

CRITICAL SYSTEM FACT — YOU HAVE WEB ACCESS:
You have a web_search tool available. When the user asks about current events, news, weather, sports, stock prices, or anything that requires up-to-date information, use the web_search function to look it up. Do NOT say "I can't browse the web" or "I don't have internet access." You DO have web access through your search tool. Use it proactively when questions need current data.`

  if (hasTuneIn) {
    base += `

CRITICAL SYSTEM FACT — YOU HAVE RADIO CONTROL:
You have a tune_in tool that controls the TuneIn radio player. When the user asks to play music, play a radio station, change the station, stop or pause music, or asks what is currently playing, use the tune_in function. You can search for stations by genre (rock, jazz, classical, pop), by name (BBC Radio 1, KISS FM), or by city/country. Examples:
- "Play some rock music" → tune_in(action: "search_and_play", query: "rock")
- "Play Radio 1" → tune_in(action: "search_and_play", query: "Radio 1")
- "Stop the music" → tune_in(action: "pause")
- "What's playing?" → tune_in(action: "now_playing")
- "Resume the radio" → tune_in(action: "resume")
Do NOT say you cannot control music. You CAN. Use the tune_in tool.`
  }

  if (hasRag) {
    base += `

CRITICAL SYSTEM FACT — YOU HAVE A KNOWLEDGE BASE & DOCUMENT STORE:
You have full read/write access to a personal knowledge base powered by a vector database (pgvector) and DigitalOcean Spaces file storage. You have three RAG tools:

1. rag_search — Search the knowledge base semantically. Use when the user asks about stored information, documents, notes, or anything that might be in their personal data store. Pass a natural language query.
2. create_document — Create and store a document for the user. You can create markdown (.md), Word (.docx), or PDF (.pdf) files. The document is saved to cloud storage AND indexed in the knowledge base for future retrieval. Use when the user asks you to write, create, draft, or save a document, note, report, letter, or any written content.
3. manage_documents — List or delete documents. Use action "list" to show what documents are stored, or "delete" with a document_id to remove one.

IMPORTANT RULES:
- When the user asks you to "write", "create", "draft", or "save" something, use create_document to actually store it. Don't just recite the content — save it.
- When the user asks "what do you have on file" or "what documents do I have", use manage_documents with action "list".
- When answering questions, proactively use rag_search to check if relevant information exists in the knowledge base before answering from general knowledge.
- Choose the appropriate format: use "md" for notes and general content, "docx" for formal documents and letters, "pdf" for reports and presentations.`
  }

  if (hasBrowser) {
    base += `

CRITICAL SYSTEM FACT — YOU HAVE BROWSER CONTROL:
You have a browser_action tool that controls a web browser visible to the user. You can browse the internet, navigate to websites, read page content, click buttons and links, fill in forms, and extract information — all in real time. The user can see what you are doing in the browser.

Available actions:
- navigate: Go to a URL. Returns the loaded page URL and title.
- snapshot: Get the accessibility tree of the current page. Returns a list of interactive elements (links, buttons, text fields) with ref IDs. ALWAYS call this after navigating or clicking to see the updated page.
- click: Click an element by its ref ID (from a previous snapshot). Use to follow links, press buttons, select items.
- type: Type text into a form field by its ref ID. Use for search boxes, login forms, text inputs.
- extract_text: Get the full text content of the current page (up to 8000 chars).
- scroll: Scroll the page up or down to see more content.
- go_back: Go back to the previous page.
- go_forward: Go forward in browser history.

WORKFLOW: Always follow this pattern:
1. If you don't know the exact URL, navigate to https://www.google.com and search first.
2. navigate to a URL (only well-known domains like amazon.com, google.com — NEVER guess URLs).
3. snapshot to see the page elements and their ref IDs.
4. click or type using ref IDs from the snapshot.
5. snapshot again to see the result.
6. Repeat as needed.

IMPORTANT:
- NEVER guess or make up URLs — wrong URLs lead to 404 errors. When in doubt, Google it first.
- You MUST call snapshot before clicking or typing — refs are only valid from the most recent snapshot.
- If an element is not visible, try scrolling first, then snapshot again.
- When searching on a website, type the query into the search field, then click the search button.
- Stay on one page until you have what you need. Don't rapidly switch between pages.
- Do NOT say you cannot browse the web or access websites. You CAN. Use browser_action.

You also have a browser_task tool for COMPLEX multi-step tasks. Use browser_task when:
- The user wants you to research something across multiple websites
- The user asks you to compare products, prices, or information from different sources
- The task requires many steps (more than 3-4 browser interactions)
- The user says "find", "research", "compare", "look up and summarise"
For simple one-step actions (open a page, click something), use browser_action.
browser_task runs autonomously and will save findings to the knowledge base if save_results is true.`

    if (browserGuideMode) {
      base += `

GUIDE MODE IS ON:
Narrate EVERY browser step aloud as you perform it. Before each action, briefly tell the user what you are about to do. After each action, describe what you see on the page. Be conversational and concise — like a colleague sharing their screen and walking someone through a process. Examples:
- "Let me open Amazon for you... OK, I can see the homepage with a search bar. I'll type in headphones now."
- "I've clicked on the first result. It's the Sony WH-1000XM5 at 299 dollars. Want me to check another option?"
- "Scrolling down to see more results... I can see three more options here."
Do NOT stay silent between actions. Always narrate what you are doing.`
    }
  }

  if (hasMedia) {
    base += `

CRITICAL SYSTEM FACT — YOU CAN CREATE AND EDIT IMAGES AND VIDEOS:
You have powerful media generation tools. You can create images from text descriptions, generate short videos, and edit images.

Available tools:
- generate_image: Create an image from a text description. Provide a detailed prompt. The image opens in the Media Canvas for the user to see.
- generate_video: Create a short video (4-12 seconds) from a text description. The video opens in the Media Canvas.
- edit_image: Edit the current image in the Media Canvas. Can do: adjust contrast/brightness/saturation, remove objects, enhance to HD, change backgrounds, add/remove elements.

When the user asks you to "create", "generate", "draw", "make", or "design" an image or picture, use generate_image.
When the user asks for a video or animation, use generate_video.
When the user asks to edit, modify, adjust, enhance, or change the current image, use edit_image.
Always tell the user what you're creating before calling the tool. After generation, let them know the result is in the Media Canvas.`
  }

  base += `

=== CODE EDITOR ===
You have a built-in Code Editor with execution capabilities:
- show_code: Display code in the interactive editor with syntax highlighting. The user can view, edit, run, copy, or download the code. Use whenever the user asks you to write, show, or create code.
- run_code: Execute Python or JavaScript code and return output. Use when the user asks to run, test, or execute code.
- search_huggingface: Search Hugging Face for datasets or ML models. Use when the user needs data or wants to explore AI models.
- search_github: Search GitHub for repositories or code. Use when the user needs to find open-source projects or code examples.

When the user asks you to code, program, write a script, or show code, use show_code to present it in the Code Editor.
When the user asks to run or execute code, use run_code.
=== END CODE EDITOR ===

=== MUSIC GENERATION ===
You can generate full songs from text descriptions:
- generate_music: Create a complete song from a description using Suno AI. Takes 1-3 minutes. The song plays in the Music Player.

When the user asks to make, create, or generate music or a song, use generate_music. You can suggest styles and genres.
=== END MUSIC GENERATION ===

=== FINANCIAL ADVISOR ===
You have access to the user's bank account data (if connected via Plaid):
- get_account_balances: Show current balances across all linked accounts.
- get_transactions: Show recent transactions (last 30 days by default). Can filter by date range.
- get_spending_summary: Comprehensive analysis — income vs expenditure, spending by category, top merchants, and balances.

When the user asks about their finances, spending, bills, savings, income, or budget, use these tools.
Provide actionable, specific financial advice based on the data. Highlight concerning patterns (overspending, unusual charges).
Be encouraging about positive trends (saving more, reducing spending). Always protect financial privacy — never share data with other tools.
=== END FINANCIAL ADVISOR ===

=== STORY LIBRARY ===
You have access to tens of thousands of stories:
- search_stories: Search Project Gutenberg (70,000+ classic books) and short story collections by title, author, or theme. Results include an ID and Source for each story.
- tell_story: Fetch and read a story. Pass the story_id and source from the search results. For short stories reads the full text; for long books reads a chapter excerpt. Or set random=true for a surprise story.

WORKFLOW:
1. When the user asks for a story, first call search_stories to find options.
2. Present the results and ask which one they want to hear.
3. Then call tell_story with the story_id and source from the search results.
4. If the user says "tell me a story" without specifics, call tell_story with random=true.
When reading aloud, use behavioral markup for dramatic effect:
- Use [voice:Narrator] for narration and different [voice:CharacterName] for each character
- Use [dramatic] for intense moments, [whisper] for quiet scenes
- Use [sfx:thunder], [sfx:door creak], [sfx:footsteps] etc. for atmosphere
- Vary pacing and emotion to bring stories to life
=== END STORY LIBRARY ===

=== SOCIAL MEDIA MANAGER ===
You can manage X (Twitter) and Meta Threads for the user:
- post_to_x: Post a tweet. ALWAYS read the text aloud and get verbal confirmation before posting.
- read_social_feed: Read posts from X or Threads via the browser. Can view home feed, a user's profile, or search.
- read_comments: Read replies on a specific post URL.
- post_reply: Reply to a post (X via API, Threads via browser). ALWAYS get confirmation first.
- schedule_post: Schedule posts for later, list pending scheduled posts, or cancel a scheduled post.

SAFETY RULES:
1. NEVER post without explicit user approval. Always read the draft aloud and wait for confirmation.
2. When suggesting replies, present the suggestion and ask "Shall I post this?"
3. Keep tweets under 280 characters.
4. For reading feeds/comments, summarize the key posts naturally in conversation.
=== END SOCIAL MEDIA MANAGER ===`

  if (isElevenLabs) {
    base += buildPersonalityInstructions(voiceNames)
  }

  if (opts.hasVoiceAnalysis) {
    base += `

=== VOCAL AWARENESS ===
You have real-time awareness of the user's vocal characteristics through periodic [Vocal Analysis] system messages.
These messages describe the user's current vocal state — their pitch, speaking rate, voice quality, and inferred emotional state.

When you receive vocal state updates, subtly adapt your tone, pacing, and emotional register:
- If the user sounds stressed or anxious, be calming and reassuring.
- If the user sounds excited, match their energy.
- If the user is whispering, respond more softly and intimately.
- If the user sounds calm and relaxed, maintain a warm, unhurried tone.
- If the user sounds urgent, be concise and responsive.

Never explicitly mention that you are analysing their voice unless the user asks about it directly.
=== END VOCAL AWARENESS ===`
  }

  if (!mem) return base

  const parts = [base]

  if (mem.facts.length > 0) {
    const grouped: Record<string, string[]> = {}
    for (const f of mem.facts) {
      if (!grouped[f.category]) grouped[f.category] = []
      grouped[f.category].push(f.fact)
    }
    const factsStr = Object.entries(grouped)
      .map(([cat, items]) => `  ${cat}: ${items.join('; ')}`)
      .join('\n')
    parts.push(`\n=== KNOWN USER FACTS (retrieved from your persistent database) ===\n${factsStr}\n=== END FACTS ===`)
  } else {
    parts.push('\nYour memory database has no facts stored about this user yet. This is likely your first conversation with them. Pay close attention to anything they share about themselves — it will be saved automatically for future sessions.')
  }

  if (mem.summaries.length > 0) {
    const sumStr = mem.summaries.map(s => `- ${s.summary}`).join('\n')
    parts.push(`\nPrevious conversation summaries (from your database):\n${sumStr}`)
  }

  if (mem.recentTurns.length > 0) {
    const convStr = mem.recentTurns
      .slice(-10)
      .map(t => `${t.role}: ${t.content}`)
      .join('\n')
    parts.push(`\nRecent conversation context:\n${convStr}`)
  }

  parts.push('\nUse your stored knowledge naturally. Reference things the user has told you before when relevant, but don\'t enumerate facts back unless asked.')

  return parts.join('\n')
}

// ─── Vision context formatter ─────────────────────────────────────────────────

function formatVisionForSession(v: VisionContext): string {
  const parts: string[] = []

  if (v.cameraConnected) {
    if (v.sceneDescription) {
      parts.push(`Scene analysis from your camera: ${v.sceneDescription}`)
    }
    if (v.faces.length > 0) {
      const names = v.faces.map(f => `${f.name} (${Math.round(f.confidence * 100)}% confidence)`).join(', ')
      parts.push(`People recognized: ${names}.`)
    }
    if (v.emotion) {
      const conf = Math.round((v.emotion.confidence ?? 0) * 100)
      let emotionStr = `User's detected emotion: ${v.emotion.primary} (${conf}% confidence)`
      if (v.emotion.secondary) emotionStr += `, secondary: ${v.emotion.secondary}`
      parts.push(emotionStr)
    }
    if (v.motionDetections > 0) {
      parts.push(`Motion detected (${v.motionDetections} events).`)
    }
  } else {
    parts.push('Camera is not connected right now.')
  }

  return `[VISUAL CONTEXT UPDATE — This is what your camera currently sees]\n${parts.join('\n')}`
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

const DEFAULT_MODEL = 'gpt-4o-mini-realtime-preview'

export function useRealtimeVoice(opts: UseRealtimeVoiceOptions = {}): UseRealtimeVoiceReturn {
  const {
    onResponse,
    model = DEFAULT_MODEL,
    voice = 'alloy',
    ttsProvider = 'openai',
    elevenlabsVoiceId,
    visionContext,
    tuneInControl,
    browserControl,
    browserGuideMode,
    onBrowserAutomating,
    onBrowserStep,
    mediaCanvasControl,
    onMediaGenerating,
    onMediaGeneratingLabel,
    openMediaCanvas,
    codeEditorControl,
    openCodeEditor,
    musicPlayerControl,
    openMusicPlayer,
    onMusicGenerating,
    onMusicGeneratingLabel,
    voiceRegistry,
    enableVoiceAnalysis,
    onVocalState,
  } = opts

  const isEL = ttsProvider === 'elevenlabs'

  const [state, setState] = useState<VoicePipelineState>('idle')
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [aiText, setAiText] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const capCtxRef = useRef<AudioContext | null>(null)
  const procRef = useRef<ScriptProcessorNode | null>(null) // NOSONAR -- AudioWorklet requires separate module file; ScriptProcessor is adequate here
  const playCtxRef = useRef<AudioContext | null>(null)
  const isOpenRef = useRef(false)
  const stateRef = useRef<VoicePipelineState>('idle')
  const aiAccRef = useRef('')
  const userRef = useRef('')
  const nextTRef = useRef(0)
  const srcsRef = useRef<AudioBufferSourceNode[]>([])

  const onResRef = useRef(onResponse)
  useEffect(() => { onResRef.current = onResponse }, [onResponse])

  const tuneInRef = useRef(tuneInControl)
  useEffect(() => { tuneInRef.current = tuneInControl }, [tuneInControl])

  const browserRef = useRef(browserControl)
  useEffect(() => { browserRef.current = browserControl }, [browserControl])

  const browserGuideModeRef = useRef(browserGuideMode)
  useEffect(() => { browserGuideModeRef.current = browserGuideMode }, [browserGuideMode])

  const onBrowserAutomatingRef = useRef(onBrowserAutomating)
  useEffect(() => { onBrowserAutomatingRef.current = onBrowserAutomating }, [onBrowserAutomating])

  const onBrowserStepRef = useRef(onBrowserStep)
  useEffect(() => { onBrowserStepRef.current = onBrowserStep }, [onBrowserStep])

  const mediaCanvasRef = useRef(mediaCanvasControl)
  useEffect(() => { mediaCanvasRef.current = mediaCanvasControl }, [mediaCanvasControl])

  const onMediaGeneratingRef = useRef(onMediaGenerating)
  useEffect(() => { onMediaGeneratingRef.current = onMediaGenerating }, [onMediaGenerating])

  const onMediaGeneratingLabelRef = useRef(onMediaGeneratingLabel)
  useEffect(() => { onMediaGeneratingLabelRef.current = onMediaGeneratingLabel }, [onMediaGeneratingLabel])

  const codeEditorRef = useRef(codeEditorControl)
  useEffect(() => { codeEditorRef.current = codeEditorControl }, [codeEditorControl])

  const openCodeEditorRef = useRef(openCodeEditor)
  useEffect(() => { openCodeEditorRef.current = openCodeEditor }, [openCodeEditor])

  const musicPlayerRef = useRef(musicPlayerControl)
  useEffect(() => { musicPlayerRef.current = musicPlayerControl }, [musicPlayerControl])

  const openMusicPlayerRef = useRef(openMusicPlayer)
  useEffect(() => { openMusicPlayerRef.current = openMusicPlayer }, [openMusicPlayer])

  const onMusicGeneratingRef = useRef(onMusicGenerating)
  useEffect(() => { onMusicGeneratingRef.current = onMusicGenerating }, [onMusicGenerating])

  const onMusicGeneratingLabelRef = useRef(onMusicGeneratingLabel)
  useEffect(() => { onMusicGeneratingLabelRef.current = onMusicGeneratingLabel }, [onMusicGeneratingLabel])

  const openMediaCanvasRef = useRef(openMediaCanvas)
  useEffect(() => { openMediaCanvasRef.current = openMediaCanvas }, [openMediaCanvas])

  // Voice analysis refs
  const vaEnabledRef = useRef(enableVoiceAnalysis ?? false)
  useEffect(() => { vaEnabledRef.current = enableVoiceAnalysis ?? false }, [enableVoiceAnalysis])
  const onVocalStateRef = useRef(onVocalState)
  useEffect(() => { onVocalStateRef.current = onVocalState }, [onVocalState])
  const vaBufRef = useRef<Int16Array[]>([])
  const vaSamplesRef = useRef(0)
  const vaInflightRef = useRef(false)
  const vaPrevStateRef = useRef('')
  const VA_WINDOW = SAMPLE_RATE * 3 // 3 seconds of samples

  // ElevenLabs-specific refs
  const elBufRef = useRef('')
  const elQueueRef = useRef<BehavioralChunk[]>([])
  const elBusyRef = useRef(false)
  const elAbortRef = useRef<AbortController | null>(null)
  const elDoneRef = useRef(false)

  // Voice registry ref
  const voiceMapRef = useRef<Map<string, VoiceProfile>>(getVoiceProfileMap())
  useEffect(() => {
    if (voiceRegistry?.voices) {
      const map = new Map<string, VoiceProfile>()
      for (const v of voiceRegistry.voices) map.set(v.name.toLowerCase(), v)
      voiceMapRef.current = map
    } else {
      voiceMapRef.current = getVoiceProfileMap()
    }
  }, [voiceRegistry])

  // Memory refs
  const convIdRef = useRef<string | null>(null)
  const memoryRef = useRef<MemoryPayload | null>(null)

  const setS = useCallback((s: VoicePipelineState) => { stateRef.current = s; setState(s) }, [])

  // ── Playback (shared for both providers) ───────────────────────────────────

  const getPlayCtx = useCallback(() => {
    if (!playCtxRef.current || playCtxRef.current.state === 'closed')
      playCtxRef.current = new AudioContext({ sampleRate: SAMPLE_RATE })
    if (playCtxRef.current.state === 'suspended') playCtxRef.current.resume()
    return playCtxRef.current
  }, [])

  const playPcm = useCallback((i16: Int16Array) => {
    const ctx = getPlayCtx()
    const f32 = new Float32Array(i16.length)
    for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768
    const ab = ctx.createBuffer(1, f32.length, SAMPLE_RATE)
    ab.getChannelData(0).set(f32)
    const src = ctx.createBufferSource()
    src.buffer = ab
    src.connect(ctx.destination)
    srcsRef.current.push(src)
    src.onended = () => { srcsRef.current = srcsRef.current.filter((s) => s !== src) }
    const t = Math.max(ctx.currentTime + 0.005, nextTRef.current)
    src.start(t)
    nextTRef.current = t + ab.duration
  }, [getPlayCtx])

  const stopPlay = useCallback(() => {
    for (const s of srcsRef.current) { try { s.stop() } catch {} }
    srcsRef.current = []
    nextTRef.current = 0
    elAbortRef.current?.abort()
    elAbortRef.current = null
    elQueueRef.current = []
    elBusyRef.current = false
    elBufRef.current = ''
  }, [])

  // ── ElevenLabs streaming TTS ───────────────────────────────────────────────

  const speakEL = useCallback(async (
    text: string,
    signal: AbortSignal,
    voiceId?: string,
    voiceSettings?: Partial<{ stability: number; similarity_boost: number; style: number }>,
  ) => {
    const effectiveVoiceId = voiceId || elevenlabsVoiceId || getDefaultVoiceProfile()?.elevenLabsVoiceId
    const body: Record<string, unknown> = { text }
    if (effectiveVoiceId) body.voice_id = effectiveVoiceId
    if (voiceSettings) {
      body.voice_settings = {
        stability: voiceSettings.stability ?? 0.5,
        similarity_boost: voiceSettings.similarity_boost ?? 0.75,
        style: voiceSettings.style ?? 0.0,
        use_speaker_boost: true,
      }
    }
    const res = await fetch('/api/elevenlabs-tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    if (!res.ok || !res.body) {
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        console.error('[ElevenLabs] TTS error:', res.status, errText)
        throw new Error(`ElevenLabs TTS: ${res.status}`)
      }
      return
    }

    const reader = res.body.getReader()
    let lo = new Uint8Array(0)
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const c = new Uint8Array(lo.length + value.length)
      c.set(lo)
      c.set(value, lo.length)
      const aLen = c.length - (c.length % 2)
      if (aLen > 0) {
        const pcmSlice = c.slice(0, aLen)
        playPcm(new Int16Array(pcmSlice.buffer))
      }
      lo = c.slice(aLen)
    }
  }, [elevenlabsVoiceId, playPcm])

  const playSfx = useCallback(async (description: string, signal: AbortSignal) => {
    const res = await fetch('/api/elevenlabs/sound-effect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: description, duration_seconds: 3, prompt_influence: 0.5 }),
      signal,
    })
    if (!res.ok || !res.body) {
      if (!res.ok) console.warn('[SFX] generation failed:', res.status)
      return
    }
    const reader = res.body.getReader()
    let lo = new Uint8Array(0)
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const c = new Uint8Array(lo.length + value.length)
      c.set(lo)
      c.set(value, lo.length)
      const aLen = c.length - (c.length % 2)
      if (aLen > 0) {
        const pcmSlice = c.slice(0, aLen)
        playPcm(new Int16Array(pcmSlice.buffer))
      }
      lo = c.slice(aLen)
    }
  }, [playPcm])

  const saveTurnToMemory = useCallback(async (user: string, ai: string) => {
    const cId = convIdRef.current
    if (!cId || !user) return

    fetch('/api/jarvis-memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: cId,
        messages: [{ role: 'user', content: user }, { role: 'assistant', content: ai }],
      }),
    }).catch(e => console.warn('[memory] save failed:', e))

    try {
      const prompt = `Extract personal facts about the user from this exchange. Return a JSON object like:
{"facts":[{"category":"name","fact":"User's name is James"},{"category":"occupation","fact":"Works as a software engineer"}]}
Categories: name, location, occupation, preference, interest, relationship, habit, general.
If no personal facts, return {"facts":[]}.

User: ${user}
Assistant: ${ai || ''}`

      const res = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      })
      if (!res.ok) return

      const result = await res.json()
      const content = result.choices?.[0]?.message?.content || '{}'
      let facts: { category: string; fact: string }[] = []
      try {
        const parsed = JSON.parse(content)
        const raw: unknown[] = Array.isArray(parsed) ? parsed : (parsed.facts || [])
        for (const f of raw) {
          if (f && typeof f === 'object' && 'category' in f && 'fact' in f) {
            facts.push({ category: String((f as Record<string, unknown>).category), fact: String((f as Record<string, unknown>).fact) })
          }
        }
      } catch {}

      if (facts.length > 0) {
        fetch('/api/jarvis-memory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ facts }),
        }).catch(() => {})
      }
    } catch (e) {
      console.warn('[memory] extract failed:', e)
    }
  }, [])

  const finishTurn = useCallback(() => {
    if (userRef.current && aiAccRef.current) {
      const cleanAi = stripBehavioralMarkup(aiAccRef.current)
      onResRef.current?.(userRef.current, cleanAi)
      saveTurnToMemory(userRef.current, cleanAi)

      const flags = quickScan(cleanAi)
      const severe = flags.filter(f => f.severity === 'high' || f.severity === 'critical')
      if (severe.length > 0) {
        const ws = wsRef.current
        if (ws?.readyState === WebSocket.OPEN) {
          const warning = `[SYSTEM HALLUCINATION ALERT] Your previous response contained ${severe.length} potentially fabricated claim(s): ${severe.map(f => f.reason).join('; ')}. In your next response, correct any inaccurate information and avoid fabricating facts.`
          ws.send(JSON.stringify({
            type: 'conversation.item.create',
            item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: warning }] },
          }))
        }
      }
    }
    userRef.current = ''
    const rem = Math.max(0, Math.trunc((nextTRef.current - (playCtxRef.current?.currentTime || 0)) * 1000))
    setTimeout(() => {
      if (isOpenRef.current) { aiAccRef.current = ''; setS('listening'); setInterimTranscript('') }
    }, rem + 80)
  }, [setS, saveTurnToMemory])

  const processElQueue = useCallback(async () => {
    if (elBusyRef.current) return
    elBusyRef.current = true
    let hadError = false

    while (elQueueRef.current.length > 0 && isOpenRef.current) {
      const chunk = elQueueRef.current.shift()!
      elAbortRef.current = new AbortController()
      setS('speaking')

      const fetchPromise = chunk.isSfx
        ? playSfx(chunk.text, elAbortRef.current.signal).catch((e: Error) => {
            if (e.name === 'AbortError') return
            console.warn('[SFX] playback failed:', e)
          })
        : speakEL(
            chunk.text,
            elAbortRef.current.signal,
            chunk.voiceId,
            chunk.voiceSettings,
          ).catch((e: Error) => {
            if (e.name === 'AbortError') return
            if (!hadError) { setErrorMessage(e.message); hadError = true }
            console.error('[ElevenLabs]', e)
          })

      if (elQueueRef.current.length > 0) {
        const headroom = Math.max(0, (nextTRef.current - (playCtxRef.current?.currentTime || 0)) * 1000)
        if (headroom > 600) {
          await fetchPromise
        } else {
          await Promise.race([fetchPromise, new Promise(r => setTimeout(r, 200))])
        }
      } else {
        await fetchPromise
      }
    }

    elBusyRef.current = false
    if (elDoneRef.current && elQueueRef.current.length === 0 && isOpenRef.current) {
      elDoneRef.current = false
      finishTurn()
    }
  }, [speakEL, playSfx, setS, finishTurn])

  // ── Voice analysis sender ────────────────────────────────────────────────

  const sendVoiceAnalysis = useCallback((pcmBuffer: ArrayBuffer) => {
    fetch('/api/voice-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: pcmBuffer,
    })
      .then(r => r.json())
      .then((data: { vocalState?: string; error?: string }) => {
        vaInflightRef.current = false
        if (data.error) return
        const newState = data.vocalState ?? ''
        if (newState && newState !== vaPrevStateRef.current) {
          vaPrevStateRef.current = newState
          onVocalStateRef.current?.(newState)
          // Inject into Realtime session as system context
          const ws = wsRef.current
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'message',
                role: 'system',
                content: [{ type: 'input_text', text: `[Vocal Analysis] ${newState}` }],
              },
            }))
          }
        }
      })
      .catch(() => { vaInflightRef.current = false })
  }, [])

  // ── Mic → PCM16 → WS ─────────────────────────────────────────────────────

  const startMic = useCallback(async (ws: WebSocket) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: SAMPLE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true },
    })
    streamRef.current = stream
    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
    capCtxRef.current = ctx
    const src = ctx.createMediaStreamSource(stream)
    const proc = ctx.createScriptProcessor(2048, 1, 1) // NOSONAR -- AudioWorklet requires separate module file
    procRef.current = proc
    proc.onaudioprocess = (e) => { // NOSONAR -- deprecated but AudioWorklet alternative is disproportionate here
      if (ws.readyState !== WebSocket.OPEN) return
      const pcm = float32ToPcm16(e.inputBuffer.getChannelData(0))
      ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: abToBase64(pcm) })) // NOSONAR

      // Fork to voice analysis accumulator
      if (vaEnabledRef.current && !vaInflightRef.current) {
        vaBufRef.current.push(new Int16Array(pcm))
        vaSamplesRef.current += pcm.byteLength / 2
        if (vaSamplesRef.current >= VA_WINDOW) {
          const chunks = vaBufRef.current.splice(0)
          const total = chunks.reduce((n, c) => n + c.length, 0)
          const merged = new Int16Array(total)
          let offset = 0
          for (const c of chunks) { merged.set(c, offset); offset += c.length }
          vaBufRef.current = []
          vaSamplesRef.current = 0
          vaInflightRef.current = true
          sendVoiceAnalysis(merged.buffer)
        }
      }
    }
    src.connect(proc)
    proc.connect(ctx.destination)
  }, [])

  const stopMic = useCallback(() => {
    procRef.current?.disconnect()
    procRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (capCtxRef.current && capCtxRef.current.state !== 'closed') capCtxRef.current.close().catch(() => {})
    capCtxRef.current = null
    // Reset voice analysis state
    vaBufRef.current = []
    vaSamplesRef.current = 0
    vaInflightRef.current = false
  }, [])

  // ── Server events ─────────────────────────────────────────────────────────

  const onMsg = useCallback((msg: Record<string, unknown>) => {
    switch (msg.type) {
      case 'input_audio_buffer.speech_started':
        stopPlay()
        if (stateRef.current === 'speaking' || stateRef.current === 'thinking') {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'response.cancel' }))
          }
        }
        aiAccRef.current = ''
        setAiText('')
        setInterimTranscript('Listening…')
        setS('listening')
        elBufRef.current = ''
        elDoneRef.current = false
        break

      case 'input_audio_buffer.speech_stopped':
        setInterimTranscript('')
        setS('thinking')
        break

      case 'conversation.item.input_audio_transcription.completed':
        if (msg.transcript) { userRef.current = (msg.transcript as string).trim(); setTranscript(userRef.current) }
        break

      // ── OpenAI native audio events ──
      case 'response.audio.delta':
        if (!isEL && msg.delta) {
          setS('speaking')
          playPcm(b64ToInt16(msg.delta as string))
        }
        break

      case 'response.audio_transcript.delta':
        if (!isEL && msg.delta) { aiAccRef.current += msg.delta as string; setAiText(aiAccRef.current) }
        break

      // ── ElevenLabs text-only events ──
      case 'response.text.delta':
        if (isEL && msg.delta) {
          const d = msg.delta as string
          aiAccRef.current += d
          setAiText(stripBehavioralMarkup(aiAccRef.current))
          elBufRef.current += d
          const { chunks, remainder } = extractBehavioralChunks(elBufRef.current, voiceMapRef.current)
          elBufRef.current = remainder
          if (chunks.length > 0) {
            elQueueRef.current.push(...chunks)
            processElQueue()
          }
        }
        break

      case 'response.text.done':
        if (isEL && elBufRef.current.trim()) {
          const finalChunks = parseBehavioralMarkup(elBufRef.current.trim(), voiceMapRef.current)
          elQueueRef.current.push(...finalChunks)
          elBufRef.current = ''
          processElQueue()
        }
        break

      case 'response.done':
        if (isEL) {
          elDoneRef.current = true
          if (elBufRef.current.trim()) {
            const finalChunks = parseBehavioralMarkup(elBufRef.current.trim(), voiceMapRef.current)
            elQueueRef.current.push(...finalChunks)
            elBufRef.current = ''
          }
          if (!elBusyRef.current && elQueueRef.current.length === 0) {
            elDoneRef.current = false
            finishTurn()
          } else {
            processElQueue()
          }
        } else {
          if (userRef.current && aiAccRef.current) {
            onResRef.current?.(userRef.current, aiAccRef.current)
            saveTurnToMemory(userRef.current, aiAccRef.current)

            const flags = quickScan(aiAccRef.current)
            const severe = flags.filter(f => f.severity === 'high' || f.severity === 'critical')
            if (severe.length > 0) {
              const ws = wsRef.current
              if (ws?.readyState === WebSocket.OPEN) {
                const warning = `[SYSTEM HALLUCINATION ALERT] Your previous response contained ${severe.length} potentially fabricated claim(s): ${severe.map(f => f.reason).join('; ')}. Correct any inaccurate information in your next response.`
                ws.send(JSON.stringify({
                  type: 'conversation.item.create',
                  item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: warning }] },
                }))
              }
            }
          }
          aiAccRef.current = ''
          userRef.current = ''
          const rem = Math.max(0, Math.trunc((nextTRef.current - (playCtxRef.current?.currentTime || 0)) * 1000))
          setTimeout(() => {
            if (isOpenRef.current) { setS('listening'); setInterimTranscript('') }
          }, rem + 80)
        }
        break

      case 'response.function_call_arguments.done': {
        const fnName = msg.name as string
        const callId = msg.call_id as string

        if (fnName === 'web_search') {
          let args: { query?: string } = {}
          try { args = JSON.parse(msg.arguments as string) } catch {}
          const query = args.query || ''
          if (query && callId) {
            setS('thinking')
            fetch('/api/search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query, maxResults: 5 }),
            })
              .then(r => r.json())
              .then(data => {
                let content = ''
                if (data.answer) {
                  content = data.answer + '\n\n'
                }
                if (Array.isArray(data.results) && data.results.length > 0) {
                  const summaries = data.results
                    .slice(0, 5)
                    .map((r, i) =>
                      `${i + 1}. ${r.title || 'Untitled'}: ${(r.content || '').slice(0, 300)}${r.url ? ' (' + r.url + ')' : ''}`)
                    .join('\n')
                  content += 'Search results:\n' + summaries
                }
                if (!content) content = 'No search results found for: ' + query
                const ws = wsRef.current
                if (ws?.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'conversation.item.create',
                    item: {
                      type: 'function_call_output',
                      call_id: callId,
                      output: content,
                    },
                  }))
                  ws.send(JSON.stringify({ type: 'response.create' }))
                }
              })
              .catch(e => {
                console.error('[web_search] failed:', e)
                const ws = wsRef.current
                if (ws?.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'conversation.item.create',
                    item: {
                      type: 'function_call_output',
                      call_id: callId,
                      output: 'Web search failed. Please try answering from your own knowledge.',
                    },
                  }))
                  ws.send(JSON.stringify({ type: 'response.create' }))
                }
              })
          }
        } else if (fnName === 'tune_in') {
          let args: { action?: string; query?: string } = {}
          try { args = JSON.parse(msg.arguments as string) } catch {}
          const ctrl = tuneInRef.current
          if (!ctrl || !callId) break

          const sendToolResult = (output: string) => {
            const ws = wsRef.current
            if (ws?.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'conversation.item.create',
                item: { type: 'function_call_output', call_id: callId, output },
              }))
              ws.send(JSON.stringify({ type: 'response.create' }))
            }
          }

          switch (args.action) {
            case 'search_and_play': {
              const query = args.query || ''
              if (!query) { sendToolResult('No search query provided.'); break }
              setS('thinking')
              ctrl.searchAndPlay(query)
                .then(result => {
                  if (result.success) {
                    sendToolResult(`Now playing: ${result.stationName ?? query}`)
                  } else {
                    sendToolResult(result.error ?? `Could not find a station for "${query}"`)
                  }
                })
                .catch(() => sendToolResult('Failed to search for stations.'))
              break
            }
            case 'pause':
              ctrl.pause()
              sendToolResult('Radio paused.')
              break
            case 'resume':
              ctrl.resume()
              sendToolResult('Radio resumed.')
              break
            case 'now_playing': {
              const status = ctrl.getStatus()
              const parts: string[] = []
              if (status.stationName) parts.push(`Station: ${status.stationName}`)
              if (status.nowPlaying) parts.push(`Now playing: ${status.nowPlaying}`)
              parts.push(status.playing ? 'Status: Playing' : 'Status: Paused')
              sendToolResult(parts.join('. '))
              break
            }
            default:
              sendToolResult(`Unknown tune_in action: ${args.action ?? 'none'}`)
          }
        } else if (fnName === 'rag_search') {
          let args: { query?: string } = {}
          try { args = JSON.parse(msg.arguments as string) } catch {}
          const query = args.query || ''
          if (!query || !callId) break
          setS('thinking')
          fetch('/api/rag/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, limit: 5 }),
          })
            .then(r => r.json())
            .then((data: { results?: Array<{ document_title: string; content: string; similarity: number }> }) => {
              const results = data.results ?? []
              let output: string
              if (results.length === 0) {
                output = 'No relevant documents found in the knowledge base for: ' + query
              } else {
                output = results
                  .map((r, i) => `${i + 1}. [${r.document_title}] (relevance: ${Math.round(r.similarity * 100)}%)\n${r.content}`)
                  .join('\n---\n')
              }
              const ws = wsRef.current
              if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output } }))
                ws.send(JSON.stringify({ type: 'response.create' }))
              }
            })
            .catch(() => {
              const ws = wsRef.current
              if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: 'Knowledge base search failed.' } }))
                ws.send(JSON.stringify({ type: 'response.create' }))
              }
            })
        } else if (fnName === 'create_document') {
          let args: { title?: string; content?: string; format?: string } = {}
          try { args = JSON.parse(msg.arguments as string) } catch {}
          if (!args.title || !args.content || !callId) break
          setS('thinking')
          fetch('/api/rag/create-document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: args.title, content: args.content, format: args.format || 'md' }),
          })
            .then(r => r.json())
            .then((data: { documentId?: string; chunkCount?: number; format?: string; error?: { message?: string } }) => {
              let output: string
              if (data.error) {
                output = `Failed to create document: ${data.error.message ?? 'unknown error'}`
              } else {
                output = `Document "${args.title}" created successfully as ${(data.format ?? args.format ?? 'md').toUpperCase()} file. ID: ${data.documentId}. Indexed ${data.chunkCount} chunks in the knowledge base.`
              }
              const ws = wsRef.current
              if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output } }))
                ws.send(JSON.stringify({ type: 'response.create' }))
              }
            })
            .catch(() => {
              const ws = wsRef.current
              if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: 'Failed to create document.' } }))
                ws.send(JSON.stringify({ type: 'response.create' }))
              }
            })
        } else if (fnName === 'manage_documents') {
          let args: { action?: string; document_id?: string } = {}
          try { args = JSON.parse(msg.arguments as string) } catch {}
          if (!callId) break

          const sendRagResult = (output: string) => {
            const ws = wsRef.current
            if (ws?.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output } }))
              ws.send(JSON.stringify({ type: 'response.create' }))
            }
          }

          if (args.action === 'list') {
            setS('thinking')
            fetch('/api/rag/documents')
              .then(r => r.json())
              .then((data: { documents?: Array<{ id: string; title: string; filename: string; source: string; chunk_count: number; created_at: string }> }) => {
                const docs = data.documents ?? []
                if (docs.length === 0) {
                  sendRagResult('No documents stored in the knowledge base yet.')
                } else {
                  const list = docs.map((d, i) => `${i + 1}. "${d.title}" (${d.source}, ${d.chunk_count} chunks, created ${new Date(d.created_at).toLocaleDateString()}) ID: ${d.id}`).join('\n')
                  sendRagResult(`${docs.length} document(s) in the knowledge base:\n${list}`)
                }
              })
              .catch(() => sendRagResult('Failed to list documents.'))
          } else if (args.action === 'delete' && args.document_id) {
            setS('thinking')
            fetch(`/api/rag/documents/${encodeURIComponent(args.document_id)}`, { method: 'DELETE' })
              .then(r => r.json())
              .then((data: { ok?: boolean; error?: { message?: string } }) => {
                if (data.ok) {
                  sendRagResult(`Document ${args.document_id} deleted successfully.`)
                } else {
                  sendRagResult(data.error?.message ?? 'Failed to delete document.')
                }
              })
              .catch(() => sendRagResult('Failed to delete document.'))
          } else {
            sendRagResult(`Unknown manage_documents action: ${args.action ?? 'none'}`)
          }
        } else if (fnName === 'browser_action') {
          let args: { action?: string; url?: string; ref?: string; text?: string; direction?: string; tab_id?: string } = {}
          try { args = JSON.parse(msg.arguments as string) } catch {}
          const bc = browserRef.current
          if (!callId) break

          const sendBrowserResult = (output: string) => {
            const ws = wsRef.current
            if (ws?.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'response.cancel' }))
              ws.send(JSON.stringify({
                type: 'conversation.item.create',
                item: { type: 'function_call_output', call_id: callId, output },
              }))
              ws.send(JSON.stringify({ type: 'response.create' }))
            }
          }

          if (!bc) {
            sendBrowserResult('Browser control is not available. The browser may not be open.')
            break
          }

          setS('thinking')

          void (async () => {
            try {
              switch (args.action) {
                case 'navigate': {
                  if (!args.url) { sendBrowserResult('Missing url parameter.'); return }
                  bc.openBrowser()
                  await new Promise(r => setTimeout(r, 300))
                  const navResult = await bc.navigate(args.url)
                  await new Promise(r => setTimeout(r, 1000))
                  sendBrowserResult(navResult.ok
                    ? `Navigated to ${navResult.url}. Page title: ${navResult.title || '(no title)'}. Use snapshot to see page elements.`
                    : `Failed to navigate to ${args.url}.`)
                  return
                }
                case 'snapshot': {
                  const tree = await bc.snapshot()
                  sendBrowserResult(tree)
                  return
                }
                case 'click': {
                  if (!args.ref) { sendBrowserResult('Missing ref parameter. Run snapshot first to get element refs.'); return }
                  const clickRes = await bc.click(args.ref)
                  if (clickRes.ok) {
                    await new Promise(r => setTimeout(r, 800))
                    sendBrowserResult(`Clicked element ${args.ref}. Use snapshot to see the updated page.`)
                  } else {
                    sendBrowserResult(`Could not click ${args.ref}. It may no longer exist — run snapshot to refresh refs.`)
                  }
                  return
                }
                case 'type': {
                  if (!args.ref || !args.text) { sendBrowserResult('Missing ref or text parameter.'); return }
                  const typeRes = await bc.type(args.ref, args.text)
                  sendBrowserResult(typeRes.ok
                    ? `Typed "${args.text}" into element ${args.ref}.`
                    : `Could not type into ${args.ref}. Run snapshot to refresh refs.`)
                  return
                }
                case 'extract_text': {
                  const eText = await bc.extractText()
                  sendBrowserResult(eText || '(empty page)')
                  return
                }
                case 'scroll': {
                  const dir = (args.direction === 'up' ? 'up' : 'down') as 'up' | 'down'
                  await bc.scroll(dir)
                  sendBrowserResult(`Scrolled ${dir}. Use snapshot to see new content.`)
                  return
                }
                case 'go_back': {
                  await bc.goBack()
                  await new Promise(r => setTimeout(r, 800))
                  sendBrowserResult('Went back. Use snapshot to see the page.')
                  return
                }
                case 'go_forward': {
                  await bc.goForward()
                  await new Promise(r => setTimeout(r, 800))
                  sendBrowserResult('Went forward. Use snapshot to see the page.')
                  return
                }
                case 'new_tab': {
                  const tabRes = await bc.newTab(args.url as string | undefined)
                  if (tabRes.ok) {
                    if (args.url) await new Promise(r => setTimeout(r, 1500))
                    sendBrowserResult(`Opened new tab (id: ${tabRes.tabId}). Use snapshot to see it.`)
                  } else {
                    sendBrowserResult('Failed to open new tab (tab limit may be reached).')
                  }
                  return
                }
                case 'switch_tab': {
                  if (!args.tab_id) { sendBrowserResult('Missing tab_id parameter.'); return }
                  const stRes = await bc.switchTab(args.tab_id as string)
                  sendBrowserResult(stRes.ok ? `Switched to tab ${args.tab_id}. Use snapshot to see the page.` : `Tab ${args.tab_id} not found.`)
                  return
                }
                case 'close_tab': {
                  if (!args.tab_id) { sendBrowserResult('Missing tab_id parameter.'); return }
                  const ctRes = await bc.closeTab(args.tab_id as string)
                  sendBrowserResult(ctRes.ok ? `Closed tab ${args.tab_id}.` : `Could not close tab ${args.tab_id}.`)
                  return
                }
                case 'list_tabs': {
                  const tabsList = bc.listTabs()
                  if (tabsList.length === 0) { sendBrowserResult('No tabs open.'); return }
                  sendBrowserResult(tabsList.map(t => `${t.active ? '* ' : '  '}[${t.id}] ${t.title} — ${t.url}`).join('\n'))
                  return
                }
                default:
                  sendBrowserResult(`Unknown browser action: ${args.action ?? 'none'}`)
              }
            } catch (e) {
              sendBrowserResult(`Browser action failed: ${e instanceof Error ? e.message : String(e)}`)
            }
          })()
        } else if (fnName === 'browser_task') {
          let args: { goal?: string; save_results?: boolean } = {}
          try { args = JSON.parse(msg.arguments as string) } catch {}
          const bc = browserRef.current
          if (!callId) break

          const sendTaskResult = (output: string) => {
            const ws = wsRef.current
            if (ws?.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'response.cancel' }))
              ws.send(JSON.stringify({
                type: 'conversation.item.create',
                item: { type: 'function_call_output', call_id: callId, output },
              }))
              ws.send(JSON.stringify({ type: 'response.create' }))
            }
          }

          if (!bc || !args.goal) {
            sendTaskResult(bc ? 'Missing goal parameter.' : 'Browser control is not available.')
            break
          }

          setS('thinking')
          onBrowserAutomatingRef.current?.(true)

          void (async () => {
            try {
              const result = await runBrowserAgent(args.goal!, bc, {
                maxSteps: 25,
                model: 'gpt-4o-mini',
                guideMode: browserGuideModeRef.current ?? false,
                onStep: (step) => {
                  onBrowserStepRef.current?.({ action: step.action, result: step.result, timestamp: step.timestamp })
                  if (step.narration && browserGuideModeRef.current) {
                    const ws = wsRef.current
                    if (ws?.readyState === WebSocket.OPEN) {
                      ws.send(JSON.stringify({
                        type: 'conversation.item.create',
                        item: { type: 'message', role: 'assistant', content: [{ type: 'text', text: `[Browsing] ${step.narration}` }] },
                      }))
                    }
                  }
                },
              })

              let output = result.summary
              if (result.savedDocuments.length > 0) {
                output += `\n\nSaved to knowledge base: ${result.savedDocuments.join(', ')}`
              }
              output += `\n(Completed in ${result.steps.length} steps)`
              sendTaskResult(output)
            } catch (e) {
              sendTaskResult(`Browser task failed: ${e instanceof Error ? e.message : String(e)}`)
            } finally {
              onBrowserAutomatingRef.current?.(false)
            }
          })()

        } else if (fnName === 'generate_image') {
          let args: { prompt?: string; size?: string } = {}
          try { args = JSON.parse(msg.arguments as string) } catch {}
          if (!callId || !args.prompt) break

          const sendMediaResult = (output: string) => {
            const ws = wsRef.current
            if (ws?.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'response.cancel' }))
              ws.send(JSON.stringify({
                type: 'conversation.item.create',
                item: { type: 'function_call_output', call_id: callId, output },
              }))
              ws.send(JSON.stringify({ type: 'response.create' }))
            }
          }

          setS('thinking')
          onMediaGeneratingRef.current?.(true)
          onMediaGeneratingLabelRef.current?.('Generating image...')
          openMediaCanvasRef.current?.()

          void (async () => {
            try {
              const sizeMap: Record<string, '1024x1024' | '1024x1536' | '1536x1024'> = {
                square: '1024x1024', landscape: '1536x1024', portrait: '1024x1536',
              }
              const result = await generateImage(args.prompt!, { size: sizeMap[args.size || 'square'] || '1024x1024' })
              const mc = mediaCanvasRef.current
              if (mc) mc.showImage(result, args.prompt)
              sendMediaResult(`Image generated successfully and displayed in the Media Canvas. The user can see it now.`)
            } catch (e) {
              sendMediaResult(`Image generation failed: ${e instanceof Error ? e.message : String(e)}`)
            } finally {
              onMediaGeneratingRef.current?.(false)
              onMediaGeneratingLabelRef.current?.('')
            }
          })()

        } else if (fnName === 'generate_video') {
          let args: { prompt?: string; duration?: number } = {}
          try { args = JSON.parse(msg.arguments as string) } catch {}
          if (!callId || !args.prompt) break

          const sendMediaResult = (output: string) => {
            const ws = wsRef.current
            if (ws?.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'response.cancel' }))
              ws.send(JSON.stringify({
                type: 'conversation.item.create',
                item: { type: 'function_call_output', call_id: callId, output },
              }))
              ws.send(JSON.stringify({ type: 'response.create' }))
            }
          }

          setS('thinking')
          onMediaGeneratingRef.current?.(true)
          onMediaGeneratingLabelRef.current?.('Generating video...')
          openMediaCanvasRef.current?.()

          void (async () => {
            try {
              const dur = ([4, 8, 12].includes(args.duration ?? 0) ? args.duration : 4) as 4 | 8 | 12
              const result = await createVideo(args.prompt!, {
                seconds: dur,
              }, (progress) => {
                onMediaGeneratingLabelRef.current?.(`Generating video... ${Math.round(progress)}%`)
              })
              const mc = mediaCanvasRef.current
              if (mc) mc.showVideo(result, args.prompt)
              sendMediaResult(`Video generated successfully and playing in the Media Canvas.`)
            } catch (e) {
              sendMediaResult(`Video generation failed: ${e instanceof Error ? e.message : String(e)}`)
            } finally {
              onMediaGeneratingRef.current?.(false)
              onMediaGeneratingLabelRef.current?.('')
            }
          })()

        } else if (fnName === 'edit_image') {
          let args: { instruction?: string } = {}
          try { args = JSON.parse(msg.arguments as string) } catch {}
          if (!callId || !args.instruction) break

          const sendMediaResult = (output: string) => {
            const ws = wsRef.current
            if (ws?.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'response.cancel' }))
              ws.send(JSON.stringify({
                type: 'conversation.item.create',
                item: { type: 'function_call_output', call_id: callId, output },
              }))
              ws.send(JSON.stringify({ type: 'response.create' }))
            }
          }

          const mc = mediaCanvasRef.current
          if (!mc) { sendMediaResult('Media Canvas is not open.'); break }
          const currentImage = mc.getCurrentImageBase64()
          if (!currentImage) { sendMediaResult('No image is currently loaded in the Media Canvas.'); break }

          setS('thinking')
          onMediaGeneratingRef.current?.(true)
          onMediaGeneratingLabelRef.current?.('Editing image...')

          void (async () => {
            try {
              const result = await editImage(currentImage, args.instruction!, { quality: 'high' })
              mc.applyEdit(result)
              sendMediaResult(`Image edited successfully. The updated image is displayed in the Media Canvas.`)
            } catch (e) {
              sendMediaResult(`Image edit failed: ${e instanceof Error ? e.message : String(e)}`)
            } finally {
              onMediaGeneratingRef.current?.(false)
              onMediaGeneratingLabelRef.current?.('')
            }
          })()

        } else if (fnName === 'show_code') {
          let args: { code?: string; language?: string; filename?: string } = {}
          try { args = JSON.parse(msg.arguments as string) } catch {}
          if (!callId || !args.code || !args.language) break

          const ctrl = codeEditorRef.current
          if (ctrl) {
            ctrl.showCode(args.code, args.language, args.filename)
          } else {
            openCodeEditorRef.current?.()
          }

          const ws = wsRef.current
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: 'Code is now displayed in the Code Editor.' } }))
            ws.send(JSON.stringify({ type: 'response.create' }))
          }

        } else if (fnName === 'run_code') {
          let args: { code?: string; language?: string } = {}
          try { args = JSON.parse(msg.arguments as string) } catch {}
          if (!callId || !args.code || !args.language) break

          setS('thinking')
          void (async () => {
            try {
              const result = await runCode(args.code!, args.language!)
              let output = ''
              if (result.stdout) output += result.stdout
              if (result.stderr) output += (output ? '\n' : '') + `[stderr] ${result.stderr}`
              if (result.error) output += (output ? '\n' : '') + `[error] ${result.error}`
              if (!output) output = '(no output)'
              output = `Execution completed in ${result.elapsed}ms:\n${output}`
              const ws = wsRef.current
              if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output } }))
                ws.send(JSON.stringify({ type: 'response.create' }))
              }
            } catch (e) {
              const ws = wsRef.current
              if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: `Execution failed: ${e instanceof Error ? e.message : String(e)}` } }))
                ws.send(JSON.stringify({ type: 'response.create' }))
              }
            }
          })()

        } else if (fnName === 'search_huggingface') {
          let args: { query?: string; type?: string } = {}
          try { args = JSON.parse(msg.arguments as string) } catch {}
          if (!callId || !args.query) break

          setS('thinking')
          void (async () => {
            try {
              const output = await searchHuggingFace(args.query!, (args.type as 'datasets' | 'models') || 'datasets')
              const ws = wsRef.current
              if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output } }))
                ws.send(JSON.stringify({ type: 'response.create' }))
              }
            } catch (e) {
              const ws = wsRef.current
              if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: `HF search failed: ${e instanceof Error ? e.message : String(e)}` } }))
                ws.send(JSON.stringify({ type: 'response.create' }))
              }
            }
          })()

        } else if (fnName === 'search_github') {
          let args: { query?: string; type?: string } = {}
          try { args = JSON.parse(msg.arguments as string) } catch {}
          if (!callId || !args.query) break

          setS('thinking')
          void (async () => {
            try {
              const output = await searchGitHub(args.query!, (args.type as 'repositories' | 'code') || 'repositories')
              const ws = wsRef.current
              if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output } }))
                ws.send(JSON.stringify({ type: 'response.create' }))
              }
            } catch (e) {
              const ws = wsRef.current
              if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: `GitHub search failed: ${e instanceof Error ? e.message : String(e)}` } }))
                ws.send(JSON.stringify({ type: 'response.create' }))
              }
            }
          })()

        } else if (fnName === 'generate_music') {
          let args: { prompt?: string; style?: string; instrumental?: boolean } = {}
          try { args = JSON.parse(msg.arguments as string) } catch {}
          if (!callId || !args.prompt) break

          setS('thinking')
          onMusicGeneratingRef.current?.(true)
          onMusicGeneratingLabelRef.current?.('Generating music — this takes 1–3 minutes...')
          openMusicPlayerRef.current?.()

          void (async () => {
            try {
              const tracks = await generateMusic(args.prompt!, { style: args.style, instrumental: args.instrumental })
              if (tracks.length > 0) {
                const track = tracks[0]
                musicPlayerRef.current?.showTrack({
                  id: track.id,
                  audioUrl: track.audioUrl,
                  title: track.title,
                  tags: track.tags,
                  duration: track.duration,
                  prompt: args.prompt!,
                  createdAt: Date.now(),
                })
              }
              const ws = wsRef.current
              if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: `Music generated! "${tracks[0]?.title || 'Song'}" is now playing.` } }))
                ws.send(JSON.stringify({ type: 'response.create' }))
              }
            } catch (e) {
              const ws = wsRef.current
              if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: `Music generation failed: ${e instanceof Error ? e.message : String(e)}` } }))
                ws.send(JSON.stringify({ type: 'response.create' }))
              }
            } finally {
              onMusicGeneratingRef.current?.(false)
              onMusicGeneratingLabelRef.current?.('')
            }
          })()

        } else if (fnName === 'get_account_balances' || fnName === 'get_transactions' || fnName === 'get_spending_summary') {
          let args: { start_date?: string; end_date?: string } = {}
          try { args = JSON.parse(msg.arguments as string) } catch {}
          if (!callId) break

          setS('thinking')
          void (async () => {
            try {
              let output: string
              if (fnName === 'get_account_balances') output = await getBalances()
              else if (fnName === 'get_transactions') output = await getTransactions(args.start_date, args.end_date)
              else output = await getSpendingSummary(args.start_date, args.end_date)
              const ws = wsRef.current
              if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output } }))
                ws.send(JSON.stringify({ type: 'response.create' }))
              }
            } catch (e) {
              const ws = wsRef.current
              if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: `Financial data error: ${e instanceof Error ? e.message : String(e)}` } }))
                ws.send(JSON.stringify({ type: 'response.create' }))
              }
            }
          })()

        } else if (fnName === 'search_stories') {
          let args: { query?: string; source?: string } = {}
          try { args = JSON.parse(msg.arguments as string) } catch {}
          if (!callId || !args.query) break

          setS('thinking')
          void (async () => {
            try {
              const output = await searchStories(args.query!, (args.source as 'all' | 'gutenberg' | 'short') || 'all')
              const ws = wsRef.current
              if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output } }))
                ws.send(JSON.stringify({ type: 'response.create' }))
              }
            } catch (e) {
              const ws = wsRef.current
              if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: `Story search failed: ${e instanceof Error ? e.message : String(e)}` } }))
                ws.send(JSON.stringify({ type: 'response.create' }))
              }
            }
          })()

        } else if (fnName === 'tell_story') {
          let args: { story_id?: string; source?: string; random?: boolean; genre?: string } = {}
          try { args = JSON.parse(msg.arguments as string) } catch {}
          if (!callId) break

          setS('thinking')
          void (async () => {
            try {
              let output: string
              if (args.random) {
                output = await getRandomStory(args.genre)
              } else if (args.story_id && args.source) {
                output = await getStoryContent(args.story_id, args.source as 'gutenberg' | 'huggingface')
              } else {
                output = 'Missing story_id or source. Search for stories first with search_stories, or set random=true.'
              }
              const ws = wsRef.current
              if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output } }))
                ws.send(JSON.stringify({ type: 'response.create' }))
              }
            } catch (e) {
              const ws = wsRef.current
              if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: `Story error: ${e instanceof Error ? e.message : String(e)}` } }))
                ws.send(JSON.stringify({ type: 'response.create' }))
              }
            }
          })()

        } else if (fnName === 'post_to_x' || fnName === 'post_reply' || fnName === 'read_social_feed' || fnName === 'read_comments' || fnName === 'schedule_post') {
          let args: Record<string, unknown> = {}
          try { args = JSON.parse(msg.arguments as string) } catch {}
          if (!callId) break

          setS('thinking')
          void (async () => {
            try {
              let output: string
              const bc = browserRef.current

              if (fnName === 'post_to_x') {
                const result = await postTweet(args.text as string, args.reply_to_id as string | undefined)
                output = `Tweet posted! URL: ${result.url}`
              } else if (fnName === 'read_social_feed') {
                if (bc) {
                  output = await readSocialFeed(args.platform as 'x' | 'threads', bc, { username: args.username as string | undefined, query: args.query as string | undefined })
                } else {
                  output = 'Browser not available.'
                }
              } else if (fnName === 'read_comments') {
                if (bc) {
                  output = await readComments(args.post_url as string, bc)
                } else {
                  output = 'Browser not available.'
                }
              } else if (fnName === 'post_reply') {
                const platform = args.platform as 'x' | 'threads'
                if (platform === 'x') {
                  const result = await postTweet(args.text as string, args.tweet_id as string)
                  output = `Reply posted on X! URL: ${result.url}`
                } else if (bc) {
                  output = await replyViaBrowser(args.post_url as string, args.text as string, bc)
                } else {
                  output = 'Browser not available for Threads reply.'
                }
              } else if (fnName === 'schedule_post') {
                const action = args.action as string
                if (action === 'list') {
                  output = listScheduledPostsSummary()
                } else if (action === 'cancel') {
                  const ok = cancelScheduledPost(args.post_id as string)
                  output = ok ? `Cancelled post ${args.post_id}.` : `Post ${args.post_id} not found.`
                } else {
                  const post = schedulePost(args.platform as 'x' | 'threads', args.text as string, args.scheduled_time as string)
                  output = `Post scheduled for ${new Date(args.scheduled_time as string).toLocaleString()} on ${(args.platform as string).toUpperCase()}. ID: ${post.id}`
                }
              } else {
                output = `Unknown social tool: ${fnName}`
              }

              const ws = wsRef.current
              if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output } }))
                ws.send(JSON.stringify({ type: 'response.create' }))
              }
            } catch (e) {
              const ws = wsRef.current
              if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: `Social media error: ${e instanceof Error ? e.message : String(e)}` } }))
                ws.send(JSON.stringify({ type: 'response.create' }))
              }
            }
          })()
        }
        break
      }

      case 'error': {
        const errMsg = (msg.error as { message?: string })?.message || ''
        if (errMsg.includes('no active response')) break
        console.error('[Realtime] error:', msg.error)
        setErrorMessage(errMsg || 'Realtime API error')
        break
      }
    }
  }, [isEL, playPcm, stopPlay, processElQueue, finishTurn, saveTurnToMemory, setS])

  // ── Public API ────────────────────────────────────────────────────────────

  const open = useCallback(async () => {
    if (isOpenRef.current) return
    setErrorMessage(null)
    setTranscript('')
    setInterimTranscript('')
    setAiText('')
    aiAccRef.current = ''
    userRef.current = ''
    elBufRef.current = ''
    elQueueRef.current = []
    elDoneRef.current = false
    elBusyRef.current = false
    convIdRef.current = null
    memoryRef.current = null

    let memory: MemoryPayload | null = null
    try {
      const memRes = await fetch('/api/jarvis-memory')
      if (memRes.ok) {
        memory = await memRes.json() as MemoryPayload
        convIdRef.current = memory.conversationId
        memoryRef.current = memory
      }
    } catch (e) {
      console.warn('[memory] Failed to load memory, proceeding without it:', e)
    }

    let visionAvailable = visionContext?.connected && visionContext?.cameraConnected
    if (!visionAvailable) {
      try {
        const vRes = await fetch('/api/vision/context')
        if (vRes.ok) {
          const vData = await vRes.json()
          visionAvailable = !!(vData.camera_connected ?? vData.cameraConnected)
        }
      } catch { /* vision engine offline */ }
    }

    try {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${proto}//${location.host}/ws/realtime?model=${encodeURIComponent(model)}`
      const ws = new WebSocket(wsUrl, ['realtime'])

      ws.onopen = async () => {
        const hasTuneIn = Boolean(tuneInRef.current)
        const hasRag = true
        const hasBrowser = Boolean(browserRef.current)
        const hasMedia = Boolean(mediaCanvasRef.current)
        const registeredVoiceNames = Array.from(voiceMapRef.current.values()).map(v => v.name)
        const instructions = buildInstructions({
          mem: memory, hasVision: visionAvailable, hasTuneIn, hasRag, hasBrowser,
          browserGuideMode: browserGuideModeRef.current ?? false, hasMedia,
          voiceNames: registeredVoiceNames, isElevenLabs: isEL,
          hasVoiceAnalysis: vaEnabledRef.current,
        })

        const tools: Record<string, unknown>[] = [
          {
            type: 'function',
            name: 'web_search',
            description: 'Search the web for current information. Use when the user asks about recent events, news, weather, sports scores, stock prices, or anything that requires up-to-date information.',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'The search query' },
              },
              required: ['query'],
            },
          },
        ]

        if (hasTuneIn) {
          tools.push({
            type: 'function',
            name: 'tune_in',
            description: 'Control the TuneIn radio player. Use when the user asks to play music, play a radio station, stop or pause music, resume playback, or asks what is currently playing.',
            parameters: {
              type: 'object',
              properties: {
                action: {
                  type: 'string',
                  enum: ['search_and_play', 'pause', 'resume', 'now_playing'],
                  description: 'The action to perform on the radio player',
                },
                query: {
                  type: 'string',
                  description: 'Search query for finding stations (required for search_and_play). Examples: rock, BBC Radio 1, jazz, classical, chill',
                },
              },
              required: ['action'],
            },
          })
        }

        // RAG tools — always available (server returns 503 gracefully if not configured)
        tools.push(
          {
            type: 'function',
            name: 'rag_search',
            description: 'Search the personal knowledge base for relevant information. Use when the user asks about stored documents, notes, or any personal data that might be in their knowledge store.',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Natural language search query' },
              },
              required: ['query'],
            },
          },
          {
            type: 'function',
            name: 'create_document',
            description: 'Create and store a document in the knowledge base and cloud storage. Use when the user asks to write, create, draft, or save a document, note, report, letter, or any written content.',
            parameters: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Title of the document' },
                content: { type: 'string', description: 'Full text content of the document' },
                format: { type: 'string', enum: ['md', 'docx', 'pdf'], description: 'Output format: md for notes, docx for formal documents, pdf for reports' },
              },
              required: ['title', 'content', 'format'],
            },
          },
          {
            type: 'function',
            name: 'manage_documents',
            description: 'List stored documents or delete a specific document from the knowledge base.',
            parameters: {
              type: 'object',
              properties: {
                action: { type: 'string', enum: ['list', 'delete'], description: 'Action to perform' },
                document_id: { type: 'string', description: 'UUID of the document to delete (required for delete action)' },
              },
              required: ['action'],
            },
          },
        )

        if (hasBrowser) {
          tools.push(
            {
              type: 'function',
              name: 'browser_action',
              description: 'Control a web browser visible to the user. For single-step browser interactions: navigate, click, type, scroll, snapshot, extract text, manage tabs.',
              parameters: {
                type: 'object',
                properties: {
                  action: {
                    type: 'string',
                    enum: ['navigate', 'snapshot', 'click', 'type', 'extract_text', 'scroll', 'go_back', 'go_forward', 'new_tab', 'switch_tab', 'close_tab', 'list_tabs'],
                    description: 'The browser action to perform',
                  },
                  url: { type: 'string', description: 'URL to navigate to (for navigate/new_tab)' },
                  ref: { type: 'string', description: 'Element ref ID from a previous snapshot (for click/type)' },
                  text: { type: 'string', description: 'Text to type into the element (for type)' },
                  direction: { type: 'string', enum: ['up', 'down'], description: 'Scroll direction (for scroll)' },
                  tab_id: { type: 'string', description: 'Tab ID (for switch_tab/close_tab)' },
                },
                required: ['action'],
              },
            },
            {
              type: 'function',
              name: 'browser_task',
              description: 'Execute a complex multi-step browser task autonomously. Jarvis will plan and execute multiple browser steps to accomplish the goal. Use for research, comparison shopping, data extraction, and any task requiring many browser interactions. For simple single-step actions, use browser_action instead.',
              parameters: {
                type: 'object',
                properties: {
                  goal: { type: 'string', description: 'The complete goal to accomplish (e.g. "Research the top 3 competitors of Acme Corp and compare their pricing")' },
                  save_results: { type: 'boolean', description: 'Whether to save the research findings to the knowledge base for future reference. Default true.' },
                },
                required: ['goal'],
              },
            },
          )
        }

        if (hasMedia) {
          tools.push(
            {
              type: 'function',
              name: 'generate_image',
              description: 'Generate an image from a text description. The image will open in the Media Canvas for the user to see and edit.',
              parameters: {
                type: 'object',
                properties: {
                  prompt: { type: 'string', description: 'Detailed description of the image to generate' },
                  size: { type: 'string', enum: ['square', 'landscape', 'portrait'], description: 'Image orientation. Default: square.' },
                },
                required: ['prompt'],
              },
            },
            {
              type: 'function',
              name: 'generate_video',
              description: 'Generate a short video (4-12 seconds) from a text description. The video will open in the Media Canvas.',
              parameters: {
                type: 'object',
                properties: {
                  prompt: { type: 'string', description: 'Detailed description of the video to generate' },
                  duration: { type: 'number', enum: [4, 8, 12], description: 'Video duration in seconds. Default: 4.' },
                },
                required: ['prompt'],
              },
            },
            {
              type: 'function',
              name: 'edit_image',
              description: 'Edit the current image in the Media Canvas. Can adjust contrast, brightness, saturation, remove objects, enhance to HD, change backgrounds, and more.',
              parameters: {
                type: 'object',
                properties: {
                  instruction: { type: 'string', description: 'What to do to the image (e.g. "increase contrast", "remove the person on the left", "enhance to HD", "make it more vibrant")' },
                },
                required: ['instruction'],
              },
            },
          )
        }

        // Code editor tools — always available
        tools.push(
          {
            type: 'function',
            name: 'show_code',
            description: 'Display code in the interactive Code Editor. Supports syntax highlighting, editing, copy, download, and execution (Python & JavaScript).',
            parameters: {
              type: 'object',
              properties: {
                code: { type: 'string', description: 'The code to display' },
                language: { type: 'string', description: 'Programming language' },
                filename: { type: 'string', description: 'Optional filename' },
              },
              required: ['code', 'language'],
            },
          },
          {
            type: 'function',
            name: 'run_code',
            description: 'Execute code and return the output. Supports Python and JavaScript.',
            parameters: {
              type: 'object',
              properties: {
                code: { type: 'string', description: 'The code to execute' },
                language: { type: 'string', enum: ['python', 'javascript'], description: 'Language to execute' },
              },
              required: ['code', 'language'],
            },
          },
          {
            type: 'function',
            name: 'search_huggingface',
            description: 'Search Hugging Face for datasets or models by keyword.',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search query' },
                type: { type: 'string', enum: ['datasets', 'models'], description: 'What to search for (default: datasets)' },
              },
              required: ['query'],
            },
          },
          {
            type: 'function',
            name: 'search_github',
            description: 'Search GitHub for repositories or code.',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search query' },
                type: { type: 'string', enum: ['repositories', 'code'], description: 'What to search for (default: repositories)' },
              },
              required: ['query'],
            },
          },
          {
            type: 'function',
            name: 'generate_music',
            description: 'Generate a full song from a text description using Suno AI. Returns a playable audio track.',
            parameters: {
              type: 'object',
              properties: {
                prompt: { type: 'string', description: 'Description of the song to generate' },
                style: { type: 'string', description: 'Optional music style/genre tags' },
                instrumental: { type: 'boolean', description: 'Instrumental only, no lyrics (default: false)' },
              },
              required: ['prompt'],
            },
          },
        )

        // Financial tools — always available (server returns 401 gracefully if not configured)
        tools.push(
          {
            type: 'function',
            name: 'get_account_balances',
            description: 'Get current balances for all linked bank accounts.',
            parameters: { type: 'object', properties: {}, required: [] },
          },
          {
            type: 'function',
            name: 'get_transactions',
            description: 'Get recent bank transactions with dates, amounts, merchants, and categories.',
            parameters: {
              type: 'object',
              properties: {
                start_date: { type: 'string', description: 'Start date YYYY-MM-DD (default: 30 days ago)' },
                end_date: { type: 'string', description: 'End date YYYY-MM-DD (default: today)' },
              },
              required: [],
            },
          },
          {
            type: 'function',
            name: 'get_spending_summary',
            description: 'Get a comprehensive financial summary: income vs expenditure, spending by category, top merchants, balances.',
            parameters: {
              type: 'object',
              properties: {
                start_date: { type: 'string', description: 'Start date YYYY-MM-DD (default: 30 days ago)' },
                end_date: { type: 'string', description: 'End date YYYY-MM-DD (default: today)' },
              },
              required: [],
            },
          },
        )

        // Story tools — always available
        tools.push(
          {
            type: 'function',
            name: 'search_stories',
            description: 'Search for stories from Project Gutenberg (70,000+ classic books) and short story collections.',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search query (title, author, subject, or theme)' },
                source: { type: 'string', enum: ['all', 'gutenberg', 'short'], description: 'Where to search (default: all)' },
              },
              required: ['query'],
            },
          },
          {
            type: 'function',
            name: 'tell_story',
            description: 'Fetch and read a story. Use the ID and Source values from search_stories results, or set random=true for a surprise story.',
            parameters: {
              type: 'object',
              properties: {
                story_id: { type: 'string', description: 'The story ID from search_stories (e.g. "11" for Gutenberg, "hf-tinystories-1450265" for short stories)' },
                source: { type: 'string', enum: ['gutenberg', 'huggingface'], description: 'Story source from search_stories results' },
                random: { type: 'boolean', description: 'Get a random story instead (default: false)' },
                genre: { type: 'string', description: 'Genre for random stories (adventure, fairy tale, mystery, fantasy, fable, etc.)' },
              },
              required: [],
            },
          },
          {
            type: 'function',
            name: 'post_to_x',
            description: 'Post a tweet to X (Twitter). ALWAYS confirm with the user first by reading the text aloud before posting.',
            parameters: {
              type: 'object',
              properties: {
                text: { type: 'string', description: 'Tweet text (max 280 chars)' },
                reply_to_id: { type: 'string', description: 'Tweet ID to reply to (optional)' },
              },
              required: ['text'],
            },
          },
          {
            type: 'function',
            name: 'read_social_feed',
            description: 'Read posts from X or Threads using the browser.',
            parameters: {
              type: 'object',
              properties: {
                platform: { type: 'string', enum: ['x', 'threads'] },
                username: { type: 'string', description: 'Username to view' },
                query: { type: 'string', description: 'Search query' },
              },
              required: ['platform'],
            },
          },
          {
            type: 'function',
            name: 'read_comments',
            description: 'Read replies/comments on a specific social media post.',
            parameters: {
              type: 'object',
              properties: {
                post_url: { type: 'string', description: 'Full URL of the post' },
              },
              required: ['post_url'],
            },
          },
          {
            type: 'function',
            name: 'post_reply',
            description: 'Post a reply on X (via API) or Threads (via browser). ALWAYS confirm with the user first.',
            parameters: {
              type: 'object',
              properties: {
                platform: { type: 'string', enum: ['x', 'threads'] },
                text: { type: 'string', description: 'Reply text' },
                post_url: { type: 'string', description: 'URL of the post' },
                tweet_id: { type: 'string', description: 'For X: tweet ID to reply to' },
              },
              required: ['platform', 'text', 'post_url'],
            },
          },
          {
            type: 'function',
            name: 'schedule_post',
            description: 'Schedule, list, or cancel social media posts.',
            parameters: {
              type: 'object',
              properties: {
                action: { type: 'string', enum: ['schedule', 'list', 'cancel'] },
                platform: { type: 'string', enum: ['x', 'threads'] },
                text: { type: 'string' },
                scheduled_time: { type: 'string', description: 'ISO 8601 datetime' },
                post_id: { type: 'string', description: 'For cancel action' },
              },
              required: ['action'],
            },
          },
        )

        const session: Record<string, unknown> = {
          modalities: isEL ? ['text'] : ['text', 'audio'],
          instructions,
          input_audio_format: 'pcm16',
          turn_detection: { type: 'server_vad', threshold: 0.8, prefix_padding_ms: 500, silence_duration_ms: 700 },
          input_audio_transcription: { model: 'whisper-1', language: 'en' },
          tools,
        }
        if (!isEL) {
          session.voice = voice
          session.output_audio_format = 'pcm16'
        }

        ws.send(JSON.stringify({ type: 'session.update', session }))

        try { await startMic(ws) } catch (err) {
          setErrorMessage(err instanceof Error ? err.message : 'Microphone access denied')
          ws.close()
          return
        }
        isOpenRef.current = true
        setS('listening')
      }

      ws.onmessage = (ev) => { try { onMsg(JSON.parse(ev.data as string)) } catch {} }
      ws.onerror = (e) => {
        console.error('[voice] WebSocket error:', e)
        setErrorMessage(`WebSocket connection failed (${wsUrl})`)
      }
      ws.onclose = (ev) => {
        console.warn('[voice] WebSocket closed:', ev.code, ev.reason)
        if (isOpenRef.current) {
          isOpenRef.current = false
          stopMic()
          stopPlay()
          if (ev.code !== 1000) {
            const detail = ev.reason || 'code ' + String(ev.code)
            setErrorMessage('Connection closed: ' + detail)
          }
        }
        setS('idle')
      }

      wsRef.current = ws
    } catch (err) {
      console.error('[Realtime] open error:', err)
      setErrorMessage(err instanceof Error ? err.message : 'Failed to connect')
    }
  }, [model, voice, isEL, startMic, onMsg, stopMic, stopPlay, setS])

  const close = useCallback(() => {
    const cId = convIdRef.current
    isOpenRef.current = false
    stopPlay()
    stopMic()
    wsRef.current?.close()
    wsRef.current = null
    setAiText('')
    setTranscript('')
    setInterimTranscript('')
    setErrorMessage(null)
    setS('idle')
    aiAccRef.current = ''
    userRef.current = ''
    elBufRef.current = ''
    elDoneRef.current = false

    if (cId) {
      fetch('/api/jarvis-memory/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: cId }),
      }).catch(e => console.warn('[memory] summarize failed:', e))
    }
    convIdRef.current = null
    memoryRef.current = null
  }, [stopPlay, stopMic, setS])

  const bargeIn = useCallback(() => {
    if (stateRef.current !== 'speaking' && stateRef.current !== 'thinking') return
    stopPlay()
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'response.cancel' }))
      wsRef.current.send(JSON.stringify({ type: 'input_audio_buffer.clear' }))
    }
    aiAccRef.current = ''
    setAiText('')
    setS('listening')
  }, [stopPlay, setS])

  // ── Vision context injection ────────────────────────────────────────────────
  const prevVisionRef = useRef<string>('')
  useEffect(() => {
    if (!visionContext?.connected || !isOpenRef.current) return
    const ws = wsRef.current
    if (ws?.readyState !== WebSocket.OPEN) return

    const summary = formatVisionForSession(visionContext)
    if (summary === prevVisionRef.current) return
    prevVisionRef.current = summary

    ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'system',
        content: [{ type: 'input_text', text: summary }],
      },
    }))
  }, [visionContext])

  useEffect(() => {
    return () => {
      isOpenRef.current = false
      wsRef.current?.close()
      stopPlay()
      stopMic()
    }
  }, [stopPlay, stopMic])

  return {
    state, transcript, interimTranscript, aiText,
    isSupported: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof WebSocket !== 'undefined',
    errorMessage, open, close, bargeIn,
  }
}
