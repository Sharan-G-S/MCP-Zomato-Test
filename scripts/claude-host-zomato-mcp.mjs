#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_API_BASE = process.env.ZOMATO_WEB_API_BASE || 'http://localhost:3000';
const WIDGET_URI = 'ui://widget/zomato-interactive.html';
const WIDGET_HTML = readFileSync(join(__dirname, 'zomato-widget.html'), 'utf8');

function pickRestaurantsFromChatResponse(chatResponse) {
  const toolCalls = Array.isArray(chatResponse?.toolCalls) ? chatResponse.toolCalls : [];
  const restaurantCall = toolCalls.find(
    (call) => /get_restaurants_for_keyword/i.test(call?.name || '') && call?.status === 'success' && call?.data
  );

  const restaurants = restaurantCall?.data?.restaurants;
  if (Array.isArray(restaurants)) return restaurants;
  return [];
}

function pickMenuFromChatResponse(chatResponse) {
  const toolCalls = Array.isArray(chatResponse?.toolCalls) ? chatResponse.toolCalls : [];
  const menuCall = toolCalls.find(
    (call) => /get_menu_items_listing/i.test(call?.name || '') && call?.status === 'success' && call?.data
  );

  if (!menuCall?.data) return null;

  const data = menuCall.data;
  const categories =
    data?.categories ||
    data?.menu?.categories ||
    data?.result?.categories ||
    data?.result?.menu?.categories ||
    [];

  if (Array.isArray(categories) && categories.length > 0) {
    const items = categories.flatMap((category) => category?.items || category?.menu_items || []);
    return {
      restaurantName: data?.restaurant?.name || data?.restaurant_name || '',
      items
    };
  }

  const flatItems =
    data?.items ||
    data?.menu_items ||
    data?.result?.items ||
    data?.result?.menu_items ||
    [];

  return {
    restaurantName: data?.restaurant?.name || data?.restaurant_name || '',
    items: Array.isArray(flatItems) ? flatItems : []
  };
}

async function createSessionAndChat(apiBaseUrl) {
  const sessionRes = await fetch(`${apiBaseUrl}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });

  if (!sessionRes.ok) {
    throw new Error(`Session creation failed (${sessionRes.status})`);
  }

  const sessionData = await sessionRes.json();
  const sessionId = sessionData.sessionId;

  const chatRes = await fetch(`${apiBaseUrl}/api/chats/new`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId })
  });

  if (!chatRes.ok) {
    throw new Error(`Chat creation failed (${chatRes.status})`);
  }

  const chatData = await chatRes.json();
  return { sessionId, chatId: chatData.chatId };
}

async function sendChatMessage(apiBaseUrl, sessionId, chatId, message, history = []) {
  const res = await fetch(`${apiBaseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      sessionId,
      chatId,
      history
    })
  });

  if (!res.ok) {
    throw new Error(`Chat failed (${res.status})`);
  }

  return res.json();
}

async function callChat(apiBaseUrl, message, history = []) {
  const { sessionId, chatId } = await createSessionAndChat(apiBaseUrl);
  return sendChatMessage(apiBaseUrl, sessionId, chatId, message, history);
}

function extractQrUrlFromText(text) {
  const value = String(text || '');
  const match = value.match(/https?:\/\/[^\s)]+(?:qr|qrcode|upi)[^\s)]*/i);
  return match ? match[0] : '';
}

function pickCheckoutFromChatResponse(chatResponse) {
  const toolCalls = Array.isArray(chatResponse?.toolCalls) ? chatResponse.toolCalls : [];

  const cartCall = toolCalls.find(
    (call) => /(get_cart|add_to_cart|create_cart)/i.test(call?.name || '') && call?.status === 'success' && call?.data
  );

  const offersCall = toolCalls.find(
    (call) => /(offer|coupon|discount)/i.test(call?.name || '') && call?.status === 'success' && call?.data
  );

  const paymentCall = toolCalls.find(
    (call) => /(payment|upi|qr|checkout)/i.test(call?.name || '') && call?.status === 'success' && call?.data
  );

  const cartData = cartCall?.data || {};
  const paymentData = paymentCall?.data || {};
  const offersData = offersCall?.data || {};

  const qrUrl =
    paymentData?.qr_url ||
    paymentData?.qrUrl ||
    paymentData?.qr_code_url ||
    paymentData?.qrCodeUrl ||
    paymentData?.upi_qr ||
    paymentData?.upiQr ||
    paymentData?.payment_qr ||
    paymentData?.paymentQr ||
    extractQrUrlFromText(chatResponse?.response || '');

  const items =
    cartData?.items ||
    cartData?.cart?.items ||
    paymentData?.items ||
    [];

  const offers =
    offersData?.offers ||
    offersData?.coupons ||
    offersData?.available_offers ||
    [];

  const total =
    cartData?.total ||
    cartData?.cart?.total ||
    paymentData?.amount ||
    paymentData?.total ||
    null;

  return {
    cart: {
      items: Array.isArray(items) ? items : [],
      total
    },
    offers: Array.isArray(offers) ? offers : [],
    payment: {
      method: 'UPI',
      qrUrl,
      amount: total,
      upiIntent: paymentData?.upi_intent || paymentData?.upiIntent || paymentData?.payment_link || paymentData?.paymentLink || ''
    }
  };
}

async function buildCheckoutFlow(apiBaseUrl, restaurant, dish) {
  const { sessionId, chatId } = await createSessionAndChat(apiBaseUrl);

  const history = [];
  const prompts = [];

  if (restaurant && dish) {
    prompts.push(`Show me the menu for restaurant ${restaurant} and add one ${dish} to my cart`);
  } else if (restaurant) {
    prompts.push(`Show me the menu for restaurant ${restaurant} and add one popular item to my cart`);
  } else if (dish) {
    prompts.push(`Add one ${dish} to my cart from a top-rated restaurant nearby`);
  } else {
    prompts.push('Show my current cart and continue checkout');
  }

  prompts.push('Show available coupons and apply the best coupon to my cart');
  prompts.push('Proceed to payment with UPI and generate QR code');

  let lastResponse = null;
  for (const prompt of prompts) {
    lastResponse = await sendChatMessage(apiBaseUrl, sessionId, chatId, prompt, history);
    history.push({ role: 'user', content: prompt });
    history.push({ role: 'assistant', content: String(lastResponse?.response || '') });
  }

  return lastResponse;
}

const server = new McpServer({
  name: 'zomato-interactive-ui',
  version: '1.0.0'
});

server.registerResource(
  'zomato-interactive-widget',
  WIDGET_URI,
  {
    title: 'Zomato Interactive Widget',
    description: 'Interactive restaurant and menu UI rendered inside MCP hosts.',
    mimeType: 'text/html'
  },
  async () => ({
    contents: [
      {
        uri: WIDGET_URI,
        mimeType: 'text/html',
        text: WIDGET_HTML
      }
    ]
  })
);

server.registerTool(
  'zomato_search_ui',
  {
    title: 'Zomato Search (Interactive UI)',
    description: 'Search restaurants via the existing Zomato web backend and render interactive cards in host UI.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language restaurant query' },
        apiBaseUrl: { type: 'string', description: 'Optional backend base URL, defaults to http://localhost:3000' }
      },
      required: ['query']
    }
  },
  async ({ query, apiBaseUrl }) => {
    const baseUrl = apiBaseUrl || DEFAULT_API_BASE;
    const chatResponse = await callChat(baseUrl, query);
    const restaurants = pickRestaurantsFromChatResponse(chatResponse);

    return {
      content: [
        {
          type: 'text',
          text: restaurants.length
            ? `Found ${restaurants.length} restaurants for "${query}".`
            : `No restaurant cards found for "${query}". The backend may need MCP auth connection.`
        }
      ],
      structuredContent: {
        view: 'restaurants',
        query,
        restaurants
      },
      _meta: {
        'openai/outputTemplate': WIDGET_URI,
        'openai/widgetDescription': 'Interactive restaurant results with local filtering and quick menu actions.',
        requestId: randomUUID()
      }
    };
  }
);

server.registerTool(
  'zomato_menu_ui',
  {
    title: 'Zomato Menu (Interactive UI)',
    description: 'Load menu for a specific restaurant and render it in host UI.',
    inputSchema: {
      type: 'object',
      properties: {
        restaurant: { type: 'string', description: 'Restaurant name' },
        apiBaseUrl: { type: 'string', description: 'Optional backend base URL, defaults to http://localhost:3000' }
      },
      required: ['restaurant']
    }
  },
  async ({ restaurant, apiBaseUrl }) => {
    const baseUrl = apiBaseUrl || DEFAULT_API_BASE;
    const chatResponse = await callChat(baseUrl, `Show me the menu for restaurant ${restaurant}`);
    const menu = pickMenuFromChatResponse(chatResponse) || { restaurantName: restaurant, items: [] };

    return {
      content: [
        {
          type: 'text',
          text: menu.items.length
            ? `Loaded ${menu.items.length} menu items for ${restaurant}.`
            : `Menu loaded for ${restaurant}, but no items were found in structured data.`
        }
      ],
      structuredContent: {
        view: 'menu',
        restaurantName: menu.restaurantName || restaurant,
        items: menu.items
      },
      _meta: {
        'openai/outputTemplate': WIDGET_URI,
        'openai/widgetDescription': 'Interactive menu view for selected restaurant.',
        requestId: randomUUID()
      }
    };
  }
);

server.registerTool(
  'zomato_checkout_ui',
  {
    title: 'Zomato Checkout (Interactive UI)',
    description: 'Build cart, apply coupon, and show payment/UPI QR in an interactive checkout widget.',
    inputSchema: {
      type: 'object',
      properties: {
        restaurant: { type: 'string', description: 'Optional restaurant name for checkout context' },
        dish: { type: 'string', description: 'Optional dish/item to add before checkout' },
        apiBaseUrl: { type: 'string', description: 'Optional backend base URL, defaults to http://localhost:3000' }
      }
    }
  },
  async ({ restaurant, dish, apiBaseUrl }) => {
    const baseUrl = apiBaseUrl || DEFAULT_API_BASE;
    const finalChatResponse = await buildCheckoutFlow(baseUrl, restaurant, dish);
    const checkout = pickCheckoutFromChatResponse(finalChatResponse || {});

    return {
      content: [
        {
          type: 'text',
          text: checkout.payment.qrUrl
            ? 'Checkout prepared with coupon and UPI QR.'
            : 'Checkout prepared, but UPI QR was not found in structured response.'
        }
      ],
      structuredContent: {
        view: 'checkout',
        ...checkout
      },
      _meta: {
        'openai/outputTemplate': WIDGET_URI,
        'openai/widgetDescription': 'Interactive checkout view with coupon and UPI QR.',
        requestId: randomUUID()
      }
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
