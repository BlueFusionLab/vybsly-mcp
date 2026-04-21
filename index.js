#!/usr/bin/env node
// Vybsly MCP Server
// Exposes Vybsly's AI-first search API as MCP tools for Claude Desktop, Cursor, Windsurf, etc.
// Docs: https://vybsly.ai/docs.html
// Get API key: https://vybsly.ai/developers.html

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const VYBSLY_BASE = process.env.VYBSLY_BASE_URL || 'https://vybsly.ai/api/v1';
const API_KEY = process.env.VYBSLY_API_KEY || '';

async function vybslyCall(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${VYBSLY_BASE}${path}${qs ? '?' + qs : ''}`;
  const headers = { 'Accept': 'application/json' };
  if (API_KEY) headers['X-API-Key'] = API_KEY;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vybsly API ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

const TOOLS = [
  {
    name: 'vybsly_search',
    description: 'Full-content web search across 29M+ pages. Returns up to 30K chars per result — perfect for RAG and agent context. Supports strict-mode filters (research/news/educational) and federation with encyclopedia.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (required)' },
        limit: { type: 'number', description: 'Max results (1-50, default 10)', default: 10 },
        mode: { type: 'string', enum: ['default', 'agent'], description: 'agent = structured output with key_facts and entities' },
        strict: { type: 'boolean', description: 'Enforce filter allowlists instead of fuzzy matching' },
        research: { type: 'boolean', description: 'Only research papers (arxiv, nature, pubmed)' },
        news: { type: 'boolean', description: 'Only news outlets (Reuters, AP, BBC)' },
        educational: { type: 'boolean', description: 'Only tutorials/docs (MDN, MIT OCW)' },
        source: { type: 'string', description: 'Restrict to a specific domain, e.g. wikipedia.org' },
        lang: { type: 'string', description: 'Language filter (en, es, fr, de, ja, zh)' },
        strict_fallback: { type: 'string', enum: ['relaxed'], description: 'Auto-retry relaxed when strict returns too few' }
      },
      required: ['query']
    }
  },
  {
    name: 'vybsly_knowledge',
    description: 'Federated search: web index + structured encyclopedia in one call. Returns results tagged by source (vybsly/vybpedia). Best for factual questions needing both breadth (web) and authority (encyclopedia).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (required)' },
        limit: { type: 'number', description: 'Total max results (default 10)', default: 10 },
        strict: { type: 'boolean' },
        research: { type: 'boolean' }
      },
      required: ['query']
    }
  },
  {
    name: 'vybsly_extract',
    description: 'Extract full content from any URL with JavaScript rendering. Returns clean markdown/text, title, description, images, and links. Works on React/Vue SPAs. Use when you need content from a specific URL.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to extract (required)' },
        format: { type: 'string', enum: ['markdown', 'text', 'html'], description: 'Output format' }
      },
      required: ['url']
    }
  },
  {
    name: 'vybsly_ask',
    description: 'Ask a question, get a sourced AI answer (like Perplexity). Returns a synthesized answer plus the source URLs used.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to answer' },
        max_sources: { type: 'number', description: 'How many sources to cite (default 5)', default: 5 }
      },
      required: ['question']
    }
  },
  {
    name: 'vybsly_stocks',
    description: 'Live stock prices for one or more ticker symbols. Auto-saves to historical almanac for trend lookups.',
    inputSchema: {
      type: 'object',
      properties: {
        symbols: { type: 'string', description: 'Comma-separated tickers, e.g. AAPL,TSLA,NVDA' }
      },
      required: ['symbols']
    }
  },
  {
    name: 'vybsly_crypto',
    description: 'Live cryptocurrency prices and market data.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Crypto ticker, e.g. BTC, ETH, SOL' }
      },
      required: ['symbol']
    }
  },
  {
    name: 'vybsly_weather',
    description: 'Current weather and 5-day forecast for a city.',
    inputSchema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name, e.g. Miami or "New York"' }
      },
      required: ['city']
    }
  },
  {
    name: 'vybsly_news',
    description: 'Recent news articles with publish dates. Use for time-sensitive queries.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        hours: { type: 'number', description: 'Max article age in hours (default 24)', default: 24 }
      },
      required: ['query']
    }
  },
  {
    name: 'vybsly_odds',
    description: 'Live sports betting odds from multiple bookmakers (FanDuel, DraftKings, BetMGM). Useful for sports analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        sport: { type: 'string', description: 'nba, nfl, mlb, nhl, ufc, mma' },
        team: { type: 'string', description: 'Filter by team or fighter name' }
      }
    }
  },
  {
    name: 'vybsly_geocode',
    description: 'Convert a street address or place name into latitude/longitude coordinates.',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Address or place name' }
      },
      required: ['address']
    }
  },
  {
    name: 'vybsly_directions',
    description: 'Get turn-by-turn driving directions between two places.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string' },
        to: { type: 'string' }
      },
      required: ['from', 'to']
    }
  }
];

// ══════════════════════════════════════════════════════════════════
// PROMPTS — reusable templates users can invoke from their MCP client
// ══════════════════════════════════════════════════════════════════
const PROMPTS = [
  {
    name: 'research-brief',
    description: 'Produce a research brief on a topic using peer-reviewed sources (arXiv, Nature, PubMed) via Vybsly research mode.',
    arguments: [
      { name: 'topic', description: 'The research topic or question', required: true },
      { name: 'depth', description: 'light (5 sources), medium (10, default), or deep (20)', required: false }
    ]
  },
  {
    name: 'daily-news-digest',
    description: 'Build a dated digest of the most recent news on a topic (last 24h by default).',
    arguments: [
      { name: 'topic', description: 'News topic, e.g. "ai regulation"', required: true },
      { name: 'hours', description: 'Max article age in hours (default 24)', required: false }
    ]
  },
  {
    name: 'competitor-analysis',
    description: 'Compare a company against its top competitors using full-content web results.',
    arguments: [
      { name: 'company', description: 'Company to analyze', required: true },
      { name: 'focus', description: 'Optional focus area: pricing, features, positioning, funding', required: false }
    ]
  },
  {
    name: 'fact-check',
    description: 'Fact-check a specific claim with sourced evidence and a verdict.',
    arguments: [
      { name: 'claim', description: 'The exact claim to verify', required: true }
    ]
  },
  {
    name: 'local-guide',
    description: 'Build a practical local guide for a place — things to do, current weather, and a map link.',
    arguments: [
      { name: 'place', description: 'City or neighborhood, e.g. "Austin, TX"', required: true },
      { name: 'interest', description: 'Optional interest: food, outdoors, nightlife, family', required: false }
    ]
  },
  {
    name: 'market-snapshot',
    description: 'Build a quick snapshot of one or more tickers: price, day move, and latest headlines.',
    arguments: [
      { name: 'symbols', description: 'Comma-separated stock tickers, e.g. AAPL,TSLA,NVDA', required: true }
    ]
  }
];

function renderPrompt(name, args = {}) {
  switch (name) {
    case 'research-brief': {
      const depth = (args.depth || 'medium').toLowerCase();
      const limit = depth === 'deep' ? 20 : depth === 'light' ? 5 : 10;
      return {
        description: `Research brief on "${args.topic}" (${depth} depth)`,
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Use the vybsly_search tool with research=true, strict=true, limit=${limit}, query="${args.topic}".\n\nThen write a research brief with:\n1. One-sentence summary of the current state of this topic.\n2. 3-5 key findings, each as a bullet with an inline [n] citation.\n3. Methodology notes (what approaches/datasets are common).\n4. Open questions and live debates.\n5. A numbered list of the sources used, each with title + URL.\n\nIgnore any non-peer-reviewed sources in the results.`
          }
        }]
      };
    }
    case 'daily-news-digest': {
      const hours = parseInt(args.hours) || 24;
      return {
        description: `News digest for "${args.topic}" (last ${hours}h)`,
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Use the vybsly_news tool with query="${args.topic}" and hours=${hours}.\n\nFor each article, write a one-sentence summary. Group them by theme if 4+ articles. End with a "What to watch" section noting what might happen next.\n\nFormat as Markdown. Include the publish time and source for each story as [HH:MM · source].`
          }
        }]
      };
    }
    case 'competitor-analysis': {
      const focus = args.focus ? ` with focus on ${args.focus}` : '';
      return {
        description: `Competitor analysis: ${args.company}${focus}`,
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Research "${args.company}" and its top 3 competitors${focus}.\n\nSteps:\n1. vybsly_search query="${args.company} company overview", limit=5.\n2. vybsly_knowledge query="${args.company} competitors", limit=10.\n3. For each identified competitor, vybsly_search their name, limit=3.\n\nProduce:\n- A comparison table (company, category, pricing/tier, main differentiator).\n- A short paragraph on ${args.company}'s strengths vs each competitor.\n- A "watch list" of emerging competitors.\n\nCite sources inline as [n].`
          }
        }]
      };
    }
    case 'fact-check':
      return {
        description: `Fact-check: "${(args.claim || '').slice(0, 80)}..."`,
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Verify this claim: "${args.claim}"\n\nSteps:\n1. vybsly_search the claim with strict=true, news=true (for recent claims).\n2. vybsly_knowledge the core entity/fact for encyclopedic grounding.\n3. Cross-reference at least 3 independent sources.\n\nOutput:\n- **Verdict**: TRUE / MOSTLY TRUE / MIXED / MOSTLY FALSE / FALSE / UNVERIFIABLE\n- **Confidence**: low / medium / high\n- **Evidence**: 2-4 short bullets quoting from sources with inline [n] citations.\n- **Nuance**: any caveats (time-sensitive, context-dependent, disputed).\n- **Sources**: numbered list with URLs.`
          }
        }]
      };
    case 'local-guide': {
      const interest = args.interest ? ` focused on ${args.interest}` : '';
      return {
        description: `Local guide: ${args.place}${interest}`,
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Build a one-page local guide for "${args.place}"${interest}.\n\nSteps:\n1. vybsly_weather city="${args.place}" for current conditions and 5-day forecast.\n2. vybsly_search query="best${interest ? ' ' + args.interest : ''} in ${args.place}", limit=8.\n3. vybsly_geocode address="${args.place}" so we have coordinates for a map link.\n\nProduce:\n- **Right now**: temperature + condition.\n- **Top picks** (6-8): place name, one-line reason, inline source citation.\n- **This week's weather** (5-day bullets).\n- **Map**: https://maps.google.com/?q=<lat>,<lng>\n\nMarkdown formatting.`
          }
        }]
      };
    }
    case 'market-snapshot':
      return {
        description: `Market snapshot: ${args.symbols}`,
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Build a market snapshot for: ${args.symbols}\n\nSteps:\n1. vybsly_stocks symbols="${args.symbols}".\n2. For each ticker, vybsly_news query="<ticker> stock", hours=24, limit=3.\n\nProduce, for each ticker:\n- **TICKER**: $price (▲/▼ X.XX%)\n- One-line headline summary of today's top story.\n- 2-3 bullets of key drivers.\n\nEnd with a ~2 sentence "What to watch" section covering the portfolio as a whole.`
          }
        }]
      };
    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
}

// ══════════════════════════════════════════════════════════════════
// RESOURCES — read-only URIs the LLM can reference for context
// ══════════════════════════════════════════════════════════════════
const RESOURCES = [
  {
    uri: 'vybsly://api/reference',
    name: 'Vybsly API reference',
    description: 'Full self-describing API documentation (all 30+ endpoints with parameters and examples).',
    mimeType: 'application/json'
  },
  {
    uri: 'vybsly://index/stats',
    name: 'Live index statistics',
    description: 'Current page, image, and video counts in the Vybsly index.',
    mimeType: 'application/json'
  },
  {
    uri: 'vybsly://tools/catalog',
    name: 'MCP tool catalog',
    description: 'List of every tool this server exposes, with descriptions and input schemas.',
    mimeType: 'application/json'
  },
  {
    uri: 'vybsly://guides/search-syntax',
    name: 'Search syntax and filter guide',
    description: 'How to use strict mode, research/news/educational filters, source filters, and the agent mode.',
    mimeType: 'text/markdown'
  }
];

async function readResource(uri) {
  switch (uri) {
    case 'vybsly://api/reference': {
      const data = await vybslyCall('/docs').catch(() => ({ error: 'Could not fetch /v1/docs — check network or API key.' }));
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }] };
    }
    case 'vybsly://index/stats': {
      // Pull index size + metadata from /v1/docs (self-describing manifest).
      let stats = { error: 'stats unavailable' };
      try {
        const docs = await vybslyCall('/docs');
        stats = {
          engine: docs.engine || 'Vybsly Search API',
          version: docs.version,
          base_url: docs.base_url,
          index_size: docs.index_size,
          endpoints: Array.isArray(docs.endpoints) ? docs.endpoints.length : undefined,
          self_growing: docs.self_growing,
          fetched_at: new Date().toISOString()
        };
      } catch (e) { stats = { error: e.message }; }
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(stats, null, 2) }] };
    }
    case 'vybsly://tools/catalog':
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(TOOLS, null, 2) }] };
    case 'vybsly://guides/search-syntax':
      return {
        contents: [{
          uri,
          mimeType: 'text/markdown',
          text: `# Vybsly Search Syntax & Filters

## Tools at a glance
- **vybsly_search** — the main full-content web search. Returns up to 30KB of extracted content per result.
- **vybsly_knowledge** — federated search across the web index AND the encyclopedia (Vybpedia) in one call.
- **vybsly_extract** — pull the full content of a specific URL (JS-rendered pages supported).
- **vybsly_ask** — Perplexity-style sourced AI answer.
- **vybsly_news** — recent news only, filterable by hours.
- **vybsly_stocks / _crypto / _weather / _odds** — real-time structured data.
- **vybsly_geocode / _directions** — maps primitives.

## Filter modes
| Flag | Behavior |
|---|---|
| \`strict: true\` | Hard filter — only results from the allowlisted domains for that mode |
| \`research: true\` | arXiv, Nature, PubMed, Science, academic repos |
| \`news: true\` | Reuters, AP, BBC, major newsrooms |
| \`educational: true\` | MDN, MIT OCW, official docs, tutorials |
| \`source: "wikipedia.org"\` | Restrict to a single domain |
| \`lang: "en"\` | Language filter (en, es, fr, de, ja, zh) |
| \`strict_fallback: "relaxed"\` | Auto-retry with strict off if strict returns too few |

## Agent mode
Pass \`mode: "agent"\` to \`vybsly_search\` to get a structured response with:
- \`key_facts\` — distilled points from top results
- \`entities\` — named entities detected (people, orgs, places)
- \`citations\` — indexed citation map

## When to use knowledge vs search
- **Entity/fact question** (e.g. "what is blockchain", "who is Einstein") → \`vybsly_knowledge\`
- **News-y or time-sensitive** → \`vybsly_search\` + \`news: true\`
- **Research** → \`vybsly_search\` + \`research: true\` + \`strict: true\`
- **Specific URL content** → \`vybsly_extract\`

## Auth
Set \`VYBSLY_API_KEY\` in your MCP client's env block. Free tier: 1,000 queries/month, no card. Get one at https://vybsly.ai/developers.html.
`
        }]
      };
    default:
      throw new Error(`Unknown resource URI: ${uri}`);
  }
}

const server = new Server(
  { name: 'vybsly-mcp', version: '1.1.0' },
  { capabilities: { tools: {}, prompts: {}, resources: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: PROMPTS }));
server.setRequestHandler(GetPromptRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  return renderPrompt(name, args || {});
});
server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: RESOURCES }));
server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  return readResource(req.params.uri);
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    let result;
    switch (name) {
      case 'vybsly_search':
        result = await vybslyCall('/search', {
          q: args.query,
          limit: args.limit || 10,
          ...(args.mode && { mode: args.mode }),
          ...(args.strict && { strict: 'true' }),
          ...(args.research && { research: 'true' }),
          ...(args.news && { news: 'true' }),
          ...(args.educational && { educational: 'true' }),
          ...(args.source && { source: args.source }),
          ...(args.lang && { lang: args.lang }),
          ...(args.strict_fallback && { strict_fallback: args.strict_fallback })
        });
        break;
      case 'vybsly_knowledge':
        result = await vybslyCall('/knowledge', {
          q: args.query,
          limit: args.limit || 10,
          ...(args.strict && { strict: 'true' }),
          ...(args.research && { research: 'true' })
        });
        break;
      case 'vybsly_extract':
        result = await vybslyCall('/extract', { url: args.url, ...(args.format && { format: args.format }) });
        break;
      case 'vybsly_ask': {
        const res = await fetch(`${VYBSLY_BASE}/ask`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(API_KEY && { 'X-API-Key': API_KEY }) },
          body: JSON.stringify({ question: args.question, max_sources: args.max_sources || 5 })
        });
        result = await res.json();
        break;
      }
      case 'vybsly_stocks':
        result = await vybslyCall('/stocks', { symbols: args.symbols });
        break;
      case 'vybsly_crypto':
        result = await vybslyCall('/crypto', { symbol: args.symbol });
        break;
      case 'vybsly_weather':
        result = await vybslyCall('/weather', { city: args.city });
        break;
      case 'vybsly_news':
        result = await vybslyCall('/news', { q: args.query, hours: args.hours || 24 });
        break;
      case 'vybsly_odds': {
        const params = {};
        if (args.sport) params.sport = args.sport;
        if (args.team) params.team = args.team;
        result = await vybslyCall('/odds', params);
        break;
      }
      case 'vybsly_geocode':
        result = await vybslyCall('/geocode', { q: args.address });
        break;
      case 'vybsly_directions':
        result = await vybslyCall('/directions', { from: args.from, to: args.to });
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error calling ${name}: ${e.message}` }],
      isError: true
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[vybsly-mcp] Server running on stdio — 11 tools, 6 prompts, 4 resources registered');
