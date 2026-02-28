# Zomato AI — Smart Food Ordering via MCP

> AI-powered food ordering assistant that connects to Zomato's real API via the Model Context Protocol. Search, order, and pay — all through conversation.

##  Features

-  **GPS Location Detection** - Automatic location detection for nearby restaurants
-  **Smart Restaurant Search** - Natural language search with ratings, prices, delivery time
-  **Visual Menu Browsing** - Large dish images, bestseller badges, veg/non-veg indicators
-  **Intelligent Cart Management** - Context-aware AI that remembers your restaurant and items
-  **Automatic Offer Discovery** - Finds and applies best discounts automatically
-  **Saved Address Management** - Uses your Zomato saved addresses for delivery
-  **UPI Payment QR Codes** - 600x600px QR codes for easy mobile scanning
-  **Zomato-Style UI** - Hero images, ratings, reviews, glassmorphism design
-  **Conversational AI** - Natural chat interface with GPT-4o
-  **Fully Responsive** - Works on desktop, tablet, and mobile

---

## System Architecture

```
┌──────────────────────────────────────────────────────────┐
│  BROWSER  (Vanilla HTML/CSS/JS)                          │
│  └─ Dashboard UI + Step Tracker + Action Buttons         │
└─────────────────────┬────────────────────────────────────┘
                      │ HTTP REST
┌─────────────────────▼────────────────────────────────────┐
│  EXPRESS.JS BACKEND  (Node.js)                           │
│  ├─ routes/api.js    — REST endpoints                    │
│  ├─ services/chat.js — OpenAI GPT-4o + tool calling      │
│  ├─ services/mcp.js  — MCP Client via mcp-remote         │
│  └─ services/storage.js — JSON chat persistence          │
└────────┬─────────────────────────┬───────────────────────┘
         │ HTTPS                   │ stdio
         ▼                         ▼
┌─────────────────┐    ┌───────────────────────────────────┐
│  OPENAI API     │    │  mcp-remote (npx)                 │
│  Model: GPT-4o  │    │  ├─ OAuth 2.0 + PKCE handling     │
│  Tool Calling   │    │  ├─ Auto browser popup for login   │
│                 │    │  └─ stdio ↔ HTTP bridge            │
└─────────────────┘    └──────────────┬────────────────────┘
                                      │ HTTPS
                       ┌──────────────▼────────────────────┐
                       │  ZOMATO MCP SERVER                 │
                       │  mcp-server.zomato.com/mcp         │
                       │  Tools: search, menu, cart,        │
                       │         order, status, payment     │
                       └───────────────────────────────────┘
```

**We are an MCP Client** — Zomato hosts the MCP server. We connect as a client, discover tools, and call them on behalf of the user through GPT-4o.

---

## Tech Stack — What Each Does

| Technology | Used For |
|-----------|----------|
| **Express.js** | HTTP server, serves frontend, exposes REST API endpoints |
| **OpenAI GPT-4o** (`openai` npm) | Natural language understanding, decides which Zomato tools to call, generates formatted responses |
| **MCP SDK** (`@modelcontextprotocol/sdk`) | MCP Client that connects to Zomato server, discovers tools, sends tool calls |
| **mcp-remote** (`npx mcp-remote`) | Proxy that bridges stdio↔HTTP and handles OAuth 2.0 + PKCE since Zomato only whitelists specific redirect URIs |
| **markdown-it** (CDN) | Renders AI responses as rich markdown — tables, bold, headers, code blocks |
| **highlight.js** (CDN) | Syntax highlighting inside code blocks in AI responses |
| **dotenv** | Loads `OPENAI_API_KEY` and `PORT` from `.env` file |
| **uuid** | Generates unique session and chat IDs |
| **cors** | Enables cross-origin requests for API |
| **OAuth 2.0 + PKCE** | Secure authentication with Zomato — handled entirely by mcp-remote, auto-opens browser for login |
| **JSON file storage** | Persists chat history to `chat_history.json` — no database needed |
| **Glassmorphism CSS** | Frosted-glass dark theme UI with animations, responsive design |

---

## How It Works

### Connection Flow
1. User clicks **Connect to Zomato** → backend spawns `npx mcp-remote https://mcp-server.zomato.com/mcp`
2. mcp-remote initiates **OAuth 2.0 + PKCE** → auto-opens browser for Zomato login
3. User completes phone + OTP → mcp-remote receives and stores token
4. MCP Client connects via stdio → calls `listTools()` → discovers 6 Zomato tools
5. UI shows **Connected** with tool badges

### Chat + Tool Calling Flow
1. User sends message (e.g., *"Find top rated Dosa near Koramangala"*)
2. Backend builds: `[system prompt + chat history + user message]`
3. Converts MCP tools → OpenAI function-calling format
4. Calls **GPT-4o** with tools — GPT decides to call `search_restaurants`
5. Backend executes tool via MCP Client → Zomato returns restaurant data
6. Tool result sent back to GPT-4o → generates formatted response with **action buttons**
7. Frontend parses `[[ACTION:View Menu:...]]` markers → renders clickable buttons
8. Step tracker auto-detects stage (Search/Menu/Cart/Offers/Payment)
9. Context chips update for current stage

GPT-4o can chain **up to 10 tool calls** per turn (e.g., search → get menu → add to cart in one message).

---

## Zomato MCP Tools

| Tool | What It Does | Ordering Stage |
|------|-------------|----------------|
| `search_restaurants` | Find restaurants by location, cuisine, price, rating | Search |
| `get_menu` | Browse menu with items, prices, categories | Menu |
| `add_to_cart` | Add items with quantity and customization | Cart |
| `create_order` | Place the assembled order | Payment |
| `get_order_status` | Track delivery status | Post-order |
| `get_payment_qr` | Generate UPI QR code for payment | Payment |

---

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/connect` | Start Zomato MCP connection (triggers OAuth) |
| `POST` | `/api/disconnect` | Disconnect from Zomato |
| `GET` | `/api/status` | Connection status + tool list |
| `POST` | `/api/chat` | Send message → AI + tools → response |
| `GET` | `/api/chats` | List chat history |
| `DELETE` | `/api/chats/:id` | Delete a chat |

---

## Project Structure

```
MCP-Zomato/
├── server.js              # Express entry point (~30 lines)
├── routes/api.js          # All REST API endpoints
├── services/
│   ├── mcp.js             # MCP Client + mcp-remote connection
│   ├── chat.js            # OpenAI GPT-4o + tool calling loop
│   └── storage.js         # JSON file chat persistence
├── public/
│   ├── index.html         # Dashboard layout + step tracker
│   ├── style.css          # Glassmorphism design (~1300 lines)
│   └── app.js             # Action buttons, chips, step tracker logic
├── .env                   # OPENAI_API_KEY, PORT
└── package.json           # Dependencies
```

---

## Getting Started

### Prerequisites
- **Node.js** (v18 or higher)
- **OpenAI API Key** (get from [platform.openai.com](https://platform.openai.com))
- **Internet connection** (for MCP OAuth and API calls)

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/MCP-Zomato.git
cd MCP-Zomato

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY:
# OPENAI_API_KEY=sk-your-key-here
# PORT=3000

# 4. Start the server
npm start

# 5. Open browser
# Visit http://localhost:3000
# Click "Connect to Zomato" → complete OAuth login → start ordering!
```

### Data Storage
- **Chat History**: All conversations are stored in `chat_history.json` in the project root
- **Format**: JSON array with chat metadata (id, title, timestamp, messages)
- **Persistence**: Chats automatically save after each message and persist across server restarts
- **No Database Required**: Simple file-based storage for easy setup and portability

### Available Commands
```bash
npm start              # Start the server (default: localhost:3000)
npm run dev            # Start with auto-restart (if nodemon installed)
npm test               # Run tests (if configured)
```

---

## Key Design Decisions

| Decision | Why |
|----------|-----|
| MCP Client (not server) | Zomato hosts the server — we consume their tools |
| mcp-remote proxy | Zomato whitelists specific OAuth URIs only — mcp-remote handles this |
| GPT-4o tool calling | Function calling maps naturally to MCP tools |
| `[[ACTION:...]]` markers | AI responses become interactive with clickable buttons |
| Vanilla frontend | No build tools needed — glassmorphism CSS + markdown-it for premium feel |
| JSON file storage | Simple persistence, no database dependency |

---

## Troubleshooting

### Connection Issues
- **"Failed to connect"**: Make sure you have internet and complete the OAuth login in the browser popup
- **OAuth popup blocked**: Enable popups for localhost:3000 in your browser settings
- **Port 3000 already in use**: Change `PORT=3001` in `.env` file

### Location Issues
- **Wrong location detected**: Allow location access in your browser when prompted
- **No GPS permission**: Go to browser settings → Privacy → Location → Allow for localhost

### API Issues
- **"OpenAI API key not configured"**: Make sure you added it correctly in `.env` file
- **Rate limit errors**: You've exceeded OpenAI API quota - check your usage at platform.openai.com
- **Restaurant offline**: The AI will automatically suggest alternative restaurants

### Data Issues
- **Reset chat history**: Delete `chat_history.json` file and restart server
- **Corrupted data**: Backup and delete `chat_history.json`, it will regenerate automatically

---

## Disclaimer

For **testing purposes only**. Per Zomato: *"Third party apps on Zomato MCP are not allowed due to security and legal considerations."*

---

**Built with** Node.js · Express · OpenAI GPT-4o · MCP Protocol · Zomato MCP Server

**Author:** Sharan G S
