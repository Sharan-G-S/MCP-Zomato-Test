import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import os from 'os';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- Config -----------------------------------------------------------------
const PORT = process.env.PORT || 3000;
const ZOMATO_MCP_URL = 'https://mcp-server.zomato.com/mcp';
const OAUTH_CALLBACK_PORT = 9876;
const OAUTH_CALLBACK_URL = `http://localhost:${OAUTH_CALLBACK_PORT}/oauth/callback`;

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
let oauthCallbackServer = null;

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
function cleanStaleAuthFiles() {
  const authDir = join(os.homedir(), '.mcp-auth');
  try {
    if (!fs.existsSync(authDir)) return;
    const entries = fs.readdirSync(authDir);
    for (const entry of entries) {
      const entryPath = join(authDir, entry);
      const stat = fs.statSync(entryPath);
      if (stat.isDirectory()) {
        const files = fs.readdirSync(entryPath);
        for (const file of files) {
          fs.unlinkSync(join(entryPath, file));
        }
        fs.rmdirSync(entryPath);
        console.log(`[CLEANUP] Removed stale auth dir: ${entry}`);
      }
    }
  } catch (err) {
    console.log(`[CLEANUP] Warning: ${err.message}`);
  }
}

// --- In-Memory OAuth Client Provider ----------------------------------------
// Implements the OAuthClientProvider interface from @modelcontextprotocol/sdk
// to handle Zomato's OAuth flow on our server side.

class ServerOAuthProvider {
  constructor() {
    this._redirectUrl = OAUTH_CALLBACK_URL;
    this._clientMetadata = {
      client_name: 'Zomato MCP Chat',
      redirect_uris: [OAUTH_CALLBACK_URL],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post'
    };
    this._clientInformation = undefined;
    this._tokens = undefined;
    this._codeVerifier = undefined;
    this._authResolve = null;
  }

  get redirectUrl() {
    return this._redirectUrl;
  }

  get clientMetadata() {
    return this._clientMetadata;
  }

  clientInformation() {
    return this._clientInformation;
  }

  saveClientInformation(info) {
    this._clientInformation = info;
  }

  tokens() {
    return this._tokens;
  }

  saveTokens(tokens) {
    this._tokens = tokens;
    console.log('[AUTH] Tokens saved successfully');
  }

  redirectToAuthorization(authorizationUrl) {
    authUrl = authorizationUrl.toString();
    console.log('[AUTH] Authorization required. URL captured.');
    console.log('[AUTH] Open this URL in your browser:');
    console.log(`[AUTH] ${authUrl}`);
  }

  saveCodeVerifier(verifier) {
    this._codeVerifier = verifier;
  }

  codeVerifier() {
    if (!this._codeVerifier) {
      throw new Error('No code verifier saved');
    }
    return this._codeVerifier;
  }
}

// --- OAuth Callback Server --------------------------------------------------
// Starts a temporary HTTP server to receive the OAuth callback after
// user completes Zomato login

function startOAuthCallbackServer() {
  return new Promise((resolve, reject) => {
    let authCodeResolve;
    const authCodePromise = new Promise((res) => { authCodeResolve = res; });

    oauthCallbackServer = http.createServer((req, res) => {
      if (req.url?.startsWith('/oauth/callback')) {
        const url = new URL(req.url, `http://localhost:${OAUTH_CALLBACK_PORT}`);
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (code) {
          console.log('[AUTH] Authorization code received');
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html><body style="background:#0a0a0f;color:#f0f0f5;font-family:Inter,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0">
              <div style="text-align:center">
                <h1 style="color:#2ecc71">Authorization Successful</h1>
                <p style="color:#9999bb">You can close this window and return to the chat.</p>
              </div>
            </body></html>
          `);
          authCodeResolve(code);
        } else if (error) {
          console.log(`[AUTH] Authorization error: ${error}`);
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html><body style="background:#0a0a0f;color:#f0f0f5;font-family:Inter,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0">
              <div style="text-align:center">
                <h1 style="color:#e74c3c">Authorization Failed</h1>
                <p style="color:#9999bb">Error: ${error}</p>
                <p style="color:#9999bb">Close this window and try again.</p>
              </div>
            </body></html>
          `);
          authCodeResolve(null);
        } else {
          res.writeHead(400);
          res.end('Bad request');
        }
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    oauthCallbackServer.listen(OAUTH_CALLBACK_PORT, () => {
      console.log(`[AUTH] OAuth callback server running at ${OAUTH_CALLBACK_URL}`);
      resolve({ authCodePromise, authCodeResolve });
    });

    oauthCallbackServer.on('error', (err) => {
      console.error('[AUTH] Callback server error:', err.message);
      reject(err);
    });
  });
}

function stopOAuthCallbackServer() {
  if (oauthCallbackServer) {
    oauthCallbackServer.close();
    oauthCallbackServer = null;
  }
}

// --- MCP Client Manager -----------------------------------------------------
async function disconnectMCP() {
  try { if (mcpClient) await mcpClient.close().catch(() => { }); } catch (e) { }
  try { if (mcpTransport) await mcpTransport.close().catch(() => { }); } catch (e) { }
  stopOAuthCallbackServer();
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
      error: 'Connection already in progress. Complete the Zomato login in the browser, or click Reset and try again.',
      authUrl
    };
  }
  if (mcpConnected && mcpClient) {
    return { success: true, tools: mcpTools.map(t => ({ name: t.name, description: t.description })) };
  }

  // Clean up previous state
  await disconnectMCP();
  cleanStaleAuthFiles();

  mcpConnecting = true;
  connectionError = null;
  authUrl = null;

  try {
    console.log('[MCP] Starting connection to Zomato...');

    // Create OAuth provider
    const oauthProvider = new ServerOAuthProvider();

    // Start OAuth callback server
    const { authCodePromise } = await startOAuthCallbackServer();

    // Create StreamableHTTP transport (direct HTTP, no mcp-remote)
    const serverUrl = new URL(ZOMATO_MCP_URL);
    mcpTransport = new StreamableHTTPClientTransport(serverUrl, {
      authProvider: oauthProvider,
    });

    mcpClient = new Client(
      { name: 'zomato-mcp-chat', version: '1.0.0' },
      { capabilities: {} }
    );

    try {
      // First connection attempt - will trigger OAuth redirect
      await mcpClient.connect(mcpTransport);
      console.log('[OK] Connected directly (token was already valid)');
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        console.log('[AUTH] OAuth required, waiting for user to authorize...');

        // Wait for the auth code from the callback server (5 min timeout)
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(
            'Authorization timed out after 5 minutes. Please try again.'
          )), 300000)
        );

        const authCode = await Promise.race([authCodePromise, timeoutPromise]);

        if (!authCode) {
          throw new Error('Authorization was rejected or failed. Please try again.');
        }

        console.log('[AUTH] Finishing auth with code...');
        await mcpTransport.finishAuth(authCode);

        // Reconnect with authenticated transport
        console.log('[MCP] Reconnecting with authenticated transport...');
        mcpClient = new Client(
          { name: 'zomato-mcp-chat', version: '1.0.0' },
          { capabilities: {} }
        );
        mcpTransport = new StreamableHTTPClientTransport(serverUrl, {
          authProvider: oauthProvider,
        });
        await mcpClient.connect(mcpTransport);
      } else {
        throw error;
      }
    }

    console.log('[OK] MCP transport connected successfully');
    stopOAuthCallbackServer();

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
      help: 'Click "Connect to Zomato" to try again. Complete the Zomato login in the browser that opens. If OTP fails, wait a minute before retrying.'
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

        toolCalls.push({ id: toolCall.id, name: toolName, args: toolArgs, status: 'calling' });

        try {
          const mcpResult = await callMCPTool(toolName, toolArgs);
          let resultText = '';
          if (mcpResult.content) {
            resultText = mcpResult.content.map(c => c.text || JSON.stringify(c)).join('\n');
          } else {
            resultText = JSON.stringify(mcpResult);
          }

          toolCalls[toolCalls.length - 1].status = 'success';
          toolCalls[toolCalls.length - 1].result = resultText.substring(0, 500);
          session.messages.push({ role: 'tool', tool_call_id: toolCall.id, content: resultText });
        } catch (err) {
          console.error(`[ERROR] Tool ${toolName}:`, err.message);
          toolCalls[toolCalls.length - 1].status = 'error';
          toolCalls[toolCalls.length - 1].error = err.message;
          session.messages.push({ role: 'tool', tool_call_id: toolCall.id, content: `Error: ${err.message}` });
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

    return { response: finalContent, toolCalls, sessionId };
  } catch (err) {
    console.error('[ERROR] OpenAI:', err.message);
    throw err;
  }
}

// --- API Routes -------------------------------------------------------------

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

app.post('/api/connect', async (req, res) => {
  try {
    const result = await connectToMCP();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/disconnect', async (req, res) => {
  try {
    await disconnectMCP();
    cleanStaleAuthFiles();
    connectionError = null;
    res.json({ success: true, message: 'Disconnected and cleared auth state.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

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

app.post('/api/session', (req, res) => {
  const sessionId = uuidv4();
  getSession(sessionId);
  res.json({ sessionId });
});

// --- Start Server -----------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n[SERVER] Zomato MCP Chat Server running at http://localhost:${PORT}`);
  console.log(`[MCP] Zomato MCP URL: ${ZOMATO_MCP_URL}`);
  console.log(`[AUTH] OAuth callback will be at: ${OAUTH_CALLBACK_URL}`);
  console.log(`\nOpen http://localhost:${PORT} in your browser to start chatting!\n`);
});
