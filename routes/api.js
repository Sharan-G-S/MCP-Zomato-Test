import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getMCPState, connectToMCP, disconnectMCP, clearConnectionError, getMCPTools, callMCPTool, isMCPConnected } from '../services/mcp.js';
import { chatWithOpenAI } from '../services/chat.js';
import { getAllChats, getChatMessages, createNewChat, deleteChat } from '../services/storage.js';

const router = Router();

// --- Connection Status ---
router.get('/api/status', (req, res) => {
    const state = getMCPState();
    res.json(state);
});

// --- Connect to Zomato MCP ---
router.post('/api/connect', async (req, res) => {
    try {
        const result = await connectToMCP();
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- Disconnect / Reset ---
router.post('/api/disconnect', async (req, res) => {
    try {
        await disconnectMCP();
        clearConnectionError();
        res.json({ success: true, message: 'Disconnected and cleared auth state.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- List available tools ---
router.get('/api/tools', (req, res) => {
    const state = getMCPState();
    const tools = getMCPTools();
    res.json({
        connected: state.connected,
        tools: tools.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
        })),
    });
});

// --- Chat ---
router.post('/api/chat', async (req, res) => {
    try {
        const { message, sessionId, chatId, history, location } = req.body;
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }
        const sid = sessionId || uuidv4();
        const cid = chatId || createNewChat(sid, 'New Chat');
        const result = await chatWithOpenAI(sid, cid, message, history || [], location);
        res.json({ ...result, sessionId: sid });
    } catch (err) {
        console.error('[ERROR] Chat:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- Session ---
router.post('/api/session', (req, res) => {
    const sessionId = uuidv4();
    res.json({ sessionId });
});

// --- Chat History ---
router.get('/api/chats', (req, res) => {
    const { sessionId } = req.query;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
    const chats = getAllChats(sessionId);
    res.json({ chats });
});

router.get('/api/chats/:chatId', (req, res) => {
    const { sessionId } = req.query;
    const { chatId } = req.params;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
    const messages = getChatMessages(sessionId, chatId);
    res.json({ messages });
});

router.post('/api/chats/new', (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
    const chatId = createNewChat(sessionId);
    res.json({ chatId });
});

router.delete('/api/chats/:chatId', (req, res) => {
    const { sessionId } = req.query;
    const { chatId } = req.params;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
    deleteChat(sessionId, chatId);
    res.json({ success: true });
});

// ============================================================
// MCP APPS ARCHITECTURE - Direct MCP Protocol Endpoints
// ============================================================

// --- MCP Connect (for browser client) ---
router.post('/api/mcp/connect', async (req, res) => {
    try {
        const result = await connectToMCP();
        const sessionId = uuidv4();
        
        if (result.success) {
            res.json({ 
                success: true, 
                sessionId,
                tools: result.tools 
            });
        } else {
            res.json({ 
                success: false, 
                connecting: result.connecting,
                message: result.message || result.error
            });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- MCP Disconnect ---
router.post('/api/mcp/disconnect', async (req, res) => {
    try {
        await disconnectMCP();
        clearConnectionError();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- MCP List Tools ---
router.get('/api/mcp/tools', (req, res) => {
    const state = getMCPState();
    const tools = getMCPTools();
    res.json({
        connected: state.connected,
        tools: tools.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
        })),
    });
});

// --- MCP List Resources ---
router.get('/api/mcp/resources', (req, res) => {
    const state = getMCPState();
    res.json({
        connected: state.connected,
        resources: [],  // Zomato MCP may not provide resources
    });
});

// --- MCP Call Tool (direct from browser) ---
router.post('/api/mcp/call-tool', async (req, res) => {
    try {
        const { toolName, arguments: args } = req.body;
        
        if (!toolName) {
            return res.status(400).json({ error: 'toolName is required' });
        }

        if (!isMCPConnected()) {
            return res.status(503).json({ 
                error: 'MCP not connected. Please connect first.' 
            });
        }

        const result = await callMCPTool(toolName, args || {});
        res.json({ success: true, result });
    } catch (err) {
        console.error('[ERROR] MCP Tool Call:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- MCP Read Resource ---
router.post('/api/mcp/read-resource', async (req, res) => {
    try {
        const { uri } = req.body;
        
        if (!uri) {
            return res.status(400).json({ error: 'uri is required' });
        }

        // Zomato MCP may not support resources, but we provide the endpoint
        res.json({ 
            success: false, 
            error: 'Resources not supported by this MCP server' 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- MCP Get Prompt ---
router.post('/api/mcp/get-prompt', async (req, res) => {
    try {
        const { name, arguments: args } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'name is required' });
        }

        // Zomato MCP may not support prompts, but we provide the endpoint
        res.json({ 
            success: false, 
            error: 'Prompts not supported by this MCP server' 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
