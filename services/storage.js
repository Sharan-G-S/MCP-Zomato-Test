import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..');
const HISTORY_FILE = join(DATA_DIR, 'chat_history.json');

// --- JSON helpers ---
function loadJSON(filename, defaultVal = {}) {
    try {
        if (!fs.existsSync(filename)) {
            saveJSON(filename, defaultVal);
            return defaultVal;
        }
        const raw = fs.readFileSync(filename, 'utf-8');
        const data = JSON.parse(raw);
        return typeof data === 'object' && data !== null ? data : defaultVal;
    } catch {
        return defaultVal;
    }
}

function saveJSON(filename, data) {
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
}

// --- Chat History ---
export function getAllChats(sessionId) {
    const history = loadJSON(HISTORY_FILE, {});
    const sessions = history[sessionId] || [];
    return sessions.map(s => ({ id: s.id, title: s.title, createdAt: s.createdAt }));
}

export function getChatMessages(sessionId, chatId) {
    const history = loadJSON(HISTORY_FILE, {});
    const sessions = history[sessionId] || [];
    const chat = sessions.find(s => s.id === chatId);
    return chat ? chat.messages : [];
}

export function createNewChat(sessionId, title = 'New Chat') {
    const history = loadJSON(HISTORY_FILE, {});
    if (!history[sessionId]) history[sessionId] = [];

    const newId = uuidv4();
    history[sessionId].unshift({
        id: newId,
        title,
        createdAt: Date.now(),
        messages: []
    });
    saveJSON(HISTORY_FILE, history);
    return newId;
}

export function addMessage(sessionId, chatId, role, content) {
    const history = loadJSON(HISTORY_FILE, {});
    if (!history[sessionId]) history[sessionId] = [];

    let chat = history[sessionId].find(s => s.id === chatId);
    if (!chat) {
        // Auto-create a chat if it doesn't exist
        chat = {
            id: chatId,
            title: 'New Chat',
            createdAt: Date.now(),
            messages: []
        };
        history[sessionId].unshift(chat);
    }

    chat.messages.push({ role, content, timestamp: Date.now() });

    // Auto-title: set title from first user message
    if (chat.title === 'New Chat' && role === 'user') {
        chat.title = content.length <= 40 ? content : content.substring(0, 37) + '...';
    }

    saveJSON(HISTORY_FILE, history);
    return chat.id;
}

export function deleteChat(sessionId, chatId) {
    const history = loadJSON(HISTORY_FILE, {});
    if (history[sessionId]) {
        history[sessionId] = history[sessionId].filter(s => s.id !== chatId);
        saveJSON(HISTORY_FILE, history);
    }
}
