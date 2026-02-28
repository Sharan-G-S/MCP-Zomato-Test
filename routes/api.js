import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getMCPState, connectToMCP, disconnectMCP, clearConnectionError, getMCPTools } from '../services/mcp.js';
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

export default router;
