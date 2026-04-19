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

const server = new Server(
  { name: 'vybsly-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

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
console.error('[vybsly-mcp] Server running on stdio — 11 tools registered');
