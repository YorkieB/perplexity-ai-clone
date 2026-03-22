# AI Search Engine

A production-ready, highly responsive AI-powered search engine built with React, TypeScript, and Tailwind CSS. Features real-time web search integration, workspace organization, and persistent conversation threads.

## 🚀 Features

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
- A Tavily API key (get one at [tavily.com](https://tavily.com))

### Installation

1. Clone this repository or open in your Codespace

2. Install dependencies:
```bash
npm install
```

3. Configure your environment variables:
   - Copy `.env.example` to `.env`
   - Add your Tavily API key to `.env`:
```bash
VITE_TAVILY_API_KEY=your_actual_api_key_here
```

4. Start the development server:
```bash
npm run dev
```

## 🔑 API Configuration

This application requires a Tavily Search API key to function properly. The web search integration:

- Executes advanced depth searches for high-quality results
- Retrieves up to 6 relevant sources per query
- Passes real-time web data as context to the language model
- Gracefully degrades if the API is unavailable (AI continues with base knowledge)

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
- **State Management**: React hooks with persistent KV storage
- **API Integration**: Tavily Search API for real-time web data
- **AI Integration**: Spark LLM API with GPT-4o-mini

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
