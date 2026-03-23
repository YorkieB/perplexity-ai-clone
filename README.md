# AI Search Engine

A production-ready, highly responsive AI-powered search engine built with React, TypeScript, and Tailwind CSS. Features real-time web search integration, workspace organization, and persistent conversation threads.

## Documentation

- **[Roadmap batches (overnight runs)](docs/ROADMAP-BATCHES.md)** — **Batches 7–10** complete ([7](docs/BATCH-07-COMPLETE.md), [8](docs/BATCH-08-COMPLETE.md), [9](docs/BATCH-09-COMPLETE.md), [10](docs/BATCH-10-COMPLETE.md)); batch [prompts](docs/batches/) kept as templates.
- **[Telescope analysis (Perplexity reference)](docs/PERPLEXITY-TELESCOPE-ANALYSIS.md)** — layer-by-layer product breakdown (reference taxonomy).
- **[Agent verification checklist](docs/AGENT-VERIFICATION.md)** — install deps, run `npm run verify`, CI expectations before moving on.
- **[Phase 1 AI prompt](docs/PHASE-01-AI-PROMPT.md)** — copy-paste instructions for the first implementation slice (“Include web” + context routing).
- **[Phase 1 complete (summary)](docs/PHASE-01-COMPLETE.md)** — what shipped on PR #8 (`includeWebSearch`, UI, verification).
- **[Phase 2 AI prompt](docs/PHASE-02-AI-PROMPT.md)** — thread history in LLM + focus mode when web is off.
- **[Phase 2 complete (summary)](docs/PHASE-02-COMPLETE.md)** — chat `messages`, `threadContext.ts`, focus disabled when web off (PR #8).
- **[Phase 3 AI prompt](docs/PHASE-03-AI-PROMPT.md)** — Model Council uses same thread history as main chat.
- **[Phase 3 complete (summary)](docs/PHASE-03-COMPLETE.md)** — `executeModelCouncil` + priors, shared system/user builders (PR #8).
- **[Phase 4 AI prompt](docs/PHASE-04-AI-PROMPT.md)** — global answer instructions + privacy (clear threads/workspaces).
- **[Phase 4 complete (summary)](docs/PHASE-04-COMPLETE.md)** — `UserSettings` answer fields, `buildAssistantSystemContent`, Privacy tab (PR #8).
- **[Phase 5 AI prompt](docs/PHASE-05-AI-PROMPT.md)** — export / copy thread & answers as Markdown (Pages-lite, client-only).
- **[Phase 5 complete (summary)](docs/PHASE-05-COMPLETE.md)** — `exportMarkdown.ts`, `ThreadExportActions`, download & clipboard (PR #8).
- **[Phase 6 AI prompt](docs/PHASE-06-AI-PROMPT.md)** — default model, theme (next-themes), **real** desktop notifications (Permission API + notify when tab hidden).
- **[Phase 6 complete (summary)](docs/PHASE-06-COMPLETE.md)** — defaults, appearance, notifications wiring (governance: no stubs).

## 🚀 Features

- **Markdown export**: Download or copy threads and the last answer as `.md` (client-side; sources & model-council blocks included).
- **Search transparency (Batch 7)**: Deduplicated sources, domain-grouped citations, collapsible **Search steps** after successful web search, consistent follow-up questions (when merged from `cursor/search-transparency-and-sources-76d9`).
- **Deep Research (Batch 8)**: Planner → sequential sub-searches → synthesis, progress UI, metadata on messages; requires **Include web** (when merged from `cursor/deep-research-flow-9fd2`).
- **Workspace knowledge (Batch 9)**: Per-workspace **Include web** (override vs global), **workspace files** in prompts, sidebar filter/badges, shared defaults in **`defaults.ts`** (when merged from `cursor/workspace-knowledge-parity-aec2`).
- **Platform polish (Batch 10)**: **Voice** input (Web Speech API + fallback), **export all local data** (JSON), optional **Auto model** heuristic (honest copy), **local usage** estimates in the header (when merged from `cursor/platform-voice-data-b2e3`).
- **Real-Time Web Search**: Integration with Tavily Search API for current, verifiable web data
- **AI-Powered Responses**: Advanced language model responses with source attribution
- **Workspace Organization**: Create custom workspaces with tailored AI behavior via system prompts
- **Persistent Threads**: Conversation history saved across sessions
- **Advanced Analysis Mode**: Toggle for comprehensive, in-depth responses
- **Dark Mode UI**: Sophisticated, minimalist interface optimized for extended use
- **Source Citations**: Every AI response includes clickable sources from real web searches

## 🛠️ Setup

### Prerequisites

- Node.js and npm installed
- An [OpenAI](https://platform.openai.com/) API key (or any OpenAI-compatible endpoint; set `OPENAI_BASE_URL` if needed)
- Optional: a [Tavily](https://tavily.com) API key for live web search

### Installation

1. Clone this repository or open in your Codespace

2. Install dependencies:
```bash
npm install
```

3. Configure your environment variables:
   - Copy `.env.example` to `.env`
   - Add at minimum **`OPENAI_API_KEY`** (used only by the local Vite dev/preview proxy at `/api/llm`, not embedded in the client bundle)
   - Optionally add **`VITE_TAVILY_API_KEY`** for web search

```bash
OPENAI_API_KEY=your_openai_key
VITE_TAVILY_API_KEY=your_tavily_key
```

4. Start the development server:
```bash
npm run dev
```

## 🔑 API Configuration

- **LLM**: Chat completions go to `POST /api/llm` during `npm run dev` and `npm run preview`, which proxies to OpenAI (or `OPENAI_BASE_URL`) using `OPENAI_API_KEY`. For static hosting without Node, you must provide your own backend or serverless route that implements the same proxy.
- **Search**: With `VITE_TAVILY_API_KEY`, the app calls Tavily for sources; without it, search is disabled but the assistant can still answer from the model and any attached files.

**Important**: Never commit your `.env` file or hardcode API keys in the source code.

## 📖 Usage

1. **Start a Search**: Type your query in the main input area and press Enter
2. **Create Workspaces**: Organize research by topic with custom system prompts
3. **Enable Advanced Mode**: Toggle for more comprehensive, detailed analysis
4. **View Sources**: Click on source cards to open the original web pages
5. **Access History**: All conversations are saved in the Library sidebar

## 🏗️ Architecture

- **Frontend**: React 19 with TypeScript
- **Styling**: Tailwind CSS with custom dark theme
- **UI Components**: shadcn/ui component library
- **State Management**: React hooks with `localStorage` persistence (threads, workspaces, settings)
- **API Integration**: Tavily Search API (optional) for real-time web data
- **AI Integration**: OpenAI-compatible chat completions via the dev/preview `/api/llm` proxy (default model GPT-4o-mini)

## 📁 Project Structure

```
src/
├── components/          # React components
│   ├── ui/             # shadcn UI components
│   ├── AppSidebar.tsx  # Navigation sidebar
│   ├── Message.tsx     # Chat message display
│   └── ...
├── lib/
│   ├── api.ts          # Tavily API integration
│   ├── types.ts        # TypeScript interfaces
│   └── helpers.ts      # Utility functions
├── App.tsx             # Main application component
└── index.css           # Global styles and theme
```

## 🎨 Customization

The application uses a sophisticated dark theme with customizable colors. Edit `src/index.css` to modify:

- Color palette (oklch values)
- Typography (Space Grotesk & Inter fonts)
- Border radius and spacing
- Component-specific styling

## 🔒 Security

- API keys are managed via environment variables
- No sensitive data is hardcoded in the frontend
- All API calls are properly authenticated
- Error messages don't expose internal details

## 📄 License

The Spark Template files and resources from GitHub are licensed under the terms of the MIT license, Copyright GitHub, Inc.
