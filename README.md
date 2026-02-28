# Zomato MCP Chat Interface - Test

AI-powered food ordering assistant that connects to Zomato's MCP (Model Context Protocol) server. Search restaurants, browse menus, and order food through natural language chat powered by OpenAI GPT.

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



## Disclaimer

This project is for educational and testing purposes only. Zomato's MCP server disclaimer states they are not allowing third-party apps built on top of Zomato MCP at this time.

# Sharan G S
