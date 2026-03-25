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
import { searchStories, getStoryContent, getRandomStory, continueReading, jumpToPage, getCurrentBook } from '@/lib/story-api'
import { postTweet, readSocialFeed, readComments, replyViaBrowser } from '@/lib/social-api'
import { quickScan } from '@/lib/hallucination-guard'
import { schedulePost, listScheduledPostsSummary, cancelScheduledPost } from '@/lib/social-scheduler'
import { getVoiceThinkingPrompt } from '@/lib/thinking-engine'
import { analyzeExchangeAsync, getLearnedContext, getLearningStats } from '@/lib/learning-engine'
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
  micMuted: boolean
  toggleMicMute: () => void
}

// ─── Story voice output helpers ──────────────────────────────────────────────

function stripStoryMetaForVoice(output: string, hasMore: boolean): string {
  let text = output
    .replace(/\[AUTO-CONTINUE:[^\]]*\]/g, '')
    .replace(/📖\s*.+\n/g, '')
    .replace(/Author:\s*.+\n/g, '')
    .replace(/Pages:\s*.+\n/g, '')
    .replace(/Source:\s*.+\n/g, '')
    .replace(/📄\s*Page \d+ of \d+\..*/g, '')
    .replace(/📕\s*End of book\..*/g, '')
    .replace(/---\s*$/gm, '')
    .trim()
  const directive = hasMore
    ? '[MANDATORY RULE: Read ONLY the book text below word for word. When you reach the end, just STOP. Do NOT say anything else — no "shall I continue", no "would you like to keep reading", no commentary. Just read and stop.]\n\n'
    : '[Read the final passage of this book. When done, say "That is the end of the book."]\n\n'
  return directive + text
}

const CONTINUE_QUESTION_RE = /\b(would you like (me to |to )?(continue|keep (going|reading)|read more|go on)|shall I (continue|keep (going|reading)|go on)|want (me to )?(continue|keep (going|reading))|ready for (the next|more)|let me know (if|when)|should I (continue|keep|go on))\b[?.!]*/gi

function stripContinuationQuestions(text: string): string {
  return text
    .replace(CONTINUE_QUESTION_RE, '')
    .replace(/\bCertainly!\s*/g, '')
    .replace(/\bSure!\s*/g, '')
    .replace(/\bOf course!\s*/g, '')
    .replace(/\bAbsolutely!\s*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
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
  learnedContext?: string
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

=== JARVIS IDE (Full Autonomous Control) ===
You have COMPLETE AUTONOMOUS CONTROL of a full-featured IDE. You can create, edit, run, debug, navigate, configure, and manage everything yourself.

FILE MANAGEMENT:
- show_code: Display code in the IDE (quick way to create a file).
- ide_create_file: Create a new file with a filename, code, and language.
- ide_edit_file: Replace the entire content of a file by ID.
- ide_delete_file: Remove a file from the IDE.
- ide_rename_file: Rename a file.
- ide_open_file: Switch the active tab to a file.
- ide_get_files: List all open files with IDs.
- ide_read_file: Read the contents of a file (or the active file).
- ide_create_from_template: Create a new file from a template (HTML Page, React Component, Python Script, Express Server, CSS Stylesheet, JSON Config, Markdown README, Python Flask API).

EDITING:
- ide_replace_text: Find and replace text in the active file. Use for targeted fixes.
- ide_find_in_file: Search for text in the active file (returns line numbers).
- ide_search_all_files: Search across ALL open files (returns file, line, text).
- ide_go_to_line: Jump the cursor to a specific line number.
- ide_format_document: Auto-format the current document.

EXECUTION & DEBUGGING:
- run_code: Execute Python or JavaScript code directly and return output.
- ide_run_and_fix: Run the active file and return results with error detection.
- ide_get_problems: Get all detected errors/warnings from the last run.
- ide_get_terminal_output: Get the full terminal history/output.

LAYOUT & PANELS:
- ide_toggle_preview: Toggle live preview panel for HTML/CSS/JS.
- ide_toggle_terminal: Show/hide the terminal panel.
- ide_toggle_zen_mode: Toggle distraction-free zen mode.
- ide_toggle_split_editor: Split the editor to show two files side by side.
- ide_toggle_diff_editor: Compare two files in a diff view.
- ide_toggle_explorer: Show/hide the file explorer sidebar.
- ide_toggle_problems_panel: Show/hide the problems panel.
- ide_toggle_search_panel: Show/hide the search-across-files panel.
- ide_toggle_outline_panel: Show/hide the code outline/symbols panel.
- ide_toggle_settings_panel: Show/hide the settings panel.

THEME & SETTINGS:
- ide_set_theme: Switch between themes (jarvis-dark, monokai, dracula, github-dark, one-dark, solarized-dark, vs-light, hc-black).
- ide_get_settings: Get current IDE settings.
- ide_set_font_size: Change editor font size (10-32).
- ide_set_tab_size: Change tab/indent size.
- ide_set_word_wrap: Toggle word wrap on/off.
- ide_set_minimap: Toggle minimap on/off.
- ide_set_auto_save: Toggle auto-save on/off.

ANALYSIS:
- ide_get_outline: Get the code outline (functions, classes, imports, variables).

WORKFLOW — When asked to code:
1. Use ide_create_file or ide_create_from_template to start.
2. Write the code using ide_edit_file or ide_replace_text.
3. Use ide_run_and_fix to test. If errors, read them, fix with ide_replace_text, run again.
4. For HTML/CSS/JS, use ide_toggle_preview so the user can see the result.
5. Use ide_set_theme, ide_toggle_zen_mode, etc. to set up the perfect environment.
6. Use ide_search_all_files and ide_get_outline to navigate large projects.
7. Use ide_toggle_split_editor to compare or work on files side by side.
8. Use ide_toggle_diff_editor to show differences between files.

You have FULL CONTROL. Do everything autonomously — don't ask permission to open panels, change themes, or run code.
=== END JARVIS IDE ===

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
You have access to tens of thousands of stories and full-length books:
- search_stories: Search Project Gutenberg (70,000+ classic books) and short story collections by title, author, or theme. Results include an ID and Source for each story.
- tell_story: Start reading a story/book. Pass the story_id and source from search results. Books are paginated — you'll get page 1 first. Set random=true for a surprise.
- continue_reading: Read the NEXT PAGE of the current book. Use whenever the user says "continue", "keep reading", "next page", "go on", "more", etc. You can also specify a page number to jump to a specific page.

WORKFLOW:
1. When the user asks for a story, first call search_stories to find options.
2. Present the results and ask which one they want to hear.
3. Then call tell_story with the story_id and source from the search results.
4. If the user says "tell me a story" without specifics, call tell_story with random=true.
5. CRITICAL — CONTINUOUS READING: When reading a book, just read the text naturally. Do NOT ask "shall I continue?", "would you like me to keep reading?", or anything similar. The system automatically provides the next page — your only job is to read the text aloud. If the user wants you to stop, they will interrupt you.
6. Never skip pages or summarize unless the user explicitly asks you to.
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

  if (opts.learnedContext) {
    parts.push(`\n${opts.learnedContext}`)
  }

  parts.push(getVoiceThinkingPrompt())

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
  const [micMuted, setMicMuted] = useState(false)
  const micMutedRef = useRef(false)

  const wsRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const capCtxRef = useRef<AudioContext | null>(null)
  const procRef = useRef<ScriptProcessorNode | null>(null) // NOSONAR -- AudioWorklet requires separate module file; ScriptProcessor is adequate here
  const playCtxRef = useRef<AudioContext | null>(null)
  const isOpenRef = useRef(false)
  const stateRef = useRef<VoicePipelineState>('idle')
  const bargeInTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoReadRef = useRef<{ pending: boolean }>({ pending: false })
  const directTTSRef = useRef(false)
  const triggerAutoReadRef = useRef<() => boolean>(() => false)
  const processElQueueRef = useRef<() => void>(() => {})
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

  const triggerAutoRead = useCallback(() => {
    if (!autoReadRef.current.pending || !isOpenRef.current) return false
    autoReadRef.current.pending = false
    const book = getCurrentBook()
    if (!book) return false
    setS('thinking')
    void (async () => {
      let output: string
      try {
        const fetchPromise = continueReading()
        const timeout = new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Page fetch timed out.')), 25000))
        output = await Promise.race([fetchPromise, timeout])
      } catch (e) {
        output = `Auto-read error: ${e instanceof Error ? e.message : String(e)}`
        autoReadRef.current.pending = false
      }
      autoReadRef.current.pending = output.includes('[AUTO-CONTINUE:')
      output = stripStoryMetaForVoice(output, autoReadRef.current.pending)

      // ElevenLabs path: bypass the LLM entirely and send text straight to TTS
      if (isEL) {
        directTTSRef.current = true
        const rawText = output.replace(/\[MANDATORY RULE:[^\]]*\]/g, '').replace(/\[Read the final[^\]]*\]/g, '').trim()
        if (rawText) {
          const chunks = parseBehavioralMarkup(rawText, voiceMapRef.current)
          elQueueRef.current.push(...chunks)
          elDoneRef.current = true
          processElQueueRef.current()
        }
        return
      }

      // Native audio path: use per-response instructions override
      const ws = wsRef.current
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'conversation.item.create',
          item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: output }] },
        }))
        ws.send(JSON.stringify({
          type: 'response.create',
          response: {
            instructions: 'Read the book text aloud, word for word. Do NOT add any commentary, questions, or ask if the user wants to continue. Just read and stop.',
          },
        }))
      } else {
        setS('listening')
      }
    })()
    return true
  }, [isEL, setS])
  triggerAutoReadRef.current = triggerAutoRead

  const finishTurn = useCallback(() => {
    if (userRef.current && aiAccRef.current) {
      const cleanAi = stripBehavioralMarkup(aiAccRef.current)
      onResRef.current?.(userRef.current, cleanAi)
      saveTurnToMemory(userRef.current, cleanAi)

      analyzeExchangeAsync(userRef.current, cleanAi)

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
      if (!isOpenRef.current) return
      aiAccRef.current = ''
      directTTSRef.current = false
      if (triggerAutoReadRef.current()) return
      setS('listening')
      setInterimTranscript('')
    }, rem + 80)
  }, [setS, saveTurnToMemory])

  const processElQueue = useCallback(async () => {
    if (elBusyRef.current) return
    elBusyRef.current = true
    let hadError = false

    while (elQueueRef.current.length > 0 && isOpenRef.current) {
      const chunk = elQueueRef.current.shift()!
      // When reading a book, strip any "would you like to continue?" the LLM adds
      if (autoReadRef.current.pending && !chunk.isSfx) {
        chunk.text = stripContinuationQuestions(chunk.text)
        if (!chunk.text) continue
      }
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
  processElQueueRef.current = processElQueue

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
      audio: { sampleRate: SAMPLE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false },
    })
    streamRef.current = stream
    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
    capCtxRef.current = ctx
    const src = ctx.createMediaStreamSource(stream)
    const proc = ctx.createScriptProcessor(2048, 1, 1) // NOSONAR -- AudioWorklet requires separate module file
    procRef.current = proc
    proc.onaudioprocess = (e) => { // NOSONAR -- deprecated but AudioWorklet alternative is disproportionate here
      if (ws.readyState !== WebSocket.OPEN) return
      if (micMutedRef.current) return
      const samples = e.inputBuffer.getChannelData(0)

      // Energy gate: when Jarvis is speaking, suppress mic input unless
      // the user is genuinely talking (high energy). This prevents speaker
      // output bleeding back into the mic from triggering barge-in.
      if (stateRef.current === 'speaking') {
        let sumSq = 0
        for (let i = 0; i < samples.length; i++) sumSq += samples[i] * samples[i]
        const rms = Math.sqrt(sumSq / samples.length)
        if (rms < 0.06) return // below threshold — likely speaker bleed, discard
      }

      const pcm = float32ToPcm16(samples)
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
        if (stateRef.current === 'speaking' || stateRef.current === 'thinking') {
          // Debounce barge-in: wait 250ms to confirm it's real user speech,
          // not speaker bleed that slipped past the energy gate.
          if (!bargeInTimerRef.current) {
            bargeInTimerRef.current = setTimeout(() => {
              bargeInTimerRef.current = null
              if (stateRef.current === 'speaking' || stateRef.current === 'thinking') {
                autoReadRef.current.pending = false
                stopPlay()
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                  wsRef.current.send(JSON.stringify({ type: 'response.cancel' }))
                }
                aiAccRef.current = ''
                setAiText('')
                setInterimTranscript('Listening…')
                setS('listening')
                elBufRef.current = ''
                elDoneRef.current = false
              }
            }, 250)
          }
        } else {
          stopPlay()
          aiAccRef.current = ''
          setAiText('')
          setInterimTranscript('Listening…')
          setS('listening')
          elBufRef.current = ''
          elDoneRef.current = false
        }
        break

      case 'input_audio_buffer.speech_stopped':
        // If speech stopped while a debounced barge-in is pending and
        // Jarvis is still speaking, it was likely brief speaker bleed —
        // cancel the pending interruption and let Jarvis continue.
        if (bargeInTimerRef.current) {
          clearTimeout(bargeInTimerRef.current)
          bargeInTimerRef.current = null
          break
        }
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
          if (directTTSRef.current) break // suppress LLM text while doing direct TTS (story reading)
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
        if (isEL) {
          if (directTTSRef.current) { elBufRef.current = ''; break } // suppress during direct TTS
          if (elBufRef.current.trim()) {
            const finalChunks = parseBehavioralMarkup(elBufRef.current.trim(), voiceMapRef.current)
            elQueueRef.current.push(...finalChunks)
            elBufRef.current = ''
            processElQueue()
          }
        }
        break

      case 'response.done': {
        // Skip cancelled responses (e.g. from story reading where we cancel the auto-response)
        const respStatus = (msg.response as Record<string, unknown> | undefined)?.status as string | undefined
        if (respStatus === 'cancelled') {
          directTTSRef.current = false
          break
        }

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
            if (!isOpenRef.current) return
            if (triggerAutoReadRef.current()) return
            setS('listening')
            setInterimTranscript('')
          }, rem + 80)
        }
        break
      }

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
            setTimeout(() => {
              const c2 = codeEditorRef.current
              if (c2) c2.showCode(args.code!, args.language!, args.filename)
            }, 400)
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

        } else if (fnName.startsWith('ide_') || fnName === 'ide_toggle_preview') {
          let args: Record<string, unknown> = {}
          try { args = JSON.parse(msg.arguments as string) } catch {}
          if (!callId) break

          setS('thinking')
          void (async () => {
            let ctrl = codeEditorRef.current
            if (!ctrl) {
              openCodeEditorRef.current?.()
              await new Promise(r => setTimeout(r, 400))
              ctrl = codeEditorRef.current
            }
            if (!ctrl) {
              const ws = wsRef.current
              if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: 'IDE is not available. Ask the user to open it.' } }))
                ws.send(JSON.stringify({ type: 'response.create' }))
              }
              return
            }
            let output = ''
            try {
              switch (fnName) {
                case 'ide_create_file': {
                  const id = ctrl.createFile(args.filename as string, args.code as string || '', args.language as string || 'javascript')
                  output = `File "${args.filename}" created (ID: ${id}).`
                  break
                }
                case 'ide_edit_file':
                  output = ctrl.editFile(args.file_id as string, args.new_code as string) ? 'File updated.' : 'File not found.'
                  break
                case 'ide_replace_text': {
                  const count = ctrl.replaceText(args.search as string, args.replace as string || '', !!args.replace_all)
                  output = count > 0 ? `Replaced ${count} occurrence(s).` : 'No matches found.'
                  break
                }
                case 'ide_get_files': {
                  const files = ctrl.getFiles()
                  const active = ctrl.getActiveFile()
                  output = files.length === 0 ? 'No files open.'
                    : files.map(f => `${f.id === active?.id ? '→ ' : '  '}${f.filename} [${f.language}] (ID: ${f.id})`).join('\n')
                  break
                }
                case 'ide_read_file': {
                  const fid = args.file_id as string | undefined
                  if (fid) {
                    const content = ctrl.getFileContent(fid)
                    output = content != null ? content : 'File not found.'
                  } else {
                    const af = ctrl.getActiveFile()
                    output = af ? `File: ${af.filename}\n---\n${af.code}` : 'No active file.'
                  }
                  break
                }
                case 'ide_open_file':
                  output = ctrl.openFile(args.file_id as string) ? 'File opened.' : 'File not found.'
                  break
                case 'ide_delete_file':
                  output = ctrl.deleteFile(args.file_id as string) ? 'File deleted.' : 'File not found.'
                  break
                case 'ide_run_and_fix': {
                  const af = ctrl.getActiveFile()
                  if (!af) { output = 'No active file.'; break }
                  const result = await ctrl.runActiveFile()
                  let o = ''
                  if (result.stdout) o += `[stdout]\n${result.stdout}\n`
                  if (result.stderr) o += `[stderr]\n${result.stderr}\n`
                  if (result.error) o += `[error]\n${result.error}\n`
                  if (!o.trim()) o = '(no output)'
                  const hasErr = !!(result.error || result.stderr)
                  output = `Ran "${af.filename}" in ${result.elapsed}ms.\n${o}${hasErr ? '\n⚠️ Errors detected. Use ide_replace_text to fix them.' : '\n✅ No errors.'}`
                  break
                }
                case 'ide_find_in_file': {
                  const matches = ctrl.findInFile(args.query as string)
                  output = matches.length === 0 ? 'No matches.'
                    : `Found ${matches.length} match(es):\n${matches.slice(0, 20).map(m => `  Line ${m.line}, Col ${m.column}: ${m.text}`).join('\n')}`
                  break
                }
                case 'ide_toggle_preview':
                  ctrl.togglePreview()
                  output = 'Preview toggled.'
                  break
                case 'ide_create_from_template': {
                  const id = ctrl.createFromTemplate(args.template_name as string)
                  output = id ? `File created from template "${args.template_name}" (ID: ${id}).` : `Template "${args.template_name}" not found. Available: ${ctrl.getAvailableTemplates().join(', ')}`
                  break
                }
                case 'ide_search_all_files': {
                  const results = ctrl.searchAllFiles(args.query as string)
                  output = results.length === 0 ? 'No matches across files.'
                    : `Found ${results.length} match(es):\n${results.slice(0, 20).map(r => `  ${r.filename}:${r.line}: ${r.text}`).join('\n')}`
                  break
                }
                case 'ide_go_to_line':
                  ctrl.goToLine(args.line as number)
                  output = `Jumped to line ${args.line}.`
                  break
                case 'ide_format_document':
                  ctrl.formatDocument()
                  output = 'Document formatted.'
                  break
                case 'ide_get_problems': {
                  const probs = ctrl.getProblems()
                  output = probs.length === 0 ? 'No problems detected.'
                    : `${probs.length} problem(s):\n${probs.map(p => `  ${p.source}:${p.line}:${p.column} [${p.severity}] ${p.message}`).join('\n')}`
                  break
                }
                case 'ide_get_terminal_output':
                  output = ctrl.getTerminalOutput() || '(terminal is empty)'
                  break
                case 'ide_toggle_terminal':
                  ctrl.toggleTerminal()
                  output = 'Terminal toggled.'
                  break
                case 'ide_toggle_zen_mode':
                  ctrl.toggleZenMode()
                  output = 'Zen mode toggled.'
                  break
                case 'ide_toggle_split_editor':
                  ctrl.toggleSplitEditor(args.file_id as string | undefined)
                  output = 'Split editor toggled.'
                  break
                case 'ide_toggle_diff_editor':
                  ctrl.toggleDiffEditor(args.target_file_id as string | undefined)
                  output = 'Diff editor toggled.'
                  break
                case 'ide_toggle_explorer':
                  ctrl.toggleExplorer()
                  output = 'Explorer toggled.'
                  break
                case 'ide_toggle_problems_panel':
                  ctrl.toggleProblemsPanel()
                  output = 'Problems panel toggled.'
                  break
                case 'ide_toggle_search_panel':
                  ctrl.toggleSearchPanel()
                  output = 'Search panel toggled.'
                  break
                case 'ide_toggle_outline_panel':
                  ctrl.toggleOutlinePanel()
                  output = 'Outline panel toggled.'
                  break
                case 'ide_toggle_settings_panel':
                  ctrl.toggleSettingsPanel()
                  output = 'Settings panel toggled.'
                  break
                case 'ide_set_theme':
                  ctrl.setTheme(args.theme_id as string)
                  output = `Theme changed to "${args.theme_id}".`
                  break
                case 'ide_get_settings':
                  output = JSON.stringify(ctrl.getSettings(), null, 2)
                  break
                case 'ide_set_font_size':
                  ctrl.setFontSize(args.size as number)
                  output = `Font size set to ${args.size}.`
                  break
                case 'ide_set_tab_size':
                  ctrl.setTabSize(args.size as number)
                  output = `Tab size set to ${args.size}.`
                  break
                case 'ide_set_word_wrap':
                  ctrl.setWordWrap(!!args.enabled)
                  output = `Word wrap ${args.enabled ? 'enabled' : 'disabled'}.`
                  break
                case 'ide_set_minimap':
                  ctrl.setMinimap(!!args.enabled)
                  output = `Minimap ${args.enabled ? 'enabled' : 'disabled'}.`
                  break
                case 'ide_set_auto_save':
                  ctrl.setAutoSave(!!args.enabled)
                  output = `Auto-save ${args.enabled ? 'enabled' : 'disabled'}.`
                  break
                case 'ide_get_outline': {
                  const symbols = ctrl.getOutlineSymbols()
                  output = symbols.length === 0 ? 'No symbols found in the current file.'
                    : `${symbols.length} symbol(s):\n${symbols.map(s => `  Line ${s.line}: [${s.kind}] ${s.name}`).join('\n')}`
                  break
                }
                case 'ide_get_available_templates':
                  output = `Available templates:\n${ctrl.getAvailableTemplates().map(t => `  - ${t}`).join('\n')}`
                  break
                case 'ide_get_available_themes':
                  output = `Available themes:\n${ctrl.getAvailableThemes().map(t => `  - ${t.id}: ${t.label}`).join('\n')}`
                  break
                default:
                  output = `Unknown IDE command: ${fnName}`
              }
            } catch (e) {
              output = `IDE error: ${e instanceof Error ? e.message : String(e)}`
            }
            const ws = wsRef.current
            if (ws?.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output } }))
              ws.send(JSON.stringify({ type: 'response.create' }))
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
          let args: { story_id?: string; source?: string; random?: boolean; genre?: string; page?: number } = {}
          try { args = JSON.parse(msg.arguments as string) } catch {}
          if (!callId) break

          setS('thinking')
          void (async () => {
            let output: string
            try {
              const fetchPromise = args.random
                ? getRandomStory(args.genre)
                : args.story_id && args.source
                  ? getStoryContent(args.story_id, args.source as 'gutenberg' | 'huggingface', args.page || 1)
                  : Promise.resolve('Missing story_id or source. Search for stories first with search_stories, or set random=true.')
              const timeout = new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Story fetch timed out after 25 seconds. The server may be slow — please try again.')), 25000))
              output = await Promise.race([fetchPromise, timeout])
            } catch (e) {
              output = `Story error: ${e instanceof Error ? e.message : String(e)}`
            }
            autoReadRef.current.pending = output.includes('[AUTO-CONTINUE:')
            const ws = wsRef.current

            // ElevenLabs: bypass the LLM entirely — send book text straight to TTS
            if (isEL && ws?.readyState === WebSocket.OPEN) {
              directTTSRef.current = true // suppress any LLM text deltas
              // Complete the tool call, then immediately cancel any auto-response
              ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: '[Reading aloud]' } }))
              ws.send(JSON.stringify({ type: 'response.cancel' }))
              const rawText = stripStoryMetaForVoice(output, autoReadRef.current.pending)
                .replace(/\[MANDATORY RULE:[^\]]*\]/g, '').replace(/\[Read the final[^\]]*\]/g, '').trim()
              if (rawText) {
                const chunks = parseBehavioralMarkup(rawText, voiceMapRef.current)
                elQueueRef.current.push(...chunks)
                elDoneRef.current = true
                processElQueueRef.current()
              }
            } else if (ws?.readyState === WebSocket.OPEN) {
              // Native audio: must use LLM, use per-response instructions
              output = stripStoryMetaForVoice(output, autoReadRef.current.pending)
              ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output } }))
              ws.send(JSON.stringify({
                type: 'response.create',
                response: {
                  instructions: 'Read the book text from the function output aloud, word for word. Do NOT add any commentary, questions, summaries, or ask if the user wants to continue. Just read the text exactly as written and then stop speaking.',
                },
              }))
            } else {
              setS('listening')
            }
          })()

        } else if (fnName === 'continue_reading') {
          let args: { page?: number } = {}
          try { args = JSON.parse(msg.arguments as string) } catch {}
          if (!callId) break

          setS('thinking')
          void (async () => {
            let output: string
            try {
              const fetchPromise = typeof args.page === 'number' ? jumpToPage(args.page) : continueReading()
              const timeout = new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Page fetch timed out. Please try again.')), 25000))
              output = await Promise.race([fetchPromise, timeout])
            } catch (e) {
              output = `Continue reading error: ${e instanceof Error ? e.message : String(e)}`
            }
            autoReadRef.current.pending = output.includes('[AUTO-CONTINUE:')
            const ws = wsRef.current

            if (isEL && ws?.readyState === WebSocket.OPEN) {
              directTTSRef.current = true // suppress any LLM text deltas
              ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: '[Reading aloud]' } }))
              ws.send(JSON.stringify({ type: 'response.cancel' }))
              const rawText = stripStoryMetaForVoice(output, autoReadRef.current.pending)
                .replace(/\[MANDATORY RULE:[^\]]*\]/g, '').replace(/\[Read the final[^\]]*\]/g, '').trim()
              if (rawText) {
                const chunks = parseBehavioralMarkup(rawText, voiceMapRef.current)
                elQueueRef.current.push(...chunks)
                elDoneRef.current = true
                processElQueueRef.current()
              }
            } else if (ws?.readyState === WebSocket.OPEN) {
              output = stripStoryMetaForVoice(output, autoReadRef.current.pending)
              ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output } }))
              ws.send(JSON.stringify({
                type: 'response.create',
                response: {
                  instructions: 'Read the book text from the function output aloud, word for word. Do NOT add any commentary, questions, summaries, or ask if the user wants to continue. Just read the text exactly as written and then stop speaking.',
                },
              }))
            } else {
              setS('listening')
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

        } else if (fnName === 'learning_stats') {
          if (!callId) break
          setS('thinking')
          ;(async () => {
            try {
              const output = await getLearningStats()
              const ws = wsRef.current
              if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output } }))
                ws.send(JSON.stringify({ type: 'response.create' }))
              }
            } catch (e) {
              const ws = wsRef.current
              if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: `Learning stats error: ${e instanceof Error ? e.message : String(e)}` } }))
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
        const learnedCtx = await getLearnedContext().catch(() => '')
        const instructions = buildInstructions({
          mem: memory, hasVision: visionAvailable, hasTuneIn, hasRag, hasBrowser,
          browserGuideMode: browserGuideModeRef.current ?? false, hasMedia,
          voiceNames: registeredVoiceNames, isElevenLabs: isEL,
          hasVoiceAnalysis: vaEnabledRef.current,
          learnedContext: learnedCtx,
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
            name: 'ide_create_file',
            description: 'Create a new file in the IDE. Returns the file ID.',
            parameters: { type: 'object', properties: { filename: { type: 'string' }, code: { type: 'string' }, language: { type: 'string' } }, required: ['filename', 'code', 'language'] },
          },
          {
            type: 'function',
            name: 'ide_edit_file',
            description: 'Replace the entire content of a file in the IDE.',
            parameters: { type: 'object', properties: { file_id: { type: 'string' }, new_code: { type: 'string' } }, required: ['file_id', 'new_code'] },
          },
          {
            type: 'function',
            name: 'ide_replace_text',
            description: 'Find and replace text in the active file. Use to fix errors.',
            parameters: { type: 'object', properties: { search: { type: 'string' }, replace: { type: 'string' }, replace_all: { type: 'boolean' } }, required: ['search', 'replace'] },
          },
          {
            type: 'function',
            name: 'ide_get_files',
            description: 'List all files open in the IDE.',
            parameters: { type: 'object', properties: {} },
          },
          {
            type: 'function',
            name: 'ide_read_file',
            description: 'Read contents of a file in the IDE.',
            parameters: { type: 'object', properties: { file_id: { type: 'string' } } },
          },
          {
            type: 'function',
            name: 'ide_open_file',
            description: 'Switch the active tab to a specific file.',
            parameters: { type: 'object', properties: { file_id: { type: 'string' } }, required: ['file_id'] },
          },
          {
            type: 'function',
            name: 'ide_delete_file',
            description: 'Delete/close a file from the IDE.',
            parameters: { type: 'object', properties: { file_id: { type: 'string' } }, required: ['file_id'] },
          },
          {
            type: 'function',
            name: 'ide_run_and_fix',
            description: 'Run the active file, check for errors, and return results.',
            parameters: { type: 'object', properties: {} },
          },
          {
            type: 'function',
            name: 'ide_find_in_file',
            description: 'Search for text in the active file.',
            parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
          },
          {
            type: 'function',
            name: 'ide_toggle_preview',
            description: 'Toggle the live preview panel.',
            parameters: { type: 'object', properties: {} },
          },
          {
            type: 'function',
            name: 'ide_create_from_template',
            description: 'Create a new file from a built-in template (HTML Page, React Component, Python Script, Express Server, CSS Stylesheet, JSON Config, Markdown README, Python Flask API).',
            parameters: { type: 'object', properties: { template_name: { type: 'string', description: 'Template name' } }, required: ['template_name'] },
          },
          {
            type: 'function',
            name: 'ide_search_all_files',
            description: 'Search for text across ALL open files. Returns matching files, lines, and text.',
            parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
          },
          {
            type: 'function',
            name: 'ide_go_to_line',
            description: 'Jump the cursor to a specific line number in the active file.',
            parameters: { type: 'object', properties: { line: { type: 'number' } }, required: ['line'] },
          },
          {
            type: 'function',
            name: 'ide_format_document',
            description: 'Auto-format the current document.',
            parameters: { type: 'object', properties: {} },
          },
          {
            type: 'function',
            name: 'ide_get_problems',
            description: 'Get all detected errors/warnings from the last code run.',
            parameters: { type: 'object', properties: {} },
          },
          {
            type: 'function',
            name: 'ide_get_terminal_output',
            description: 'Get the full terminal output history.',
            parameters: { type: 'object', properties: {} },
          },
          {
            type: 'function',
            name: 'ide_toggle_terminal',
            description: 'Show or hide the terminal panel.',
            parameters: { type: 'object', properties: {} },
          },
          {
            type: 'function',
            name: 'ide_toggle_zen_mode',
            description: 'Toggle distraction-free zen mode (hides all panels except editor).',
            parameters: { type: 'object', properties: {} },
          },
          {
            type: 'function',
            name: 'ide_toggle_split_editor',
            description: 'Split the editor to show two files side by side.',
            parameters: { type: 'object', properties: { file_id: { type: 'string', description: 'Optional file ID to show in the split pane' } } },
          },
          {
            type: 'function',
            name: 'ide_toggle_diff_editor',
            description: 'Compare two files in a diff view.',
            parameters: { type: 'object', properties: { target_file_id: { type: 'string', description: 'File ID to compare against the active file' } } },
          },
          {
            type: 'function',
            name: 'ide_toggle_explorer',
            description: 'Show or hide the file explorer sidebar.',
            parameters: { type: 'object', properties: {} },
          },
          {
            type: 'function',
            name: 'ide_toggle_problems_panel',
            description: 'Show the problems panel with errors and warnings.',
            parameters: { type: 'object', properties: {} },
          },
          {
            type: 'function',
            name: 'ide_toggle_search_panel',
            description: 'Show the search-across-files panel.',
            parameters: { type: 'object', properties: {} },
          },
          {
            type: 'function',
            name: 'ide_toggle_outline_panel',
            description: 'Show the code outline/symbols panel.',
            parameters: { type: 'object', properties: {} },
          },
          {
            type: 'function',
            name: 'ide_toggle_settings_panel',
            description: 'Show the IDE settings panel.',
            parameters: { type: 'object', properties: {} },
          },
          {
            type: 'function',
            name: 'ide_set_theme',
            description: 'Change the IDE theme. Options: jarvis-dark, monokai, dracula, github-dark, one-dark, solarized-dark, vs-light, hc-black.',
            parameters: { type: 'object', properties: { theme_id: { type: 'string' } }, required: ['theme_id'] },
          },
          {
            type: 'function',
            name: 'ide_get_settings',
            description: 'Get current IDE settings (theme, font size, tab size, word wrap, minimap, auto-save).',
            parameters: { type: 'object', properties: {} },
          },
          {
            type: 'function',
            name: 'ide_set_font_size',
            description: 'Change the editor font size (10-32).',
            parameters: { type: 'object', properties: { size: { type: 'number' } }, required: ['size'] },
          },
          {
            type: 'function',
            name: 'ide_set_tab_size',
            description: 'Change the tab/indent size.',
            parameters: { type: 'object', properties: { size: { type: 'number' } }, required: ['size'] },
          },
          {
            type: 'function',
            name: 'ide_set_word_wrap',
            description: 'Toggle word wrap on or off.',
            parameters: { type: 'object', properties: { enabled: { type: 'boolean' } }, required: ['enabled'] },
          },
          {
            type: 'function',
            name: 'ide_set_minimap',
            description: 'Toggle the minimap on or off.',
            parameters: { type: 'object', properties: { enabled: { type: 'boolean' } }, required: ['enabled'] },
          },
          {
            type: 'function',
            name: 'ide_set_auto_save',
            description: 'Toggle auto-save on or off.',
            parameters: { type: 'object', properties: { enabled: { type: 'boolean' } }, required: ['enabled'] },
          },
          {
            type: 'function',
            name: 'ide_get_outline',
            description: 'Get the code outline — functions, classes, imports, and variables with line numbers.',
            parameters: { type: 'object', properties: {} },
          },
          {
            type: 'function',
            name: 'ide_get_available_templates',
            description: 'List available file templates.',
            parameters: { type: 'object', properties: {} },
          },
          {
            type: 'function',
            name: 'ide_get_available_themes',
            description: 'List available IDE themes.',
            parameters: { type: 'object', properties: {} },
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
            description: 'Start reading a story/book. Use the ID and Source from search_stories results. Books are paginated — use continue_reading for subsequent pages. Set random=true for a surprise.',
            parameters: {
              type: 'object',
              properties: {
                story_id: { type: 'string', description: 'The story ID from search_stories (e.g. "11" for Gutenberg, "hf-tinystories-1450265" for short stories)' },
                source: { type: 'string', enum: ['gutenberg', 'huggingface'], description: 'Story source from search_stories results' },
                random: { type: 'boolean', description: 'Get a random story instead (default: false)' },
                genre: { type: 'string', description: 'Genre for random stories (adventure, fairy tale, mystery, fantasy, fable, etc.)' },
                page: { type: 'number', description: 'Page number to start from (default: 1)' },
              },
              required: [],
            },
          },
          {
            type: 'function',
            name: 'continue_reading',
            description: 'Continue reading the current book — fetches the next page. You MUST call this automatically after every page when reading a book. Do NOT wait for the user to ask — keep reading until the book ends or the user says stop.',
            parameters: {
              type: 'object',
              properties: {
                page: { type: 'number', description: 'Optional page number to jump to. If omitted, reads the next page.' },
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

        tools.push({
          type: 'function',
          name: 'learning_stats',
          description: 'Show what Jarvis has learned about the user over time. Use when the user asks what you have learned or wants to see your learning progress.',
          parameters: { type: 'object', properties: {}, required: [] },
        })

        const session: Record<string, unknown> = {
          modalities: isEL ? ['text'] : ['text', 'audio'],
          instructions,
          input_audio_format: 'pcm16',
          turn_detection: { type: 'server_vad', threshold: 0.9, prefix_padding_ms: 600, silence_duration_ms: 800 },
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
    autoReadRef.current.pending = false
    directTTSRef.current = false
    if (bargeInTimerRef.current) { clearTimeout(bargeInTimerRef.current); bargeInTimerRef.current = null }
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

  const toggleMicMute = useCallback(() => {
    const next = !micMutedRef.current
    micMutedRef.current = next
    setMicMuted(next)
    // Also disable the actual mic tracks so the browser mic indicator reflects muted state
    streamRef.current?.getAudioTracks().forEach(t => { t.enabled = !next })
    // If we just muted, clear any buffered audio the server may have queued
    if (next && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'input_audio_buffer.clear' }))
    }
  }, [])

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
    errorMessage, open, close, bargeIn, micMuted, toggleMicMute,
  }
}
