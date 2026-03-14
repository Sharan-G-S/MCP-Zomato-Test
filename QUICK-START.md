# Quick Start Guide - MCP Apps Architecture

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ installed
- Gemini API key
- Groq API key
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Installation

1. **Navigate to the project directory:**
```bash
cd /Users/sharan/Desktop/September-AI/MCP-Zomato
```

2. **Install dependencies:**
```bash
npm install
```

3. **Create environment file:**
```bash
echo "GEMINI_API_KEY=your-gemini-api-key-here" > .env
echo "GROQ_API_KEY=your-groq-api-key-here" >> .env
echo "PORT=3000" >> .env
```

4. **Start the server:**
```bash
npm start
```

5. **Open in browser:**
```
http://localhost:3000
```

## 🎯 Using the App

### First Time Setup

1. **Landing Page**
   - Click "Start Ordering Now" button
   - Or click "Detect Location" to enable GPS

2. **Connection**
   - App automatically connects to Zomato MCP
   - A browser window will open for OAuth login
   - Enter your phone number
   - Complete OTP verification
   - Wait for "Connected" status (green pulse indicator)

3. **Start Chatting**
   - Once connected, the input field becomes active
   - Try: "Find the best biryani restaurants near me"

### Features to Try

#### 1. Restaurant Search
```
"Find top rated South Indian restaurants near Koramangala"
"Show me pizza places with 4+ rating"
"What are the best budget restaurants under ₹200?"
```

#### 2. Menu Browsing
```
"Show me the menu for MTR"
"What dishes does Empire Restaurant have?"
"Show me desserts from this restaurant"
```

#### 3. Cart Management
```
"Add 2 Masala Dosa and 1 Filter Coffee"
"Add extra cheese to my pizza"
"Show me my cart"
"Remove the last item"
```

#### 4. Offers and Discounts
```
"Find me the best offers"
"Apply coupon code FLAT50"
"What discounts are available?"
```

#### 5. Order Placement
```
"Place the order to my home address"
"Deliver to my office"
"Use my saved address"
```

## 🎨 UI Components

### Status Indicator
- **Green pulse** = Connected to Zomato MCP
- **Amber pulse** = Connecting...
- **Gray** = Disconnected

### Step Tracker
Shows your progress through:
1. 🔍 Search
2. 📋 Menu
3. 🛒 Cart
4. 🎁 Offers
5. 💳 Payment

### Action Buttons
AI responses include clickable buttons:
- **View Menu** - Opens restaurant menu
- **Add to Cart** - Adds item to your cart
- **Apply Offer** - Applies discount
- **Place Order** - Completes the order

### Tool Cards
Left panel shows available MCP tools:
- search_restaurants
- get_menu
- add_to_cart
- get_offers
- place_order
- And more...

## 🔧 Troubleshooting

### Connection Issues

**Problem:** "Connection timeout"
**Solution:** 
- Check your internet connection
- Try refreshing the page
- Click "Connect to Zomato" again

**Problem:** OAuth popup blocked
**Solution:**
- Enable popups for localhost:3000
- Click the connect button again

**Problem:** "Maximum connection attempts reached"
**Solution:**
- Refresh the page
- Clear browser cache
- Restart the server

### API Issues

**Problem:** "AI provider not configured"
**Solution:**
- Check your .env file
- Make sure GEMINI_API_KEY or GROQ_API_KEY is set correctly
- Restart the server

**Problem:** Rate limit errors
**Solution:**
- Check your Gemini or Groq usage limits
- Wait or upgrade your plan

### Display Issues

**Problem:** Tools not showing
**Solution:**
- Wait for connection to complete (up to 2 minutes)
- Check browser console for errors
- Refresh the page

**Problem:** Messages not rendering
**Solution:**
- Check browser console for errors
- Make sure markdown-it and highlight.js loaded
- Clear browser cache

## 💡 Pro Tips

### 1. Use Natural Language
The AI understands context, so you can say:
- "That one" (referring to previous restaurant)
- "Add more of the same" (adds last item again)
- "Make it spicy" (adds customization)

### 2. Chain Multiple Actions
You can request multiple things at once:
```
"Find biryani restaurants, show me the menu of the top rated one, 
and add their special biryani to cart"
```

### 3. Location Matters
- Click "Detect Location" for accurate nearby results
- Or specify: "Find restaurants near Indiranagar"
- Save your addresses for faster ordering

### 4. Ask for Details
```
"What are the reviews saying about this place?"
"How long will delivery take?"
"What payment methods are supported?"
```

### 5. Visual Inspection
- Look for the green pulse = you're connected
- Check the step tracker to see where you are
- Tool calls appear below AI messages

## 🎓 Understanding MCP Apps

### What's Different?

**Traditional Architecture:**
- Client → REST API → Server logic

**MCP Apps Architecture:**
- Client (Browser) → MCP Protocol → MCP Server
- Direct tool execution
- Event-driven updates
- Real-time feedback

### Benefits

1. **Faster Response**
   - Direct browser-to-MCP communication
   - No unnecessary backend processing

2. **Real-time Updates**
   - Connection status
   - Tool discovery
   - Execution feedback

3. **Better UX**
   - Animated status indicators
   - Progressive enhancement
   - Immediate error feedback

4. **Follows Standards**
   - Official MCP Apps specification
   - Industry best practices
   - Future-proof architecture

## 📚 Additional Resources

- **README.md** - Complete documentation
- **MCP-APPS-IMPLEMENTATION.md** - Technical implementation details
- [MCP Apps Docs](https://modelcontextprotocol.io/extensions/apps/overview)
- [MCP Blog](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/)

## 🆘 Getting Help

### Check Console
1. Press F12 or right-click → Inspect
2. Go to Console tab
3. Look for errors (red text)
4. Share error messages if asking for help

### Common Console Messages

**Good:**
```
[MCP App] Ready
[MCP App] Connecting to Zomato MCP server...
[MCP App] Connected to MCP server
[MCP Client] Discovered 6 tools
```

**Needs Attention:**
```
[MCP App] Connection failed: ...
[ERROR] MCP connection failed: ...
Failed to fetch
```

## ✅ Success Indicators

You'll know everything is working when you see:
- ✅ Green pulsing status dot
- ✅ "Connected to Zomato" text
- ✅ Tool count showing 6+ tools
- ✅ Message input is enabled
- ✅ AI responds to your messages
- ✅ Action buttons appear in responses
- ✅ Step tracker updates as you progress

## 🎉 Ready to Order!

Once you see the green pulse and tool list, you're ready to:
1. Search for restaurants
2. Browse menus with beautiful images
3. Add items to cart
4. Apply offers automatically
5. Place orders with one click

Enjoy your AI-powered food ordering experience! 🍕🍔🍜

---

**Need Help?** Check the console, read the README, or review the implementation guide.
