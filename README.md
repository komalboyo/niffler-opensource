# Niffler

Personal AI knowledge graph for X/Twitter. Save tweets, auto-categorize with AI, explore in a 3D graph, search from Claude Code.

## Quick Start

```bash
git clone https://github.com/komalboyo/niffler-opensource.git
cd niffler-opensource
npm install
npx playwright install chromium
npm start
# Open http://localhost:3333
```

## Ways to Use

### Web App
Open `http://localhost:3333` — paste tweet URLs, explore your 3D knowledge graph.

### Chrome Extension
1. Open `chrome://extensions`, enable Developer Mode
2. Click "Load unpacked" → select the `extension/` folder
3. Every tweet on X now has a Niffler save button

### CLI
```bash
npx tsx src/cli.ts add https://x.com/karpathy/status/123 #AI #tools
npx tsx src/cli.ts search "transformer architecture"
npx tsx src/cli.ts tags
npx tsx src/cli.ts stats
```

### Claude Code (MCP)
Open this project in Claude Code — it auto-discovers the MCP server from `.mcp.json`:
```
/niffler add https://x.com/karpathy/status/123 #AI
/niffler search transformer architecture
/niffler ask what are the best RAG tools?
/niffler tags
```

## AI Auto-Categorization (Optional)

Copy `.env.example` to `.env` and add your LLM API key. Works with any OpenAI-compatible provider:

| Provider | Base URL |
|----------|----------|
| Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` |
| OpenAI | `https://api.openai.com/v1` |
| Groq | `https://api.groq.com/openai/v1` |
| Ollama | `http://localhost:11434/v1` |

Without an LLM key, everything works — you just tag tweets manually.

## Stack

- **SQLite + FTS5** — fast full-text search, zero setup
- **Playwright** — scrapes tweets (no API key needed)
- **3D Force Graph** — interactive knowledge visualization
- **MCP** — 8 tools for Claude Code integration
- **Express** — lightweight web server

## Hosted Version

Don't want to self-host? Use [goniffler.com](https://goniffler.com) — free, with Chrome extension and Claude Code plugin.

## License

MIT
