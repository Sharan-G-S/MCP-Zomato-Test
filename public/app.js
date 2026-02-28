// =============================================================
// Zomato MCP Chat — Smart Dashboard Client
// =============================================================

// --- Markdown Renderer ---
const md = window.markdownit({
    html: false,
    linkify: true,
    typographer: true,
    highlight: function (str, lang) {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return '<pre class="hljs"><code>' +
                    hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
                    '</code></pre>';
            } catch (__) { }
        }
        return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + '</code></pre>';
    }
});

// --- State ---
let sessionId = null;
let activeChatId = null;
let isConnected = false;
let isSending = false;
let connectPollTimer = null;
let sidebarOpen = true;
let conversationHistory = [];
let currentOrderStage = 'search'; // search | menu | cart | offers | payment
let userLocation = null; // { lat, lng, label }
let selectedDeliveryAddress = null; // Store selected delivery address
let selectedPaymentMethod = 'UPI'; // Store selected payment method

// --- DOM Elements ---
const messagesArea = document.getElementById('messagesArea');
const messageInput = document.getElementById('messageInput');
const btnSend = document.getElementById('btnSend');
const btnConnect = document.getElementById('btnConnect');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const toolsPanel = document.getElementById('toolsPanel');
const toolsList = document.getElementById('toolsList');
const toolCount = document.getElementById('toolCount');
const emptyState = document.getElementById('emptyState');
const chatList = document.getElementById('chatList');
const sidebar = document.getElementById('sidebar');
const contextChips = document.getElementById('contextChips');
const stepTracker = document.getElementById('stepTracker');

// =============================================================
// STEP TRACKER
// =============================================================
const STAGES = ['search', 'menu', 'cart', 'offers', 'payment'];

function updateStepTracker(stage) {
    currentOrderStage = stage;
    const stageIndex = STAGES.indexOf(stage);
    const steps = stepTracker.querySelectorAll('.step');
    const lines = stepTracker.querySelectorAll('.step-line');

    steps.forEach((step, i) => {
        step.classList.remove('active', 'completed');
        if (i < stageIndex) {
            step.classList.add('completed');
        } else if (i === stageIndex) {
            step.classList.add('active');
        }
    });

    lines.forEach((line, i) => {
        line.classList.toggle('completed', i < stageIndex);
    });

    updateContextChips(stage);
}

// Auto-detect stage from response content and tool calls
function detectOrderStage(responseText, toolCalls = []) {
    const text = responseText.toLowerCase();
    const toolNames = toolCalls.map(tc => tc.name?.toLowerCase() || '');

    // Payment stage
    if (text.includes('qr code') || text.includes('payment') || text.includes('pay now') ||
        text.includes('payment link') || text.includes('scan') ||
        toolNames.some(t => t.includes('payment') || t.includes('qr') || t.includes('pay'))) {
        return 'payment';
    }

    // Offers stage
    if (text.includes('offer') || text.includes('coupon') || text.includes('discount') ||
        text.includes('promo') || text.includes('% off') ||
        toolNames.some(t => t.includes('offer') || t.includes('coupon') || t.includes('promo'))) {
        return 'offers';
    }

    // Cart stage
    if (text.includes('cart') || text.includes('added to') || text.includes('order summary') ||
        text.includes('subtotal') || text.includes('your order') ||
        toolNames.some(t => t.includes('cart') || t.includes('add') || t.includes('order'))) {
        return 'cart';
    }

    // Menu stage
    if (text.includes('menu') || text.includes('items available') || text.includes('categories') ||
        text.includes('appetizer') || text.includes('main course') || text.includes('dessert') ||
        toolNames.some(t => t.includes('menu') || t.includes('item'))) {
        return 'menu';
    }

    // Search stage
    if (text.includes('restaurant') || text.includes('found') || text.includes('nearby') ||
        text.includes('search') || text.includes('results') ||
        toolNames.some(t => t.includes('search') || t.includes('restaurant') || t.includes('find'))) {
        return 'search';
    }

    return currentOrderStage;
}

// =============================================================
// CONTEXT-AWARE CHIPS
// =============================================================
const CHIP_SETS = {
    search: [
        { label: 'Best rated nearby', msg: 'Show me the best rated restaurants near me' },
        { label: 'Under ₹200', msg: 'Find budget meals under 200 rupees near me' },
        { label: 'Biryani', msg: 'Best biryani restaurants near me' },
        { label: 'South Indian', msg: 'Top rated South Indian food near me' },
        { label: 'Fast delivery', msg: 'Restaurants with fastest delivery near me' },
        { label: 'Veg only', msg: 'Show only vegetarian restaurants near me' },
    ],
    menu: [
        { label: 'Popular items', msg: 'Show me the most popular items from this restaurant' },
        { label: 'Recommended', msg: 'What do you recommend from the menu?' },
        { label: 'Veg options', msg: 'Show only vegetarian items from the menu' },
        { label: 'Under ₹150', msg: 'Show menu items under 150 rupees' },
        { label: 'Best combo', msg: 'What is the best combo or meal deal?' },
    ],
    cart: [
        { label: 'View cart', msg: 'Show my current cart' },
        { label: 'Add more', msg: 'I want to add more items' },
        { label: 'Check offers', msg: 'Are there any offers available for my order?' },
        { label: 'Checkout', msg: 'Proceed to checkout' },
        { label: 'Clear cart', msg: 'Clear my cart' },
    ],
    offers: [
        { label: 'Apply best offer', msg: 'Apply the best available offer to my order' },
        { label: 'Show all offers', msg: 'Show me all available offers and coupons' },
        { label: 'Proceed to pay', msg: 'Proceed to payment' },
        { label: 'Add more items', msg: 'I want to add more items to qualify for a better offer' },
    ],
    payment: [
        { label: 'Generate QR', msg: 'Generate payment QR code' },
        { label: 'Order summary', msg: 'Show my final order summary' },
        { label: 'Track order', msg: 'Track my order status' },
        { label: 'Order again', msg: 'I want to order again' },
    ],
};

function updateContextChips(stage) {
    const chips = CHIP_SETS[stage] || CHIP_SETS.search;
    contextChips.innerHTML = chips.map(chip =>
        `<button class="context-chip" onclick="sendSuggestion('${escapeAttr(chip.msg)}')">
            <span>${escapeHtml(chip.label)}</span>
        </button>`
    ).join('');
}

// =============================================================
// ACTION BUTTON PARSING
// =============================================================
// Parse [[ACTION:label:message]] markers from AI responses
function parseActionButtons(text) {
    const actionRegex = /\[\[ACTION:(.*?):(.*?)\]\]/g;
    const buttons = [];
    let cleanText = text;

    let match;
    while ((match = actionRegex.exec(text)) !== null) {
        buttons.push({ label: match[1].trim(), message: match[2].trim() });
    }

    // Remove action markers from the text
    cleanText = cleanText.replace(/\[\[ACTION:.*?:.*?\]\]\n?/g, '').trim();

    return { cleanText, buttons };
}

function renderActionButtons(buttons) {
    if (buttons.length === 0) return '';

    const buttonIcons = {
        'View Menu': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
        'Add': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
        'Sort': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="14" y2="15"/><line x1="4" y1="3" x2="10" y2="3"/></svg>',
        'Filter': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>',
        'Offer': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
        'Pay': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
        'Track': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        'Order': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/></svg>',
    };

    // Find a matching icon key
    function getIcon(label) {
        for (const [key, svg] of Object.entries(buttonIcons)) {
            if (label.toLowerCase().includes(key.toLowerCase())) return svg;
        }
        // Default arrow icon
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>';
    }

    return '<div class="action-buttons">' +
        buttons.map(btn =>
            `<button class="action-btn-chat" onclick="sendSuggestion('${escapeAttr(btn.message)}')">${getIcon(btn.label)} ${escapeHtml(btn.label)}</button>`
        ).join('') +
        '</div>';
}

// =============================================================
// INITIALIZATION
// =============================================================
async function init() {
    const storedSession = localStorage.getItem('zomato_session_id');
    if (storedSession) {
        sessionId = storedSession;
    } else {
        try {
            const res = await fetch('/api/session', { method: 'POST' });
            const data = await res.json();
            sessionId = data.sessionId;
            localStorage.setItem('zomato_session_id', sessionId);
        } catch (e) {
            sessionId = crypto.randomUUID?.() || 'session-' + Date.now();
            localStorage.setItem('zomato_session_id', sessionId);
        }
    }

    // Request browser geolocation
    requestUserLocation();

    await loadChatList();
    checkStatus();
    updateContextChips('search');

    if (window.innerWidth <= 768) {
        sidebarOpen = false;
        sidebar.classList.add('closed');
    }
}

function requestUserLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            userLocation = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                label: `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`
            };
            console.log('[LOCATION] Got user location:', userLocation.label);
            showLocationBanner(); // Show location in UI
        },
        (err) => {
            console.log('[LOCATION] Could not get location:', err.message);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 }
    );
}

function showLocationBanner() {
    if (!userLocation) return;
    
    let locationBanner = document.getElementById('location-banner');
    if (!locationBanner) {
        locationBanner = document.createElement('div');
        locationBanner.id = 'location-banner';
        locationBanner.className = 'location-banner';
        document.body.appendChild(locationBanner);
    }
    
    locationBanner.innerHTML = `
        <div class="location-banner-content">
            <span class="location-icon">📍</span>
            <span class="location-text">Using your current location: ${escapeHtml(userLocation.label)}</span>
            <button class="location-close-btn" onclick="document.getElementById('location-banner').style.display='none'">×</button>
        </div>
    `;
}

// =============================================================
// SIDEBAR & CHAT HISTORY
// =============================================================
function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
    sidebar.classList.toggle('closed', !sidebarOpen);
}

async function loadChatList() {
    try {
        const res = await fetch(`/api/chats?sessionId=${sessionId}`);
        const data = await res.json();
        renderChatList(data.chats || []);
    } catch (e) {
        console.log('Failed to load chats:', e);
    }
}

function renderChatList(chats) {
    if (chats.length === 0) {
        chatList.innerHTML = '<div class="chat-list-empty">No conversations yet</div>';
        return;
    }

    chatList.innerHTML = chats.map(chat => `
        <div class="chat-item ${activeChatId === chat.id ? 'active' : ''}" onclick="loadChat('${chat.id}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span class="chat-title">${escapeHtml(chat.title)}</span>
            <button class="delete-chat" onclick="event.stopPropagation(); deleteChatItem('${chat.id}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
        </div>
    `).join('');
}

async function loadChat(chatId) {
    activeChatId = chatId;
    conversationHistory = [];
    currentOrderStage = 'search';

    try {
        const res = await fetch(`/api/chats/${chatId}?sessionId=${sessionId}`);
        const data = await res.json();
        const messages = data.messages || [];

        messagesArea.innerHTML = '';
        if (emptyState) emptyState.style.display = 'none';

        messages.forEach(msg => {
            addMessageToDOM(msg.role, msg.content);
            conversationHistory.push({ role: msg.role, content: msg.content });
        });

        if (messages.length === 0 && emptyState) {
            emptyState.style.display = '';
            messagesArea.appendChild(emptyState);
        }

        // Detect stage from last assistant message
        const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
        if (lastAssistant) {
            const stage = detectOrderStage(lastAssistant.content);
            updateStepTracker(stage);
        }

        scrollToBottom();
    } catch (e) {
        console.error('Failed to load chat:', e);
    }

    await loadChatList();
}

async function startNewChat() {
    activeChatId = null;
    conversationHistory = [];
    currentOrderStage = 'search';
    messagesArea.innerHTML = '';
    if (emptyState) {
        emptyState.style.display = '';
        messagesArea.appendChild(emptyState);
    }
    updateStepTracker('search');
    await loadChatList();

    if (window.innerWidth <= 768) {
        sidebarOpen = false;
        sidebar.classList.add('closed');
    }
}

async function deleteChatItem(chatId) {
    try {
        await fetch(`/api/chats/${chatId}?sessionId=${sessionId}`, { method: 'DELETE' });
        if (activeChatId === chatId) await startNewChat();
        await loadChatList();
    } catch (e) {
        console.error('Failed to delete chat:', e);
    }
}

// =============================================================
// CONNECTION
// =============================================================
async function checkStatus() {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        if (data.connected) {
            updateConnectionUI(true, data.tools);
        } else if (data.connecting) {
            setConnecting();
        }
    } catch (e) {
        console.log('Status check failed:', e);
    }
}

async function connectToZomato() {
    if (isConnected) return;
    setConnecting();
    addSystemMessage('🚀 Connecting to Zomato MCP... A <strong>browser window will open</strong> for Zomato login. Complete the OTP verification there.');
    addSystemMessage('⏳ <em>This may take 30-60 seconds. Please be patient while authentication completes...</em>');

    // Poll for connection status since mcp-remote blocks during OAuth
    let pollAttempts = 0;
    const maxAttempts = 60; // 60 * 2sec = 2 minutes
    
    connectPollTimer = setInterval(async () => {
        pollAttempts++;
        try {
            const s = await fetch('/api/status').then(r => r.json());
            if (s.connected) {
                clearInterval(connectPollTimer);
                updateConnectionUI(true, s.tools);
                addSystemMessage('✅ <strong>Connected to Zomato MCP!</strong> Discovered <span class="highlight">' + (s.tools?.length || 0) + ' tools</span>. Start ordering!');
            } else if (pollAttempts >= maxAttempts) {
                clearInterval(connectPollTimer);
                updateConnectionUI(false);
                addErrorMessage('Connection timeout. Please try clicking "Connect to Zomato" again.');
            } else if (s.error) {
                clearInterval(connectPollTimer);
                updateConnectionUI(false);
                addErrorMessage('Connection failed: ' + s.error);
            }
        } catch (e) { }
    }, 2000);

    try {
        const res = await fetch('/api/connect', { method: 'POST' });
        const data = await res.json();

        if (data.success) {
            clearInterval(connectPollTimer);
            updateConnectionUI(true, data.tools);
            addSystemMessage('✅ <strong>Connected to Zomato MCP!</strong> Discovered <span class="highlight">' + (data.tools?.length || 0) + ' tools</span>. Start ordering!');
        } else if (!data.connecting) {
            // Only clear polling if not connecting
            clearInterval(connectPollTimer);
            updateConnectionUI(false);
            addErrorMessage('Connection failed: ' + (data.error || 'Unknown error'));
        }
        // If connecting, let the polling continue
    } catch (err) {
        clearInterval(connectPollTimer);
        updateConnectionUI(false);
        addErrorMessage('Could not connect to the server. Make sure the server is running.');
    }
}

async function resetConnection() {
    try {
        clearInterval(connectPollTimer);
        await fetch('/api/disconnect', { method: 'POST' });
        updateConnectionUI(false);
        addSystemMessage('Connection reset. Click <strong>Connect to Zomato</strong> to try again.');
    } catch (e) {
        addErrorMessage('Failed to reset connection.');
    }
}

function setConnecting() {
    statusDot.className = 'status-dot connecting';
    statusText.textContent = 'Connecting...';
    btnConnect.disabled = true;
    btnConnect.querySelector('span').textContent = 'Connecting...';
}

function updateConnectionUI(connected, tools = []) {
    isConnected = connected;
    if (connected) {
        statusDot.className = 'status-dot connected';
        statusText.textContent = 'Connected';
        btnConnect.classList.add('connected');
        btnConnect.querySelector('span').textContent = 'Connected';
        btnConnect.disabled = true;

        if (tools.length > 0) {
            toolsPanel.classList.add('visible');
            toolCount.textContent = tools.length;
            toolsList.innerHTML = tools.map(t =>
                `<div class="tool-badge" title="${escapeHtml(t.description || '')}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                    ${escapeHtml(t.name)}
                </div>`
            ).join('');
        }
    } else {
        statusDot.className = 'status-dot disconnected';
        statusText.textContent = 'Disconnected';
        btnConnect.classList.remove('connected');
        btnConnect.querySelector('span').textContent = 'Connect to Zomato';
        btnConnect.disabled = false;
        toolsPanel.classList.remove('visible');
    }
}

// =============================================================
// CHAT
// =============================================================
function handleSubmit(e) {
    if (e) e.preventDefault();
    sendMessage();
}

function sendSuggestion(text) {
    messageInput.value = text;
    sendMessage();
}

async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message || isSending) return;

    if (emptyState) emptyState.style.display = 'none';

    addMessageToDOM('user', message);
    messageInput.value = '';
    isSending = true;
    btnSend.disabled = true;

    const typingId = showTypingIndicator();
    
    // Show loading skeleton for common queries
    const msg = message.toLowerCase();
    let skeletonId = null;
    if (msg.includes('restaurant') || msg.includes('search') || msg.includes('find') || 
        msg.includes('menu') || msg.includes('near') || msg.includes('dosa') || 
        msg.includes('biryani') || msg.includes('food') || msg.includes('dish') ||
        msg.includes('order') || msg.includes('top') || msg.includes('best') ||
        msg.includes('south indian') || msg.includes('chinese') || msg.includes('italian') ||
        msg.includes('pizza') || msg.includes('burger') || msg.includes('pani puri') ||
        msg.includes('cart') || msg.includes('offer') || msg.includes('cuisine') ||
        msg.includes('breakfast') || msg.includes('lunch') || msg.includes('dinner') ||
        msg.includes('veg') || msg.includes('non-veg') || msg.includes('rated')) {
        skeletonId = showSkeletonCard('search', Date.now());
    }

    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                sessionId,
                chatId: activeChatId,
                history: conversationHistory,
                location: userLocation
            })
        });

        const data = await res.json();
        removeTypingIndicator(typingId);
        if (skeletonId) removeSkeletonCard(skeletonId);

        if (data.error) {
            addErrorMessage(data.error);
        } else {
            if (data.toolCalls && data.toolCalls.length > 0) {
                data.toolCalls.forEach(tc => addToolCallIndicator(tc));
            }

            addMessageToDOM('assistant', data.response);

            conversationHistory.push({ role: 'user', content: message });
            conversationHistory.push({ role: 'assistant', content: data.response });

            if (data.chatId && !activeChatId) activeChatId = data.chatId;
            if (data.sessionId) {
                sessionId = data.sessionId;
                localStorage.setItem('zomato_session_id', sessionId);
            }

            // Smart: auto-detect and update order stage
            const detectedStage = detectOrderStage(data.response, data.toolCalls || []);
            updateStepTracker(detectedStage);

            await loadChatList();
        }
    } catch (err) {
        removeTypingIndicator(typingId);
        if (skeletonId) removeSkeletonCard(skeletonId);
        addErrorMessage('Failed to send message. Check if the server is running.');
    }

    isSending = false;
    btnSend.disabled = false;
    messageInput.focus();
}

// =============================================================
// MESSAGE RENDERING
// =============================================================
function addMessageToDOM(role, content) {
    const row = document.createElement('div');
    row.className = `message-row ${role}`;

    const avatarLabel = role === 'user' ? 'U' : 'Z';
    let renderedContent = '';
    let actionBtnHtml = '';

    if (role === 'assistant') {
        const { cleanText, buttons } = parseActionButtons(content || '');
        renderedContent = md.render(cleanText);
        actionBtnHtml = renderActionButtons(buttons);
    } else {
        renderedContent = escapeHtml(content || '');
    }

    row.innerHTML = `
        <div class="avatar">${avatarLabel}</div>
        <div class="bubble">${renderedContent}${actionBtnHtml}</div>
    `;

    messagesArea.appendChild(row);
    scrollToBottom();

    if (role === 'assistant') {
        row.querySelectorAll('pre code').forEach(block => {
            try { hljs.highlightElement(block); } catch (e) { }
        });
    }
}

function addSystemMessage(html) {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.innerHTML = html;
    messagesArea.appendChild(div);
    scrollToBottom();
}

function addErrorMessage(text) {
    const div = document.createElement('div');
    div.className = 'error-message';
    div.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        <span>${escapeHtml(text)}</span>
    `;
    messagesArea.appendChild(div);
    scrollToBottom();
}

function addAuthUrlMessage(url) {
    if (document.getElementById('auth-url-msg')) return;

    const div = document.createElement('div');
    div.className = 'auth-url-message';
    div.id = 'auth-url-msg';
    div.innerHTML = `
        <div class="auth-url-header">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <span>Zomato OAuth Login Required</span>
        </div>
        <p>A browser window should have opened for Zomato login. If not, click below:</p>
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="auth-url-link">Open Zomato Login Page</a>
        <p class="auth-url-help">Enter your phone number and complete OTP verification.</p>
        <button class="auth-url-reset" onclick="resetConnection()">Reset Connection</button>
    `;
    messagesArea.appendChild(div);
    scrollToBottom();
}

function addToolCallIndicator(tc) {
    const div = document.createElement('div');
    div.className = 'tool-call-indicator';

    const statusIcon = tc.status === 'success'
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>'
        : tc.status === 'error'
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e74c3c" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/></svg>'
            : '<div class="spinner"></div>';

    div.innerHTML = `
        <div class="tool-icon">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--zomato-red)" stroke-width="2">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
        </div>
        <div><span class="tool-name">${escapeHtml(tc.name)}</span></div>
        <div class="tool-status ${tc.status}">
            ${statusIcon}
            <span>${tc.status === 'success' ? 'Done' : tc.status === 'error' ? 'Failed' : 'Calling...'}</span>
        </div>
    `;

    messagesArea.appendChild(div);

    // Render interactive card if tool returned data
    if (tc.status === 'success') {
        const card = renderToolCard(tc.name, tc.data, tc.result);
        if (card) messagesArea.appendChild(card);
    }

    scrollToBottom();
}

// =============================================================
// SKELETON LOADING CARDS
// =============================================================
function showSkeletonCard(toolName, toolId) {
    const skeletonId = `skeleton-${toolId}`;
    const name = (toolName || '').toLowerCase();
    
    // Determine skeleton type based on tool name
    let skeletonContent = '';
    
    if (name.includes('restaurant') || name.includes('search')) {
        // Restaurant search skeleton - multiple items
        skeletonContent = `
            <div class="skeleton-item">
                <div class="skeleton-image"></div>
                <div class="skeleton-text">
                    <div class="skeleton-line long"></div>
                    <div class="skeleton-line medium"></div>
                    <div class="skeleton-line short"></div>
                </div>
            </div>
            <div class="skeleton-item">
                <div class="skeleton-image"></div>
                <div class="skeleton-text">
                    <div class="skeleton-line long"></div>
                    <div class="skeleton-line medium"></div>
                    <div class="skeleton-line short"></div>
                </div>
            </div>
            <div class="skeleton-item">
                <div class="skeleton-image"></div>
                <div class="skeleton-text">
                    <div class="skeleton-line long"></div>
                    <div class="skeleton-line medium"></div>
                    <div class="skeleton-line short"></div>
                </div>
            </div>
        `;
    } else if (name.includes('menu') || name.includes('items')) {
        // Menu skeleton - list of items
        skeletonContent = `
            <div class="skeleton-item">
                <div class="skeleton-text" style="width: 100%;">
                    <div class="skeleton-line long"></div>
                    <div class="skeleton-line medium"></div>
                </div>
            </div>
            <div class="skeleton-item">
                <div class="skeleton-text" style="width: 100%;">
                    <div class="skeleton-line long"></div>
                    <div class="skeleton-line medium"></div>
                </div>
            </div>
            <div class="skeleton-item">
                <div class="skeleton-text" style="width: 100%;">
                    <div class="skeleton-line long"></div>
                    <div class="skeleton-line medium"></div>
                </div>
            </div>
        `;
    } else {
        // Generic skeleton - simple content
        skeletonContent = `
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <div class="skeleton-line long"></div>
                <div class="skeleton-line medium"></div>
                <div class="skeleton-line short"></div>
            </div>
        `;
    }
    
    const skeleton = document.createElement('div');
    skeleton.id = skeletonId;
    skeleton.className = 'skeleton-card';
    skeleton.innerHTML = `
        <div class="skeleton-header">
            <div class="skeleton-icon"></div>
            <div class="skeleton-title"></div>
        </div>
        <div class="skeleton-content">
            ${skeletonContent}
        </div>
    `;
    
    messagesArea.appendChild(skeleton);
    scrollToBottom();
    
    return skeletonId;
}

function removeSkeletonCard(skeletonId) {
    const skeleton = document.getElementById(skeletonId);
    if (skeleton) {
        skeleton.remove();
    }
}

// =============================================================
// INTERACTIVE TOOL CARDS — Embedded Zomato UI Panels
// =============================================================
function renderToolCard(toolName, data, rawResult) {
    const name = (toolName || '').toLowerCase();

    // Address-related tools
    if (name.includes('address') || name.includes('location') || name.includes('saved_address')) {
        return buildAddressCard(data, rawResult);
    }
    // Restaurant search tools
    if (name.includes('restaurant') || name.includes('search') || name.includes('keyword')) {
        return buildRestaurantCard(data, rawResult);
    }
    // Menu tools
    if (name.includes('menu') || name.includes('items')) {
        return buildMenuCard(data, rawResult);
    }
    // Reviews and ratings
    if (name.includes('review') || name.includes('rating') || name.includes('feedback')) {
        return buildReviewsCard(data, rawResult);
    }
    // Cart tools
    if (name.includes('cart')) {
        return buildCartCard(data, rawResult);
    }
    // Offer/coupon tools
    if (name.includes('offer') || name.includes('coupon') || name.includes('discount') || name.includes('promo')) {
        return buildOffersCard(data, rawResult);
    }
    // Payment/order tools
    if (name.includes('payment') || name.includes('pay') || name.includes('qr') || name.includes('order') || name.includes('checkout')) {
        console.log('[PAYMENT CARD] Triggered for tool:', name);
        console.log('[PAYMENT CARD] Data:', data);
        console.log('[PAYMENT CARD] RawResult:', rawResult);
        return buildPaymentCard(data, rawResult);
    }

    return null;
}

// --- Helpers ---
function extractItems(data, rawResult) {
    if (!data && !rawResult) return [];
    if (data) {
        // Try common JSON shapes
        if (Array.isArray(data)) return data;
        if (data.restaurants) return Array.isArray(data.restaurants) ? data.restaurants : [data.restaurants];
        if (data.items) return Array.isArray(data.items) ? data.items : [data.items];
        if (data.addresses) return Array.isArray(data.addresses) ? data.addresses : [data.addresses];
        if (data.offers) return Array.isArray(data.offers) ? data.offers : [data.offers];
        if (data.data) return extractItems(data.data, null);
        if (data.results) return Array.isArray(data.results) ? data.results : [data.results];
    }
    return [];
}

function safeGet(obj, ...keys) {
    for (const key of keys) {
        const val = obj?.[key];
        if (val !== undefined && val !== null && val !== '') return val;
    }
    return null;
}

function ratingStars(rating) {
    const r = parseFloat(rating) || 0;
    const full = Math.floor(r);
    const half = r % 1 >= 0.3 ? 1 : 0;
    const empty = 5 - full - half;
    return '<span class="zc-stars">' +
        '<span class="star-filled">★</span>'.repeat(full) +
        (half ? '<span class="star-half">★</span>' : '') +
        '<span class="star-empty">☆</span>'.repeat(Math.max(0, empty)) +
        ` <span class="star-num">${r.toFixed(1)}</span></span>`;
}

// --- CARD 1: Address Picker ---
function buildAddressCard(data, rawResult) {
    const items = extractItems(data, rawResult);
    const wrapper = document.createElement('div');
    wrapper.className = 'zomato-card zc-address';
    let inner = `<div class="zc-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
        </svg>
        <span>Select Delivery Address</span>
    </div>`;

    if (items.length > 0) {
        inner += '<div class="zc-body zc-address-list">';
        items.forEach((addr, i) => {
            const label = safeGet(addr, 'tag', 'label', 'type', 'title') || (i === 0 ? 'Home' : 'Address ' + (i + 1));
            const address = safeGet(addr, 'address', 'full_address', 'formatted_address', 'value') || JSON.stringify(addr).substring(0, 150);
            const isDefault = i === 0;
            
            // Store first address as default
            if (isDefault && !selectedDeliveryAddress) {
                selectedDeliveryAddress = { label, address };
                setTimeout(() => updateDeliveryAddressDisplay(), 100);
            }
            
            inner += `<div class="zc-address-item ${isDefault ? 'active' : ''}" onclick="selectDeliveryAddress('${escapeAttr(label)}', '${escapeAttr(String(address))}', this)">
                <div class="zc-addr-radio">${isDefault ? '<div class="zc-radio-fill"></div>' : ''}</div>
                <div class="zc-addr-detail">
                    <strong>${escapeHtml(String(label))}</strong>
                    <p>${escapeHtml(String(address))}</p>
                </div>
            </div>`;
        });
        inner += '</div>';
    } else {
        inner += '<div class="zc-body"><p class="zc-muted">Loading delivery addresses...</p></div>';
    }

    wrapper.innerHTML = inner;
    return wrapper;
}

// --- CARD 2: Restaurant Cards (Zomato-style with large images) ---
function buildRestaurantCard(data, rawResult) {
    const items = extractItems(data, rawResult);
    const wrapper = document.createElement('div');
    wrapper.className = 'zomato-card zc-restaurants';
    
    // Determine if this is nearby or top rated based on data
    const hasDistance = items.some(r => safeGet(r, 'distance', 'dist'));
    const hasHighRating = items.some(r => parseFloat(safeGet(r, 'rating', 'user_rating', 'avgRating') || 0) >= 4.0);
    const sectionTitle = hasDistance ? '📍 Nearby Restaurants' : hasHighRating ? '⭐ Top Rated Restaurants' : '🍽️ Restaurants Found';
    
    let inner = `<div class="zc-section-title">${sectionTitle}</div>`;

    if (items.length > 0) {
        inner += '<div class="zc-rest-grid">';
        items.slice(0, 10).forEach((rest, idx) => {
            const name = safeGet(rest, 'name', 'restaurant_name', 'title') || 'Restaurant';
            const rating = safeGet(rest, 'rating', 'user_rating', 'avgRating') || '';
            const reviews = safeGet(rest, 'reviews', 'review_count', 'total_reviews') || '';
            const cuisine = safeGet(rest, 'cuisine', 'cuisines', 'cuisine_type') || '';
            const price = safeGet(rest, 'price_for_two', 'cost_for_two', 'price', 'average_cost') || '';
            const time = safeGet(rest, 'delivery_time', 'eta', 'estimated_delivery_time') || '';
            const distance = safeGet(rest, 'distance', 'dist') || '';
            const image = safeGet(rest, 'image', 'thumb', 'featured_image', 'photo') || '';
            const offer = safeGet(rest, 'offer', 'offers', 'promotion') || '';
            const isPromoted = idx === 0 && safeGet(rest, 'promoted', 'is_promoted');
            
            // Fallback to food placeholder images
            const imgPlaceholders = [
                'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&h=600&fit=crop',
                'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&h=600&fit=crop',
                'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&h=600&fit=crop',
                'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=800&h=600&fit=crop',
                'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&h=600&fit=crop'
            ];
            const finalImg = image || imgPlaceholders[idx % imgPlaceholders.length];

            inner += `<div class="zc-rest-card" onclick="sendSuggestion('Show me the full menu and details for ${escapeAttr(String(name))}')">
                <div class="zc-rest-hero">
                    <img src="${finalImg}" alt="${escapeHtml(String(name))}" class="zc-rest-hero-img" 
                         onerror="this.src='${imgPlaceholders[0]}'">
                    <div class="zc-rest-overlay">
                        ${offer ? `<div class="zc-offer-banner">
                            <span class="zc-offer-icon">🎉</span>
                            <span class="zc-offer-text">${escapeHtml(String(offer).substring(0, 40))}</span>
                        </div>` : ''}
                        ${time ? `<div class="zc-delivery-time">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                            </svg>
                            ${time} min
                        </div>` : ''}
                    </div>
                    ${isPromoted ? '<div class="zc-promoted-badge">PROMOTED</div>' : ''}
                </div>
                <div class="zc-rest-details">
                    <div class="zc-rest-top">
                        <h3 class="zc-rest-title">${escapeHtml(String(name))}</h3>
                        ${rating ? `<div class="zc-rating-box ${parseFloat(rating) >= 4.0 ? 'excellent' : parseFloat(rating) >= 3.5 ? 'good' : 'average'}">
                            <span class="zc-rating-star">★</span>
                            <span class="zc-rating-value">${parseFloat(rating).toFixed(1)}</span>
                        </div>` : ''}
                    </div>
                    ${cuisine ? `<div class="zc-rest-meta">${escapeHtml(String(cuisine))}</div>` : ''}
                    ${reviews ? `<div class="zc-rest-reviews">${reviews} reviews</div>` : ''}
                    <div class="zc-rest-footer">
                        <div class="zc-rest-price-info">
                            ${price ? `<span class="zc-price-tag">₹${price} for two</span>` : ''}
                            ${distance ? `<span class="zc-distance-tag">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                                </svg>
                                ${distance}
                            </span>` : ''}
                        </div>
                    </div>
                </div>
            </div>`;
        });
        inner += '</div>';
    } else {
        inner += '<div class="zc-body"><p class="zc-muted">🔍 Searching for restaurants near you...</p></div>';
    }

    wrapper.innerHTML = inner;
    return wrapper;
}

// --- CARD 3: Menu Browser (with dish images) ---
function buildMenuCard(data, rawResult) {
    const items = extractItems(data, rawResult);
    const wrapper = document.createElement('div');
    wrapper.className = 'zomato-card zc-menu';
    let inner = `<div class="zc-section-title">🍽️ Menu</div>`;

    if (items.length > 0) {
        inner += '<div class="zc-menu-grid">';
        const dishImages = [
            'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=300&fit=crop',
            'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&h=300&fit=crop',
            'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&h=300&fit=crop',
            'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400&h=300&fit=crop',
            'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop',
            'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=400&h=300&fit=crop',
            'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=400&h=300&fit=crop',
            'https://images.unsplash.com/photo-1606502281004-f86cf1282af8?w=400&h=300&fit=crop'
        ];
        
        items.slice(0, 12).forEach((item, idx) => {
            const name = safeGet(item, 'name', 'item_name', 'dish_name', 'title') || 'Item';
            const price = safeGet(item, 'price', 'cost', 'item_price', 'mrp') || '';
            const desc = safeGet(item, 'description', 'desc', 'subtitle') || '';
            const rating = safeGet(item, 'rating', 'item_rating') || '';
            const reviews = safeGet(item, 'reviews', 'review_count') || '';
            const isVeg = safeGet(item, 'is_veg', 'veg', 'vegetarian');
            const image = safeGet(item, 'image', 'thumb', 'photo') || dishImages[idx % dishImages.length];
            const bestseller = safeGet(item, 'bestseller', 'is_bestseller');

            inner += `<div class="zc-dish-card">
                <div class="zc-dish-image-wrapper">
                    <img src="${image}" alt="${escapeHtml(String(name))}" class="zc-dish-image" 
                         onerror="this.src='${dishImages[0]}'">
                    ${bestseller ? '<div class="zc-bestseller-badge">⭐ BESTSELLER</div>' : ''}
                    <button class="zc-dish-add-btn" onclick="event.stopPropagation(); sendSuggestion('Add ${escapeAttr(String(name))} to my cart')">
                        <span class="add-icon">+</span>
                    </button>
                </div>
                <div class="zc-dish-info">
                    <div class="zc-dish-header">
                        ${isVeg !== null ? `<span class="zc-veg-indicator ${isVeg ? 'veg' : 'non-veg'}"></span>` : ''}
                        <h4 class="zc-dish-name">${escapeHtml(String(name))}</h4>
                    </div>
                    ${price ? `<div class="zc-dish-price">₹${price}</div>` : ''}
                    ${rating ? `<div class="zc-dish-rating">
                        <span class="rating-stars">${ratingStars(rating)}</span>
                        ${reviews ? `<span class="review-count">(${reviews})</span>` : ''}
                    </div>` : ''}
                    ${desc ? `<p class="zc-dish-desc">${escapeHtml(String(desc).substring(0, 80))}${String(desc).length > 80 ? '...' : ''}</p>` : ''}
                </div>
            </div>`;
        });
        inner += '</div>';
    } else {
        inner += '<div class="zc-body"><p class="zc-muted">📖 Loading menu...</p></div>';
    }

    wrapper.innerHTML = inner;
    return wrapper;
}

// --- CARD 4: Cart Panel ---
function buildCartCard(data, rawResult) {
    const wrapper = document.createElement('div');
    wrapper.className = 'zomato-card zc-cart';
    let inner = `<div class="zc-header zc-header-cart"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg> Your Cart</div>`;

    const items = extractItems(data, rawResult);
    inner += '<div class="zc-body">';

    if (items.length > 0) {
        inner += '<div class="zc-cart-items">';
        items.forEach(item => {
            const name = safeGet(item, 'name', 'item_name', 'dish_name') || 'Item';
            const qty = safeGet(item, 'quantity', 'qty', 'count') || 1;
            const price = safeGet(item, 'price', 'cost', 'total') || '';
            inner += `<div class="zc-cart-row">
                <span class="zc-cart-name">${escapeHtml(String(name))} × ${qty}</span>
                <span class="zc-cart-price">${price ? '₹' + price : ''}</span>
            </div>`;
        });
        inner += '</div>';
    }

    // Show totals from data if available
    const subtotal = data ? safeGet(data, 'subtotal', 'sub_total', 'item_total') : null;
    const tax = data ? safeGet(data, 'tax', 'gst', 'taxes') : null;
    const delivery = data ? safeGet(data, 'delivery_fee', 'delivery_charge', 'delivery_cost') : null;
    const total = data ? safeGet(data, 'total', 'grand_total', 'payable', 'total_amount') : null;

    if (subtotal || total) {
        inner += '<div class="zc-cart-totals">';
        if (subtotal) inner += `<div class="zc-cart-row"><span>Subtotal</span><span>₹${subtotal}</span></div>`;
        if (tax) inner += `<div class="zc-cart-row"><span>GST & Taxes</span><span>₹${tax}</span></div>`;
        if (delivery) inner += `<div class="zc-cart-row"><span>Delivery Fee</span><span>₹${delivery}</span></div>`;
        if (total) inner += `<div class="zc-cart-row zc-total-row"><span><strong>Total</strong></span><span><strong>₹${total}</strong></span></div>`;
        inner += '</div>';
    }

    inner += `<div class="zc-cart-actions">
        <button class="zc-btn" onclick="sendSuggestion('Show all available offers for my order')">Check Offers</button>
        <button class="zc-btn zc-btn-primary" onclick="confirmCheckout()">Checkout →</button>
    </div>`;
    inner += '</div>';

    wrapper.innerHTML = inner;
    return wrapper;
}

// --- CARD 5: Offers Panel ---
function buildOffersCard(data, rawResult) {
    const items = extractItems(data, rawResult);
    const wrapper = document.createElement('div');
    wrapper.className = 'zomato-card zc-offers';
    let inner = `<div class="zc-header zc-header-offer"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg> Available Offers</div>`;

    if (items.length > 0) {
        inner += '<div class="zc-body zc-offer-list">';
        items.forEach(offer => {
            const title = safeGet(offer, 'title', 'name', 'code', 'coupon_code') || 'Offer';
            const desc = safeGet(offer, 'description', 'desc', 'subtitle', 'discount') || '';
            const discount = safeGet(offer, 'discount_value', 'value', 'amount', 'flat_discount') || '';
            const minOrder = safeGet(offer, 'min_order', 'minimum_order', 'min_cart_value') || '';

            inner += `<div class="zc-offer-item" onclick="sendSuggestion('Apply offer: ${escapeAttr(String(title))}')">
                <div class="zc-offer-badge">${discount ? discount + (String(discount).includes('%') ? '' : '% OFF') : 'OFFER'}</div>
                <div class="zc-offer-detail">
                    <div class="zc-offer-title">${escapeHtml(String(title))}</div>
                    ${desc ? `<p class="zc-offer-desc">${escapeHtml(String(desc).substring(0, 80))}</p>` : ''}
                    ${minOrder ? `<span class="zc-offer-min">Min order: ₹${minOrder}</span>` : ''}
                </div>
                <button class="zc-btn-sm" onclick="event.stopPropagation(); sendSuggestion('Apply offer: ${escapeAttr(String(title))}')">Apply</button>
            </div>`;
        });
        inner += '</div>';
    } else {
        inner += '<div class="zc-body"><p class="zc-muted">Checking available offers...</p></div>';
    }

    wrapper.innerHTML = inner;
    return wrapper;
}

// --- CARD 5B: Reviews & Ratings ---
function buildReviewsCard(data, rawResult) {
    const items = extractItems(data, rawResult);
    const wrapper = document.createElement('div');
    wrapper.className = 'zomato-card zc-reviews';
    let inner = `<div class="zc-section-title">⭐ Reviews & Ratings</div>`;

    if (items.length > 0) {
        inner += '<div class="zc-reviews-container">';
        items.slice(0, 6).forEach((review, idx) => {
            const username = safeGet(review, 'user', 'username', 'name', 'user_name') || 'Anonymous User';
            const rating = safeGet(review, 'rating', 'user_rating', 'stars') || '';
            const comment = safeGet(review, 'comment', 'review', 'text', 'feedback') || '';
            const date = safeGet(review, 'date', 'created_at', 'time') || '';
            const helpful = safeGet(review, 'helpful', 'likes', 'thumbs_up') || '';
            
            // Random user avatars for demo
            const avatarColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F'];
            const avatarColor = avatarColors[idx % avatarColors.length];
            const avatar = username.charAt(0).toUpperCase();

            inner += `<div class="zc-review-card">
                <div class="zc-review-header">
                    <div class="zc-reviewer-avatar" style="background: ${avatarColor};">${avatar}</div>
                    <div class="zc-reviewer-info">
                        <div class="zc-reviewer-name">${escapeHtml(String(username))}</div>
                        ${rating ? `<div class="zc-review-rating">
                            ${ratingStars(rating)}
                        </div>` : ''}
                    </div>
                    ${date ? `<div class="zc-review-date">${escapeHtml(String(date).substring(0, 20))}</div>` : ''}
                </div>
                ${comment ? `<div class="zc-review-text">${escapeHtml(String(comment).substring(0, 200))}${String(comment).length > 200 ? '...' : ''}</div>` : ''}
                ${helpful ? `<div class="zc-review-footer">
                    <span class="zc-helpful">👍 ${helpful} people found this helpful</span>
                </div>` : ''}
            </div>`;
        });
        inner += '</div>';
        
        // Add overall rating summary if available
        if (data && (data.average_rating || data.total_reviews)) {
            const avgRating = safeGet(data, 'average_rating', 'avg_rating', 'overall_rating') || '';
            const totalReviews = safeGet(data, 'total_reviews', 'review_count') || '';
            inner += `<div class="zc-rating-summary">
                ${avgRating ? `<div class="zc-summary-rating">
                    <div class="zc-big-rating">${parseFloat(avgRating).toFixed(1)}</div>
                    <div class="zc-big-stars">${ratingStars(avgRating)}</div>
                </div>` : ''}
                ${totalReviews ? `<div class="zc-summary-text">${totalReviews} reviews</div>` : ''}
            </div>`;
        }
    } else {
        inner += '<div class="zc-body"><p class="zc-muted">💬 No reviews available yet</p></div>';
    }

    wrapper.innerHTML = inner;
    return wrapper;
}

// --- CARD 6: Payment Screen ---
function buildPaymentCard(data, rawResult) {
    const wrapper = document.createElement('div');
    wrapper.className = 'zomato-card zc-payment';
    let inner = `<div class="zc-header zc-header-payment"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> Payment</div>`;

    const total = data ? safeGet(data, 'total', 'grand_total', 'payable', 'amount', 'total_amount') : null;
    const orderId = data ? safeGet(data, 'order_id', 'id', 'orderId', 'order') : null;
    const status = data ? safeGet(data, 'status', 'order_status', 'payment_status') : null;
    
    // Enhanced QR code extraction - check multiple fields and formats
    let qr = data ? safeGet(data, 'qr_code', 'qr', 'qr_url', 'upi_link', 'payment_qr', 'qr_code_url', 'qrCode', 'qr_image') : null;
    
    // If no QR in data, try to extract from rawResult string
    if (!qr && rawResult) {
        const resultStr = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult);
        // Look for URLs that might be QR codes (common patterns)
        const urlMatch = resultStr.match(/(https?:\/\/[^\s\)"'<>]+\.(?:png|jpg|jpeg|gif|svg))/i) ||
                        resultStr.match(/(https?:\/\/[^\s\)"'<>]*(?:qr|payment|upi)[^\s\)"'<>]*)/i);
        if (urlMatch) {
            qr = urlMatch[1];
            console.log('[QR] Extracted QR from rawResult:', qr);
        }
    }

    inner += '<div class="zc-body zc-pay-body">';
    
    // Show delivery address prominently
    if (selectedDeliveryAddress) {
        inner += `<div class="zc-delivery-info">
            <div class="zc-info-header">📍 Delivering To</div>
            <div class="zc-info-content">
                <strong>${escapeHtml(selectedDeliveryAddress.label)}</strong>
                <p>${escapeHtml(selectedDeliveryAddress.address)}</p>
            </div>
        </div>`;
    }
    
    if (orderId) inner += `<div class="zc-pay-row"><span class="zc-pay-label">Order ID</span><span class="zc-pay-value">#${orderId}</span></div>`;
    if (total) inner += `<div class="zc-pay-row zc-pay-total"><span class="zc-pay-label">Total Amount</span><span class="zc-pay-value">₹${total}</span></div>`;
    if (status) inner += `<div class="zc-pay-row"><span class="zc-pay-label">Status</span><span class="zc-pay-status">${escapeHtml(String(status))}</span></div>`;
    
    if (qr && qr !== 'null' && qr !== 'undefined') {
        console.log('[QR] Rendering QR code:', qr);
        inner += `<div class="zc-qr-section">
            <div class="zc-qr-title">🔔 Scan This QR Code to Pay</div>
            <div class="zc-qr-large">
                <img src="${escapeHtml(String(qr))}" alt="Payment QR Code" 
                     loading="eager"
                     onclick="window.open('${escapeHtml(String(qr))}', '_blank')" 
                     style="cursor: pointer;"
                     onerror="this.parentElement.innerHTML='<div class=\\'zc-error\\'>❌ QR code failed to load. Please refresh or contact support.</div>'" />
            </div>
            <p class="zc-qr-help">💡 <strong>Click the QR code</strong> to open in a new tab if you need it bigger</p>
            <p class="zc-qr-help">📱 <strong>Open any UPI app</strong> (GPay, PhonePe, Paytm, etc.) and scan to pay</p>
            <p class="zc-qr-help">⚡ <strong>Payment is instant</strong> - Your order will be confirmed as soon as you pay</p>
        </div>`;
    } else {
        console.warn('[QR] No QR code found in payment data');
        inner += `<div class="zc-qr-section">
            <div class="zc-qr-title">⏳ Generating Your Payment QR Code...</div>
            <p class="zc-qr-help">This is taking longer than expected. If the QR doesn't appear, try:</p>
            <ul style="text-align: left; padding-left: 20px; color: var(--text-secondary); max-width: 400px; margin: 20px auto;">
                <li>Refreshing this page</li>
                <li>Asking "show payment QR code"</li>
                <li>Starting a new order</li>
                <li>Contacting support if the issue persists</li>
            </ul>
        </div>`;
    }

    inner += `<div class="zc-cart-actions">
        <button class="zc-btn zc-btn-primary" onclick="sendSuggestion('Track my order status')">Track Order →</button>
    </div>`;
    inner += '</div>';

    wrapper.innerHTML = inner;
    return wrapper;
}

// --- Address & Checkout Helpers ---
function selectDeliveryAddress(label, address, element) {
    selectedDeliveryAddress = { label, address };
    
    // Update UI - remove active from all, add to clicked
    document.querySelectorAll('.zc-address-item').forEach(item => {
        item.classList.remove('active');
        const radio = item.querySelector('.zc-addr-radio');
        if (radio) radio.innerHTML = '';
    });
    
    element.classList.add('active');
    const radio = element.querySelector('.zc-addr-radio');
    if (radio) radio.innerHTML = '<div class="zc-radio-fill"></div>';
    
    updateDeliveryAddressDisplay();
    sendSuggestion('Use address: ' + address.substring(0, 60));
}

function updateDeliveryAddressDisplay() {
    let banner = document.getElementById('delivery-address-banner');
    
    if (!selectedDeliveryAddress) {
        if (banner) banner.remove();
        return;
    }
    
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'delivery-address-banner';
        banner.className = 'delivery-address-banner';
        document.body.appendChild(banner);
    }
    
    banner.innerHTML = `
        <div class="address-banner-content">
            <div class="address-icon">📍</div>
            <div class="address-text">
                <div class="address-label">${escapeHtml(selectedDeliveryAddress.label)}</div>
                <div class="address-value">${escapeHtml(selectedDeliveryAddress.address)}</div>
            </div>
            <button class="address-change-btn" onclick="sendSuggestion('Change delivery address')">Change</button>
        </div>
    `;
}

function confirmCheckout() {
    if (!selectedDeliveryAddress) {
        alert('Please select a delivery address first');
        sendSuggestion('Show my delivery addresses');
        return;
    }
    
    // Show confirmation modal
    const modal = document.createElement('div');
    modal.className = 'checkout-modal';
    modal.innerHTML = `
        <div class="checkout-modal-content">
            <div class="checkout-modal-header">
                <h3>Confirm Your Order</h3>
                <button class="modal-close" onclick="this.closest('.checkout-modal').remove()">×</button>
            </div>
            <div class="checkout-modal-body">
                <div class="checkout-section">
                    <div class="checkout-section-title">📍 Delivery Address</div>
                    <div class="checkout-section-content">
                        <strong>${escapeHtml(selectedDeliveryAddress.label)}</strong>
                        <p>${escapeHtml(selectedDeliveryAddress.address)}</p>
                    </div>
                </div>
                <div class="checkout-section">
                    <div class="checkout-section-title">💳 Payment Method</div>
                    <div class="checkout-section-content">
                        <strong>UPI/QR Code Payment</strong>
                        <p>You'll receive a QR code to scan and pay</p>
                    </div>
                </div>
            </div>
            <div class="checkout-modal-footer">
                <button class="zc-btn" onclick="this.closest('.checkout-modal').remove()">Cancel</button>
                <button class="zc-btn zc-btn-primary" onclick="proceedToPayment()">Place Order & Pay →</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function proceedToPayment() {
    document.querySelector('.checkout-modal')?.remove();
    sendSuggestion('Proceed to payment');
}

function showTypingIndicator() {
    const id = 'typing-' + Date.now();
    const div = document.createElement('div');
    div.className = 'typing-indicator';
    div.id = id;
    div.innerHTML = `
        <div class="avatar" style="background: linear-gradient(135deg, var(--zomato-red), var(--zomato-red-light)); color: white;">Z</div>
        <div class="typing-dots"><span></span><span></span><span></span></div>
    `;
    messagesArea.appendChild(div);
    scrollToBottom();
    return id;
}

function removeTypingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function scrollToBottom() {
    requestAnimationFrame(() => {
        messagesArea.scrollTop = messagesArea.scrollHeight;
    });
}

// =============================================================
// UTILITIES
// =============================================================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeAttr(text) {
    return text.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// =============================================================
// INIT
// =============================================================
init();
