# Zomato AI — MCP App with Native Architecture

> **AI-powered food ordering assistant** with **native MCP Apps architecture** that connects directly to Zomato's MCP server. Built with **Gemini + Groq** and implements the official **Model Context Protocol Apps specification** for seamless browser-to-MCP-server communication.

**Created by:** Sharan G S

##  What's New in v2.0

### Native MCP Apps Architecture
This version implements the official [MCP Apps architecture](https://modelcontextprotocol.io/extensions/apps/overview) with:

-  **Browser-based MCP Client** - Direct connection from browser to MCP servers
-  **Real-time Streaming** - Live updates and tool execution feedback
-  **Enhanced UI/UX** - Zomato-style interface with glassmorphism design
-  **Progressive Connection** - Smart connection handling with retry logic
-  **Tool Discovery** - Automatic discovery and visualization of MCP tools
-  **Event-driven Architecture** - Reactive UI updates based on MCP events
-  **Improved Error Handling** - User-friendly error messages and recovery

### Interactive Zomato UI Components
Complete Zomato-style interface with:

-  **Restaurant Cards** - Grid layout with images, ratings, offers, and favorites
-  **Menu View** - Categories, filters (veg/non-veg/bestseller), item images
-  **Shopping Cart** - Quantity controls, bill breakdown, checkout flow
-  **Order Confirmation** - Success animation, timeline tracker, order summary
-  **Filter System** - Client-side filtering for instant results
-  **Mobile Responsive** - Optimized for all screen sizes

##  Features

-  **GPS Location Detection** - Automatic location detection for nearby restaurants
-  **Smart Restaurant Search** - Natural language search with ratings, prices, delivery time
-  **Visual Menu Browsing** - Large dish images, bestseller badges, veg/non-veg indicators
-  **Intelligent Cart Management** - Context-aware AI that remembers your restaurant and items
-  **Automatic Offer Discovery** - Finds and applies best discounts automatically
-  **Saved Address Management** - Uses your Zomato saved addresses for delivery
-  **UPI Payment QR Codes** - 600x600px QR codes for easy mobile scanning
-  **Zomato-Style UI** - Hero images, ratings, reviews, glassmorphism design
-  **Conversational AI** - Natural chat interface with Gemini and Groq fallback
-  **Native MCP Integration** - Direct browser-to-MCP-server communication
-  **Fully Responsive** - Works on desktop, tablet, and mobile

---

## System Architecture (v2.0 - MCP Apps)

```
┌──────────────────────────────────────────────────────────────────┐
│  BROWSER (MCP App)                                                │
│  ├─ MCP Client (mcp-client.js) — Native MCP protocol             │
│  ├─ App Logic (app-mcp.js) — Event-driven UI                     │
│  ├─ UI Components — Glassmorphism Zomato-style interface         │
│  └─ Direct Tool Calls — Browser calls MCP tools via backend      │
└───────────┬──────────────────────────────────────────────────────┘
            │ HTTP/REST (MCP Protocol Wrapper)
┌───────────▼──────────────────────────────────────────────────────┐
│  EXPRESS.JS BACKEND (MCP Proxy + AI)                             │
│  ├─ /api/mcp/connect    — MCP connection endpoint                │
│  ├─ /api/mcp/tools      — List available tools                   │
│  ├─ /api/mcp/call-tool  — Execute MCP tools                      │
│  ├─ /api/chat           — Gemini + Groq tool orchestration       │
│  ├─ services/mcp.js     — MCP Client via mcp-remote              │
│  └─ services/chat.js    — AI tool calling logic                  │
└────────┬─────────────────────────┬───────────────────────────────┘
         │ HTTPS                   │ stdio
         ▼                         ▼
┌─────────────────┐    ┌───────────────────────────────────────────┐
│  GEMINI / GROQ  │    │  mcp-remote (npx)                         │
│  Primary/Fallback│   │  ├─ OAuth 2.0 + PKCE handling             │
│  Tool Calling   │    │  ├─ Auto browser popup for login          │
│                 │    │  └─ stdio ↔ HTTP bridge                   │
└─────────────────┘    └──────────────┬────────────────────────────┘
                                      │ HTTPS
                       ┌──────────────▼────────────────────────────┐
                       │  ZOMATO MCP SERVER                         │
                       │  mcp-server.zomato.com/mcp                 │
                       │  Tools: search, menu, cart,                │
                       │         order, status, payment             │
                       └───────────────────────────────────────────┘
```

### Key Architecture Changes in v2.0

**Before (v1.0):**
- Traditional REST API architecture
- Backend-only MCP client
- Polling for updates
- Limited real-time feedback

**Now (v2.0 - MCP Apps):**
- Native MCP Apps architecture
- Browser-based MCP client
- Event-driven updates
- Direct tool execution feedback
- Enhanced UX with streaming support

---

## Tech Stack — What Each Does

| Technology | Used For |
|-----------|----------|
| **MCP Client (Browser)** | Native MCP protocol implementation, event-driven tool execution, real-time updates |
| **Express.js** | HTTP server, serves frontend, MCP protocol proxy, REST API endpoints |
| **Gemini + Groq** (`openai`-compatible SDK) | Natural language understanding, decides which Zomato tools to call, generates formatted responses |
| **MCP SDK** (`@modelcontextprotocol/sdk`) | MCP Client that connects to Zomato server, discovers tools, sends tool calls |
| **mcp-remote** (`npx mcp-remote`) | Proxy that bridges stdio↔HTTP and handles OAuth 2.0 + PKCE since Zomato only whitelists specific redirect URIs |
| **markdown-it** (CDN) | Renders AI responses as rich markdown — tables, bold, headers, code blocks |
| **highlight.js** (CDN) | Syntax highlighting inside code blocks in AI responses |
| **dotenv** | Loads `GEMINI_API_KEY`, `GROQ_API_KEY`, and `PORT` from `.env` file |
| **uuid** | Generates unique session and chat IDs |
| **cors** | Enables cross-origin requests for API |
| **OAuth 2.0 + PKCE** | Secure authentication with Zomato — handled entirely by mcp-remote, auto-opens browser for login |
| **JSON file storage** | Persists chat history to `chat_history.json` — no database needed |
| **Glassmorphism CSS** | Frosted-glass dark theme UI with animations, responsive design |

---

## How It Works (MCP Apps Architecture)

### Connection Flow
1. User clicks **Connect to Zomato** → Browser MCP Client initiates connection
2. Frontend calls `/api/mcp/connect` → Backend spawns `npx mcp-remote`
3. mcp-remote initiates **OAuth 2.0 + PKCE** → auto-opens browser for Zomato login
4. User completes phone + OTP → mcp-remote receives and stores token
5. MCP Client connects via backend proxy → discovers available tools
6. Frontend receives `connect` event → UI updates with tool list
7. Status indicator shows **Connected** with animated pulse

### Chat + Tool Calling Flow (with MCP Apps)
1. User sends message (e.g., *"Find top rated Dosa near Koramangala"*)
2. Frontend adds message to UI → shows typing indicator
3. Backend receives message → builds chat context with history
4. Converts MCP tools → OpenAI-compatible function-calling format
5. Calls **Gemini** with tools → AI decides to call `search_restaurants`
6. Backend executes tool via MCP Client → receives results
7. Backend sends tool result back to Gemini/Groq → generates formatted response
8. Frontend receives response → removes typing indicator
9. Parses `[[ACTION:...]]` markers → renders interactive buttons
10. Updates order stage tracker (Search/Menu/Cart/Payment)
11. Event listeners update UI state in real-time

### Direct Tool Execution (New in v2.0)
The browser can also call MCP tools directly:
1. User clicks action button → triggers tool execution
2. Frontend calls `/api/mcp/call-tool` with tool name and args
3. Backend executes tool immediately via MCP Client
4. Returns result to frontend → UI updates instantly
5. No need for full AI round-trip for simple actions

---

##  Why Gemini + Groq Are Used

**Gemini is the primary "brain"** that understands your requests and decides:
- Which Zomato MCP tools to call (search, menu, cart, order, etc.)
- How to chain multiple tool calls (search → view menu → add to cart)
- How to format responses with tables, action buttons, and explanations

**The backend:**
- Translates MCP tool schemas → OpenAI-compatible function-calling format
- Sends tool execution results back to Gemini/Groq for interpretation
- Maintains conversation context for multi-turn interactions

**Without Gemini or Groq:** You could call MCP tools directly, but you'd lose:
- Natural language understanding
- Intelligent tool chaining
- Context-aware conversations
- Formatted, user-friendly responses

---

##  Installation

### Prerequisites
- Node.js 18+
- npm
- Gemini API key
- Groq API key

### Clone and Install

```bash
# Clone the repository
git clone https://github.com/SharanGS/MCP-Zomato.git
cd MCP-Zomato

# Install dependencies
npm install

# Create .env file with your Gemini and Groq API keys
echo "GEMINI_API_KEY=your-gemini-api-key-here" > .env
echo "GROQ_API_KEY=your-groq-api-key-here" >> .env
echo "PORT=3000" >> .env
```

---

##  Usage

### Start the Server

```bash
npm start
```

The server will start at `http://localhost:3000`

### First Time Setup

1. Open `http://localhost:3000` in your browser
2. Click **"Start Ordering Now"** on the landing page
3. Allow location access when prompted (optional but recommended)
4. The app will **auto-connect** to Zomato MCP
5. A browser window will open for **Zomato OAuth login**
6. Complete phone number + OTP verification
7. Once authenticated, the connection status will show **"Connected"**
8. Start chatting! Try: *"Find the best biryani restaurants near me"*

### Sample Conversations

```
You: Find top rated South Indian restaurants near Koramangala
AI: [Calls search_restaurants] Here are the top South Indian restaurants...
    [Shows restaurant cards with ratings, reviews, delivery time]
    [[ACTION:View Menu:restaurant_id]] buttons

You: Show me the menu for MTR
AI: [Calls get_menu] Here's the menu for MTR...
    [Large dish images with prices, veg/non-veg indicators]
    [[ACTION:Add to Cart:dish_id]] buttons

You: Add 2 Masala Dosa and 1 Filter Coffee to cart
AI: [Calls add_to_cart] Added items to your cart!
    [Shows cart summary with total]

You: Find me the best offers
AI: [Calls get_offers] Here are the best offers available...
    [Shows offer cards with discount percentages]
    [Automatically applies best offer]

You: Place the order to my home address
AI: [Calls place_order] Order placed successfully!
    [Shows order summary, delivery time, payment QR code]
```

---

##  MCP Apps Implementation Details

### Browser MCP Client (`public/mcp-client.js`)

The browser-based MCP client implements:

```javascript
class MCPClient {
    async connect()     // Connect to MCP server via backend proxy
    async disconnect()  // Disconnect from MCP server
    async discover()    // Discover tools, resources, prompts
    async callTool()    // Execute an MCP tool
    on(event, callback) // Subscribe to MCP events
}
```

**Events:**
- `connect` - Fired when successfully connected
- `disconnect` - Fired when disconnected
- `error` - Fired on connection/execution errors
- `tool-update` - Fired when tools are discovered
- `connecting` - Fired when connection is in progress

### Backend MCP Proxy (`routes/api.js`)

New MCP Apps endpoints:

```javascript
POST   /api/mcp/connect      // Connect to MCP server
POST   /api/mcp/disconnect   // Disconnect from MCP server
GET    /api/mcp/tools        // List available tools
POST   /api/mcp/call-tool    // Execute a tool directly
GET    /api/mcp/resources    // List available resources
POST   /api/mcp/get-prompt   // Get a prompt template
```

### Frontend Integration (`public/app-mcp.js`)

Event-driven architecture:

```javascript
// Subscribe to MCP events
mcpClient.on('connect', (data) => {
    updateUI();
    showToolsList();
});

mcpClient.on('tool-update', (tools) => {
    renderTools(tools);
});

// Direct tool execution
async function handleActionClick(action) {
    const result = await mcpClient.callTool(toolName, args);
    updateUI(result);
}
```

---

##  UI/UX Enhancements

### Glassmorphism Design
- Frosted glass surfaces with backdrop blur
- Subtle shadows and borders
- Smooth animations and transitions
- Dark theme optimized for readability

### Interactive Components
- **Status Indicator** - Animated pulse when connected
- **Tool Cards** - Visual representation of available MCP tools
- **Step Tracker** - Visual progress through order stages
- **Action Buttons** - One-click actions from AI responses
- **Typing Indicator** - Animated dots while AI is thinking
- **Notifications** - Toast messages for important events

### Responsive Design
- Mobile-first approach
- Adapts to tablet and desktop
- Touch-friendly interfaces
- Optimized for all screen sizes

---

## 📁 Project Structure

**Gemini and Groq power the intelligent features of this application.** Without at least one configured provider, there is no AI assistant.

### What the API Key Enables:
-  **Natural Language Understanding** - Converts your casual requests like "I want cheap biryani nearby" into structured tool calls
-  **Context Awareness** - Remembers the entire conversation so when you say "add the cheapest one", it knows which restaurant's menu you're viewing
-  **Smart Decision Making** - Decides which Zomato tools to call based on your intent (search, menu, cart, checkout)
-  **Tool Call Chaining** - Executes multiple operations in sequence (e.g., search → show menu → add to cart) from a single message
-  **Error Recovery** - Automatically finds alternative restaurants if one is offline, expands search if no results found
-  **Formatted Responses** - Generates beautiful tables, comparison charts, and action buttons for easy interaction
-  **Offer Optimization** - Analyzes available discounts and recommends the best savings

### How It Works:
1. Your message goes to **Gemini** first, with **Groq** as fallback
2. The model analyzes your intent with a detailed system prompt containing ordering and checkout rules
3. It decides which Zomato MCP tools to call (search_restaurants, get_menu, add_to_cart, etc.)
4. It maintains conversation context across multiple turns
5. It formats the response with markdown, tables, and action buttons

**Cost:** Gemini and Groq both charge by model usage. Monitor the provider you configure in your respective console.

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
│   ├── chat.js            # Gemini + Groq tool calling loop
│   └── storage.js         # JSON file chat persistence
├── public/
│   ├── index.html         # Dashboard layout + step tracker
│   ├── style.css          # Glassmorphism design (~1300 lines)
│   └── app.js             # Action buttons, chips, step tracker logic
├── .env                   # GEMINI_API_KEY, GROQ_API_KEY, PORT
└── package.json           # Dependencies
```

---

## Getting Started

### Prerequisites
- **Node.js** (v18 or higher)
- **Gemini API Key** ⚡ **REQUIRED** - Primary provider for chat orchestration
- **Groq API Key** - Fallback provider for fast responses
- **Internet connection** (for MCP OAuth and API calls)

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/Sharan-G-S/MCP-Zomato-Test.git
cd MCP-Zomato

# 2. Install dependencies
npm install

# 3.  ADD YOUR API KEYS TO .env
# The .env file should contain your Gemini and Groq keys
# You can verify by checking: cat .env

# 4. Start the server
npm start

# 5. Open browser
# Visit http://localhost:3000
# Click "Connect to Zomato" → complete OAuth login → start ordering!
```

**Note:** Your provider keys are stored in `.env` which should stay ignored by Git. Never share this file.

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


## Key Design Decisions

| Decision | Why |
|----------|-----|
| MCP Client (not server) | Zomato hosts the server — we consume their tools |
| mcp-remote proxy | Zomato whitelists specific OAuth URIs only — mcp-remote handles this |
| Gemini/Groq tool calling | Function calling maps naturally to MCP tools |
| `[[ACTION:...]]` markers | AI responses become interactive with clickable buttons |
| Vanilla frontend | No build tools needed — glassmorphism CSS + markdown-it for premium feel |
| JSON file storage | Simple persistence, no database dependency |

---

## 📁 Project Structure

```
MCP-Zomato/
├── server.js                 # Main Express server
├── package.json              # Dependencies and scripts
├── .env                      # Environment variables (GEMINI_API_KEY, GROQ_API_KEY)
├── chat_history.json         # Persisted chat history
├── README.md                 # This file
├── routes/
│   └── api.js               # REST + MCP proxy endpoints
├── services/
│   ├── mcp.js               # MCP Client (backend)
│   ├── chat.js              # Gemini + Groq integration
│   └── storage.js           # JSON chat persistence
└── public/                  # Frontend (served as static files)
    ├── index.html           # Single-page app with landing
    ├── style.css            # Glassmorphism design system
    ├── mcp-client.js        # Browser MCP Client (NEW in v2.0)
    ├── app-mcp.js           # MCP Apps architecture (NEW in v2.0)
    ├── app-new.js           # Legacy app (kept for reference)
    └── app.js               # Original app (kept for reference)
```

### Key Files Explained

**Backend:**
- `server.js` - Express server setup, serves static files
- `routes/api.js` - All API endpoints including new MCP proxy routes
- `services/mcp.js` - MCP client using mcp-remote for Zomato OAuth
- `services/chat.js` - OpenAI integration with tool calling
- `services/storage.js` - Simple JSON file-based chat history

**Frontend (MCP Apps):**
- `mcp-client.js` - **Browser-based MCP client** with event system
- `app-mcp.js` - **Event-driven app logic** for MCP Apps architecture
- `index.html` - Landing page + dashboard UI
- `style.css` - Complete design system with 3700+ lines of CSS

---

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the root directory:

```bash
# Required
GEMINI_API_KEY=your-gemini-api-key-here
GROQ_API_KEY=your-groq-api-key-here

# Optional
PORT=3000
```

### Provider API Keys

1. Create or copy your Gemini API key and place it in `.env`
2. Add your Groq API key as fallback in `.env`
3. Restart the server after changing provider keys

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
- **"AI provider not configured"**: Make sure `GEMINI_API_KEY` or `GROQ_API_KEY` is present in `.env`
- **Rate limit errors**: Check your Gemini or Groq quota and usage dashboard
- **Restaurant offline**: The AI will automatically suggest alternative restaurants

### Data Issues
- **Reset chat history**: Delete `chat_history.json` file and restart server
- **Corrupted data**: Backup and delete `chat_history.json`, it will regenerate automatically


## Disclaimer

For **testing purposes only**. Per Zomato: *"Third party apps on Zomato MCP are not allowed due to security and legal considerations."*


**Built with** Node.js · Express · Gemini + Groq · MCP Protocol · Zomato MCP Server


# Sharan G S
