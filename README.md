# Zomato MCP Chat Interface

AI-powered food ordering assistant that connects to Zomato's MCP (Model Context Protocol) server. Search restaurants, browse menus, and order food through natural language chat powered by OpenAI GPT-4o.

## Architecture

```
Browser Chat UI  -->  Express Backend  -->  OpenAI GPT-4o (tool calling)
                           |
                      mcp-remote  -->  Zomato MCP Server (OAuth)
```

- **Frontend**: Premium dark-themed chat interface with Zomato branding
- **Backend**: Express server acting as MCP client proxy
- **MCP**: Connects to `https://mcp-server.zomato.com/mcp` via `mcp-remote`
- **LLM**: OpenAI GPT-4o with function/tool calling for natural language to MCP tool invocation

## Features

- One-click Zomato MCP connection with OAuth authentication
- Real-time tool call indicators in chat
- Auth URL displayed in UI if browser does not open automatically
- Stale OAuth token cleanup before each connection attempt
- Suggestion chips for common food queries
- Session-based conversation history
- Multi-turn tool calling loops (GPT-4o can call multiple tools per request)

## Zomato MCP Tools

Once connected, the following Zomato capabilities are available:

- **Restaurant Discovery** - Find nearby restaurants by location, cuisine, and preferences
- **Menu Browsing** - View detailed menus with prices, descriptions, and ratings
- **Cart Creation** - Add items to cart and customize orders
- **Food Ordering** - Place orders with tracking support
- **QR Code Payment** - Secure payments via QR code

## Setup

### Prerequisites
- Node.js 18+
- OpenAI API Key (GPT-4o)
- Zomato account (for MCP OAuth)

### Installation

```bash
git clone https://github.com/Sharan-G-S/MCP-Zomato-Test.git
cd MCP-Zomato-Test
npm install
```

### Configuration

Create a `.env` file:

```
OPENAI_API_KEY=your_openai_api_key_here
PORT=3000
```

### Running

```bash
npm start
```

Open `http://localhost:3000` in your browser.

### Usage

1. Click **Connect to Zomato** in the header
2. A browser window opens for Zomato OAuth login
3. Enter your Zomato phone number and complete OTP verification
4. Once connected, start chatting to find restaurants and order food

## Troubleshooting

### "Missing cookies for OTP verification"
This is a known Zomato MCP server issue. The app automatically cleans stale OAuth tokens before each connection attempt. Click **Reset Connection** in the chat and try again.

### OTP not delivered
Zomato's OTP service can be intermittent. Wait 1-2 minutes and retry.

### Connection timeout
The OAuth flow has a 5-minute timeout. Make sure to complete the Zomato login promptly in the browser window that opens.

## Disclaimer

This project is for educational and testing purposes only. Zomato's MCP server disclaimer states they are not allowing third-party apps built on top of Zomato MCP at this time.

---

Made by Sharan G S
