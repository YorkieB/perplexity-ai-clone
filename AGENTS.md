# AGENTS.md

## Cursor Cloud specific instructions

This is an AI Search Engine SPA built with React 19, TypeScript, Vite 7, and Tailwind CSS 4 on the GitHub Spark platform (`@github/spark`). There is no backend server.

### Running the dev server

- `npm run dev` starts Vite on **port 5000**.
- The `kill` npm script (`fuser -k 5000/tcp`) can free port 5000 if needed.

### Lint / Build / Test

- **Lint**: `npm run lint` — requires an `eslint.config.js` (currently missing from the repo; the command will error until one is added).
- **Build**: `npm run build` — runs `tsc -b --noCheck && vite build`. Produces CSS optimization warnings about Tailwind container queries; these are benign.
- **No automated test suite** exists in this repo.

### Platform / API notes

- The app depends on **`@github/spark`** for LLM access (`window.spark.llm()`) and KV storage (`useKV`). Outside the Spark platform runtime, AI responses will fail with a "Failed to generate response" error — this is expected.
- **Tavily API** (`VITE_TAVILY_API_KEY` in `.env`) powers web search. Without it the app degrades gracefully (AI answers from base knowledge only). See `TAVILY_SETUP.md`.
- OAuth cloud storage integrations (Google Drive, OneDrive, Dropbox, GitHub) are optional; see `OAUTH_SETUP.md`.
