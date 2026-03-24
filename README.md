<div align="center">
  <img src="public/logo-niffler.png" alt="Niffler" width="120">
  <h1>Niffler</h1>
  <p><strong>Your personal AI knowledge graph for X/Twitter</strong></p>
  <p>Save tweets you find interesting. AI auto-categorizes them. Search from your browser, Claude Code, or a 3D graph.</p>

  <a href="https://github.com/komalboyo/niffler-opensource/stargazers"><img src="https://img.shields.io/github/stars/komalboyo/niffler-opensource?style=flat&color=d4883a&labelColor=1a1714" alt="Stars"></a>
  <a href="https://github.com/komalboyo/niffler-opensource/network/members"><img src="https://img.shields.io/github/forks/komalboyo/niffler-opensource?style=flat&color=e8b04a&labelColor=1a1714" alt="Forks"></a>
  <a href="https://github.com/komalboyo/niffler-opensource/issues"><img src="https://img.shields.io/github/issues/komalboyo/niffler-opensource?style=flat&color=9a8e82&labelColor=1a1714" alt="Issues"></a>
  <a href="https://github.com/komalboyo/niffler-opensource/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-d4883a?style=flat&labelColor=1a1714" alt="License"></a>
  <a href="https://goniffler.com"><img src="https://img.shields.io/badge/hosted-goniffler.com-e8b04a?style=flat&labelColor=1a1714" alt="Hosted"></a>

  <br><br>
</div>

---

## Quick Start

```bash
git clone https://github.com/komalboyo/niffler-opensource.git
cd niffler-opensource
npm install
npx playwright install chromium
npm start
# Open http://localhost:3333
```

That's it. No accounts, no API keys, no cloud. Your data stays on your machine in a single SQLite file.

---

## Your X Account Stays Safe

Some tools scrape Twitter by calling internal GraphQL APIs with your session cookies — that gets accounts rate-limited or banned. Niffler doesn't do that.

| Method | What it does | API calls to X | Ban risk |
|--------|-------------|----------------|----------|
| **Chrome extension** | Reads the tweet DOM on the page you're already viewing | Zero | None |
| **Web UI / MCP** | Uses Twitter's official [oEmbed endpoint](https://developer.twitter.com/en/docs/twitter-for-websites/oembed-api) | One lightweight request per tweet | None — it's a public API |
| **Playwright** (optional) | Opens a browser and reads the page like you would | Same as visiting x.com | Minimal — same as normal browsing |

No internal APIs. No GraphQL endpoints. No bulk search queries. Your cookies never leave your browser — the Chrome extension reads the page client-side and sends only the tweet content to your local Niffler instance.

---

## How It Works

1. **Save a tweet** — paste a URL, click the extension button, or use the CLI
2. **AI categorizes it** — auto-tags with your LLM of choice (or tag manually)
3. **Explore the graph** — posts cluster by topic in an interactive 3D force graph

---

## 4 Ways to Save Tweets

### Web App

Open `http://localhost:3333` — paste any tweet URL, explore your 3D knowledge graph, search and filter by tags.

### Chrome Extension

1. Open `chrome://extensions`, enable Developer Mode
2. Click **Load unpacked** → select the `extension/` folder
3. Every tweet on X now has a **Niffler** save button

### CLI

```bash
npx tsx src/cli.ts add https://x.com/karpathy/status/123 #AI #tools
npx tsx src/cli.ts search "transformer architecture"
npx tsx src/cli.ts list --tag ai
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
/niffler stats
```

8 MCP tools: `xbrain_add`, `xbrain_search`, `xbrain_list_by_tag`, `xbrain_get_tags`, `xbrain_get_post`, `xbrain_connect`, `xbrain_stats`, `xbrain_ask`

---

## AI Auto-Categorization (Optional)

Copy `.env.example` to `.env` and add your LLM API key. Works with any OpenAI-compatible provider:

| Provider | Base URL | Cost |
|----------|----------|------|
| **Gemini** | `https://generativelanguage.googleapis.com/v1beta/openai` | Free tier |
| **Groq** | `https://api.groq.com/openai/v1` | Free tier |
| **OpenAI** | `https://api.openai.com/v1` | ~$0.04/1000 tweets |
| **Ollama** | `http://localhost:11434/v1` | Free (local) |

Without an LLM key, everything works — you just tag tweets manually.

---

## Stack

| Component | What | Why |
|-----------|------|-----|
| **SQLite + FTS5** | Database + full-text search | Zero setup, fast, single file |
| **Playwright** | Tweet scraper | No X API key needed |
| **3D Force Graph** | Interactive visualization | Posts cluster by topic |
| **MCP Server** | Claude Code integration | 8 tools for your AI assistant |
| **Express** | Web server | Lightweight, serves everything |

---

## Project Structure

```
niffler-opensource/
├── src/
│   ├── lib/
│   │   ├── db.ts            # SQLite + FTS5 database
│   │   ├── scraper.ts       # Playwright tweet scraper
│   │   └── categorizer.ts   # LLM auto-categorization
│   ├── mcp/
│   │   └── server.ts        # MCP server (8 tools)
│   ├── web/
│   │   ├── server.ts        # Express web server
│   │   └── api.ts           # REST API
│   └── cli.ts               # CLI tool
├── public/
│   ├── app.html             # 3D graph web app
│   └── style.css
├── extension/               # Chrome extension
├── data/                    # SQLite DB lives here
├── .mcp.json                # Claude Code MCP config
└── .env.example             # LLM configuration
```

---

## Hosted Version

Don't want to self-host? Use **[goniffler.com](https://goniffler.com)** — free hosted version with:

- Chrome extension that saves to the cloud
- Claude Code plugin (`/plugin install niffler`)
- Email verification + multi-user
- No setup required

---

## Contributing

Niffler is early and evolving fast. Contributions welcome!

- **Bug reports** — [open an issue](https://github.com/komalboyo/niffler-opensource/issues)
- **Feature ideas** — [start a discussion](https://github.com/komalboyo/niffler-opensource/issues)
- **Pull requests** — fork, branch, PR. Keep it focused.

If you're using Niffler, I'd love to hear about it — reach out on [X @KomalBoyo](https://x.com/KomalBoyo).

---

## License

MIT — do whatever you want with it.

---

<div align="center">
  <p>Built by <a href="https://x.com/KomalBoyo">@KomalBoyo</a></p>
  <p>If Niffler is useful to you, a star helps others find it ⭐</p>
</div>
