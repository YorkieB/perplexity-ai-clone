# AI Search Engine

A production-ready, highly responsive AI-powered search engine built with React, TypeScript, and Tailwind CSS. Features real-time web search integration, workspace organization, and persistent conversation threads.

## Documentation

- **[Telescope analysis (Perplexity reference + this repo coverage)](docs/PERPLEXITY-TELESCOPE-ANALYSIS.md)** — full layer-by-layer product breakdown and gap matrix.

## 🚀 Features

- **Real-Time Web Search**: Integration with Tavily Search API for current, verifiable web data
- **AI-Powered Responses**: Advanced language model responses with source attribution
- **Workspace Organization**: Create custom workspaces with tailored AI behavior via system prompts
- **Persistent Threads**: Conversation history saved across sessions
- **Advanced Analysis Mode**: Toggle for comprehensive, in-depth responses
- **Voice Input (Browser Support)**: Optional microphone dictation in the query box via the Web Speech API
- **Auto Model Routing (Optional)**: Local heuristic routes short prompts to GPT-4o Mini and longer/complex prompts to GPT-4o, with manual override
- **Local Usage Estimate**: Approximate character/token counts from recent messages (local estimate only, not billing data)
- **Privacy Export**: One-click export of app-owned local data (`threads`, `workspaces`, `user-settings`) as JSON
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
4. **Use Voice Input**: Click the microphone button in supported browsers (HTTPS/localhost)
5. **Choose Model Strategy**: Pick a manual model or enable Auto model routing
6. **View Sources**: Click on source cards to open the original web pages
7. **Access History**: All conversations are saved in the Library sidebar

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
