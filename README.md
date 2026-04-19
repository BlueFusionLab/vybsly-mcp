# Vybsly MCP

MCP (Model Context Protocol) server for [Vybsly](https://vybsly.ai) — the AI-first search API with **29M+ full-content pages**, encyclopedia federation, strict-mode filters, and real-time data tools.

Works with **Claude Desktop, Cursor, Windsurf**, or any MCP-compatible client.

## Why Vybsly

Other search APIs return snippets. Vybsly returns **up to 30,000 characters of clean, extracted content per result** — the full page, ready for RAG and agent context. No scraping, no follow-up fetches.

- **29M+ web pages** indexed with full content
- **25M+ encyclopedia articles** (federated search via `/knowledge`)
- **Strict mode**: enforce research/news/educational domains with allowlists
- **Real-time data**: stocks, crypto, weather, news, sports odds, maps
- **8× cheaper** than Tavily, **$9/mo** for 10,000 queries

## Install

```bash
npm install -g vybsly-mcp
```

Or use directly with `npx`:
```bash
npx vybsly-mcp
```

## Get an API key

Sign up free at [vybsly.ai/developers.html](https://vybsly.ai/developers.html) — 1,000 free queries/month, no credit card required.

## Claude Desktop setup

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "vybsly": {
      "command": "npx",
      "args": ["-y", "vybsly-mcp"],
      "env": {
        "VYBSLY_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

Restart Claude Desktop. Vybsly tools will appear in the tool picker.

## Cursor / Windsurf setup

Add to your `.cursor/mcp.json` or equivalent:

```json
{
  "mcpServers": {
    "vybsly": {
      "command": "npx",
      "args": ["-y", "vybsly-mcp"],
      "env": { "VYBSLY_API_KEY": "your_api_key_here" }
    }
  }
}
```

## Available tools

| Tool | Purpose |
|------|---------|
| `vybsly_search` | Full-content web search with strict-mode filters |
| `vybsly_knowledge` | Federated web + encyclopedia search |
| `vybsly_extract` | Extract full content from any URL (JS-rendered) |
| `vybsly_ask` | Ask a question, get a sourced AI answer |
| `vybsly_stocks` | Live stock prices |
| `vybsly_crypto` | Live cryptocurrency data |
| `vybsly_weather` | Current weather + 5-day forecast |
| `vybsly_news` | Recent news articles |
| `vybsly_odds` | Live sports betting lines |
| `vybsly_geocode` | Address → coordinates |
| `vybsly_directions` | Turn-by-turn driving directions |

## Examples (natural language in Claude)

> "Search for recent CRISPR research papers only"
> → uses `vybsly_search` with `research=true, strict=true`

> "What's Einstein's most famous equation?"
> → uses `vybsly_knowledge` — gets encyclopedia + web results

> "Extract the article at https://arxiv.org/abs/2501.00001"
> → uses `vybsly_extract` — returns full markdown

> "What's AAPL trading at and how's the weather in NYC?"
> → uses `vybsly_stocks` + `vybsly_weather` in parallel

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VYBSLY_API_KEY` | Your API key (optional for free tier) | (none) |
| `VYBSLY_BASE_URL` | API base URL | `https://vybsly.ai/api/v1` |

## Free vs paid

- **Free**: 1,000 queries/month, 50/day
- **Starter** ($9/mo): 10,000/month
- **Pro** ($29/mo): 50,000/month
- **Business** ($99/mo): 250,000/month
- **Enterprise**: Contact sales

Upgrade anytime at [vybsly.ai/developers.html](https://vybsly.ai/developers.html).

## Links

- Website: [vybsly.ai](https://vybsly.ai)
- API docs: [vybsly.ai/docs.html](https://vybsly.ai/docs.html)
- Developer portal: [vybsly.ai/developers.html](https://vybsly.ai/developers.html)
- GitHub: [github.com/BlueFusionLab/vybsly-mcp](https://github.com/BlueFusionLab/vybsly-mcp)

## License

MIT © Blue Fusion Labs
