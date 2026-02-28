import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

// --- Config ---
const ZOMATO_MCP_URL = 'https://mcp-server.zomato.com/mcp';

// --- State ---
let mcpClient = null;
let mcpTransport = null;
let mcpTools = [];
let mcpConnected = false;
let mcpConnecting = false;
let connectionError = null;

// --- Getters ---
export function getMCPState() {
    return {
        connected: mcpConnected,
        connecting: mcpConnecting,
        toolCount: mcpTools.length,
        tools: mcpTools.map(t => ({ name: t.name, description: t.description })),
        error: connectionError,
    };
}

export function getMCPTools() {
    return mcpTools;
}

export function isMCPConnected() {
    return mcpConnected && mcpClient;
}

// --- MCP Connection via mcp-remote ---
export async function disconnectMCP() {
    try { if (mcpClient) await mcpClient.close().catch(() => { }); } catch (e) { }
    try { if (mcpTransport) await mcpTransport.close().catch(() => { }); } catch (e) { }
    mcpClient = null;
    mcpTransport = null;
    mcpConnected = false;
    mcpConnecting = false;
    mcpTools = [];
}

export async function connectToMCP() {
    if (mcpConnecting) {
        return {
            success: false,
            connecting: true,
            error: 'Connection in progress. Please wait while browser opens for Zomato login...',
        };
    }
    if (mcpConnected && mcpClient) {
        return { success: true, tools: mcpTools.map(t => ({ name: t.name, description: t.description })) };
    }

    await disconnectMCP();

    mcpConnecting = true;
    connectionError = null;

    // Start connection in background - don't block the HTTP request
    startMCPConnection();
    
    return {
        success: false,
        connecting: true,
        message: 'Starting connection... Browser will open for Zomato login. Please complete the authentication.',
    };
}

async function startMCPConnection() {
    try {
        console.log('[MCP] Starting connection via mcp-remote...');
        console.log('[MCP] A browser window will open for Zomato OAuth login.');
        console.log('[MCP] Please complete the login to proceed.');

        // Use mcp-remote as the transport — this handles OAuth automatically
        mcpTransport = new StdioClientTransport({
            command: 'npx',
            args: ['-y', 'mcp-remote', ZOMATO_MCP_URL],
            env: { ...process.env },
        });

        mcpClient = new Client(
            { name: 'zomato-mcp-chat', version: '2.0.0' },
            { capabilities: {} }
        );

        // Connect with timeout
        const connectPromise = mcpClient.connect(mcpTransport);
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Connection timeout after 120 seconds. Please try again.')), 120000)
        );
        
        await Promise.race([connectPromise, timeoutPromise]);
        
        console.log('[OK] MCP transport connected successfully via mcp-remote');

        const toolsResult = await mcpClient.listTools();
        mcpTools = toolsResult.tools || [];
        console.log(`[TOOLS] Discovered ${mcpTools.length} tools from Zomato MCP:`);
        mcpTools.forEach(t => console.log(`   - ${t.name}: ${t.description?.substring(0, 80)}`));

        mcpConnected = true;
        mcpConnecting = false;

        console.log('[SUCCESS] Zomato MCP connection fully established!');
    } catch (err) {
        console.error('[ERROR] MCP connection failed:', err.message);
        connectionError = err.message;
        mcpConnected = false;
        mcpConnecting = false;
        await disconnectMCP();
    }
}

export async function callMCPTool(toolName, args) {
    if (!mcpClient || !mcpConnected) {
        throw new Error('MCP not connected. Please connect first.');
    }
    console.log(`[TOOL] Calling: ${toolName}`, JSON.stringify(args).substring(0, 200));
    const result = await mcpClient.callTool({ name: toolName, arguments: args });
    console.log(`[OK] Tool ${toolName} returned result`);
    return result;
}

export function clearConnectionError() {
    connectionError = null;
}
