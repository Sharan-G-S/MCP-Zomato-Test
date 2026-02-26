import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- Config -----------------------------------------------------------------
const PORT = process.env.PORT || 3000;
const ZOMATO_MCP_URL = 'https://mcp-server.zomato.com/mcp';

// --- Express Setup ----------------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// --- State ------------------------------------------------------------------
let mcpClient = null;
let mcpTransport = null;
let mcpTools = [];
let mcpConnected = false;
let mcpConnecting = false;
let connectionError = null;
let authUrl = null;

// Session-based conversation histories
const sessions = new Map();

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      id: sessionId,
      messages: [],
      createdAt: Date.now()
    });
  }
  return sessions.get(sessionId);
}

// --- Stale Token Cleanup ----------------------------------------------------
// mcp-remote stores OAuth lockfiles and tokens in ~/.mcp-auth/
// Stale files cause "Missing cookies for OTP verification" and similar errors.
// We clean them before each connection attempt.

function cleanStaleAuthFiles() {
  const authDir = join(os.homedir(), '.mcp-auth');
  try {
    if (!fs.existsSync(authDir)) return;
    const entries = fs.readdirSync(authDir);
    for (const entry of entries) {
      const entryPath = join(authDir, entry);
      const stat = fs.statSync(entryPath);
      if (stat.isDirectory()) {
        // Remove all files inside mcp-remote-* directories
        const files = fs.readdirSync(entryPath);
        for (const file of files) {
          const filePath = join(entryPath, file);
          fs.unlinkSync(filePath);
          console.log(`[CLEANUP] Removed stale auth file: ${filePath}`);
        }
        fs.rmdirSync(entryPath);
        console.log(`[CLEANUP] Removed stale auth directory: ${entryPath}`);
      }
    }
  } catch (err) {
    console.log(`[CLEANUP] Warning: Could not clean auth files: ${err.message}`);
  }
}

// --- MCP Client Manager -----------------------------------------------------

async function disconnectMCP() {
  try {
    if (mcpClient) {
      await mcpClient.close().catch(() => { });
    }
  } catch (e) { /* ignore */ }
  try {
    if (mcpTransport) {
      await mcpTransport.close().catch(() => { });
    }
  } catch (e) { /* ignore */ }
  mcpClient = null;
  mcpTransport = null;
  mcpConnected = false;
  mcpConnecting = false;
  mcpTools = [];
  authUrl = null;
}

async function connectToMCP() {
  if (mcpConnecting) {
    return {
      success: false,
      error: 'Connection already in progress. Complete the Zomato login in the browser window, or wait for it to time out and try again.',
      authUrl
    };
  }
  if (mcpConnected && mcpClient) {
    return { success: true, tools: mcpTools.map(t => ({ name: t.name, description: t.description })) };
  }

  // Clean up any previous failed connection and stale auth tokens
  await disconnectMCP();
  cleanStaleAuthFiles();

  mcpConnecting = true;
  connectionError = null;
  authUrl = null;

  try {
    console.log('[MCP] Starting connection to Zomato...');
    console.log('[MCP] A browser window will open for Zomato OAuth login.');
    console.log('[MCP] Complete the phone number + OTP login in the browser.');

    // Spawn mcp-remote as a child process - it handles OAuth internally
    mcpTransport = new StdioClientTransport({
      command: 'npx',
      args: ['-y', 'mcp-remote', ZOMATO_MCP_URL, '--allow-http'],
      env: { ...process.env },
    });

    // Listen for stderr to capture the auth URL and debug info
    mcpTransport.stderr?.on('data', (data) => {
      const line = data.toString();
      // Capture the OAuth authorization URL
      const urlMatch = line.match(/(https:\/\/mcp-server\.zomato\.com\/authorize\S+)/);
      if (urlMatch) {
        authUrl = urlMatch[1];
        console.log('[AUTH] Authorization URL captured');
        console.log('[AUTH] If the browser did not open, visit this URL manually:');
        console.log(`[AUTH] ${authUrl}`);
      }
      // Log mcp-remote output for debugging
      if (line.trim()) {
        console.log('[mcp-remote]', line.trim());
      }
    });

    mcpClient = new Client(
      { name: 'zomato-mcp-chat', version: '1.0.0' },
      { capabilities: {} }
    );

    // Connect with a generous 5-minute timeout for OAuth
    const connectPromise = mcpClient.connect(mcpTransport);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(
        'Connection timed out. Zomato OAuth login was not completed within 5 minutes. ' +
        'This often happens when Zomato fails to send the OTP or cookies are missing. ' +
        'Please try again -- stale tokens have been cleaned up.'
      )), 300000)
    );

    await Promise.race([connectPromise, timeoutPromise]);
    console.log('[OK] MCP transport connected successfully');

    // Discover available tools
    const toolsResult = await mcpClient.listTools();
    mcpTools = toolsResult.tools || [];
    console.log(`[TOOLS] Discovered ${mcpTools.length} tools from Zomato MCP:`);
    mcpTools.forEach(t => console.log(`   - ${t.name}: ${t.description?.substring(0, 80)}`));

    mcpConnected = true;
    mcpConnecting = false;
    authUrl = null;

    return { success: true, tools: mcpTools.map(t => ({ name: t.name, description: t.description })) };
  } catch (err) {
    console.error('[ERROR] MCP connection failed:', err.message);
    connectionError = err.message;
    const savedAuthUrl = authUrl;
    await disconnectMCP();
    return {
      success: false,
      error: err.message,
      authUrl: savedAuthUrl,
      help: 'Stale tokens have been cleaned. Click "Connect to Zomato" to try again. ' +
        'When the browser opens, enter your Zomato phone number and complete OTP verification. ' +
        'If Zomato fails to send OTP, wait a minute before retrying.'
    };
  }
}

async function callMCPTool(toolName, args) {
  if (!mcpClient || !mcpConnected) {
    throw new Error('MCP not connected. Please connect first.');
  }
  console.log(`[TOOL] Calling: ${toolName}`, JSON.stringify(args).substring(0, 200));
  const result = await mcpClient.callTool({ name: toolName, arguments: args });
  console.log(`[OK] Tool ${toolName} returned result`);
  return result;
}

// --- Convert MCP tools to OpenAI function-calling format --------------------

function mcpToolsToOpenAIFunctions(tools) {
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description || `Zomato MCP tool: ${tool.name}`,
      parameters: tool.inputSchema || { type: 'object', properties: {} }
    }
  }));
}

// --- OpenAI Chat with Tool Calling ------------------------------------------

async function chatWithOpenAI(sessionId, userMessage) {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey || openaiKey === 'your_openai_api_key_here') {
    throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY in the .env file.');
  }

  const openai = new OpenAI({ apiKey: openaiKey });
  const session = getSession(sessionId);

  const systemMessage = {
    role: 'system',
    content: `You are a helpful food ordering assistant powered by Zomato. You can help users:
- Find restaurants nearby based on their location and preferences
- Browse restaurant menus with prices, descriptions, and ratings
- Add items to cart and customize orders
- Place food orders
- Track order status
- Generate QR codes for payment

When users ask about food, restaurants, or ordering, use the available Zomato tools to fulfill their requests.
Be conversational, friendly, and helpful. When showing restaurant or menu results, format them nicely with clear structure. Do not use emojis in your responses.
If a tool requires location, ask the user for their location/address.
Always confirm orders before placing them.`
  };

  // Add user message to history
  session.messages.push({ role: 'user', content: userMessage });

  const messages = [systemMessage, ...session.messages];

  const openaiTools = mcpConnected && mcpTools.length > 0
    ? mcpToolsToOpenAIFunctions(mcpTools)
    : undefined;

  const toolCalls = [];

  try {
    let response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      tools: openaiTools,
      tool_choice: openaiTools ? 'auto' : undefined,
      temperature: 0.7,
      max_tokens: 4096,
    });

    let assistantMessage = response.choices[0].message;

    // Handle tool calling loop (max 10 iterations)
    let iterations = 0;
    while (assistantMessage.tool_calls && iterations < 10) {
      iterations++;
      session.messages.push(assistantMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        let toolArgs = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments || '{}');
        } catch (e) {
          toolArgs = {};
        }

        toolCalls.push({
          id: toolCall.id,
          name: toolName,
          args: toolArgs,
          status: 'calling'
        });

        try {
          const mcpResult = await callMCPTool(toolName, toolArgs);
          let resultText = '';
          if (mcpResult.content) {
            resultText = mcpResult.content
              .map(c => c.text || JSON.stringify(c))
              .join('\n');
          } else {
            resultText = JSON.stringify(mcpResult);
          }

          toolCalls[toolCalls.length - 1].status = 'success';
          toolCalls[toolCalls.length - 1].result = resultText.substring(0, 500);

          session.messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: resultText
          });
        } catch (err) {
          console.error(`[ERROR] Tool ${toolName}:`, err.message);
          toolCalls[toolCalls.length - 1].status = 'error';
          toolCalls[toolCalls.length - 1].error = err.message;

          session.messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: `Error calling tool: ${err.message}`
          });
        }
      }

      response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [systemMessage, ...session.messages],
        tools: openaiTools,
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: 4096,
      });

      assistantMessage = response.choices[0].message;
    }

    const finalContent = assistantMessage.content || 'I processed your request but did not get a text response.';
    session.messages.push({ role: 'assistant', content: finalContent });

    return {
      response: finalContent,
      toolCalls,
      sessionId
    };
  } catch (err) {
    console.error('[ERROR] OpenAI:', err.message);
    throw err;
  }
}

// --- API Routes -------------------------------------------------------------

// Check MCP connection status
app.get('/api/status', (req, res) => {
  res.json({
    connected: mcpConnected,
    connecting: mcpConnecting,
    toolCount: mcpTools.length,
    tools: mcpTools.map(t => ({ name: t.name, description: t.description })),
    error: connectionError,
    authUrl: authUrl,
  });
});

// Connect to Zomato MCP
app.post('/api/connect', async (req, res) => {
  try {
    const result = await connectToMCP();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Disconnect from Zomato MCP (for clean retry)
app.post('/api/disconnect', async (req, res) => {
  try {
    await disconnectMCP();
    cleanStaleAuthFiles();
    connectionError = null;
    res.json({ success: true, message: 'Disconnected and cleared stale auth tokens.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// List available tools
app.get('/api/tools', (req, res) => {
  res.json({
    connected: mcpConnected,
    tools: mcpTools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  });
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const sid = sessionId || uuidv4();
    const result = await chatWithOpenAI(sid, message);
    res.json(result);
  } catch (err) {
    console.error('[ERROR] Chat:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Create new session
app.post('/api/session', (req, res) => {
  const sessionId = uuidv4();
  getSession(sessionId);
  res.json({ sessionId });
});

// --- Start Server -----------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n[SERVER] Zomato MCP Chat Server running at http://localhost:${PORT}`);
  console.log(`[MCP] Zomato MCP URL: ${ZOMATO_MCP_URL}`);
  console.log(`\nOpen http://localhost:${PORT} in your browser to start chatting!\n`);
});
