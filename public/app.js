// --- State ------------------------------------------------------------------
let sessionId = null;
let isConnected = false;
let isSending = false;
let connectPollTimer = null;

// --- DOM Elements -----------------------------------------------------------
const messagesArea = document.getElementById('messagesArea');
const messageInput = document.getElementById('messageInput');
const btnSend = document.getElementById('btnSend');
const btnConnect = document.getElementById('btnConnect');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const toolsPanel = document.getElementById('toolsPanel');
const toolsList = document.getElementById('toolsList');
const toolCount = document.getElementById('toolCount');
const welcomeCard = document.getElementById('welcomeCard');
const suggestions = document.getElementById('suggestions');

// --- Initialize -------------------------------------------------------------
async function init() {
    try {
        const res = await fetch('/api/session', { method: 'POST' });
        const data = await res.json();
        sessionId = data.sessionId;
    } catch (e) {
        sessionId = crypto.randomUUID?.() || 'session-' + Date.now();
    }
    checkStatus();
}

async function checkStatus() {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        if (data.connected) {
            updateConnectionUI(true, data.tools);
        } else if (data.connecting) {
            setConnecting();
            if (data.authUrl) {
                addAuthUrlMessage(data.authUrl);
            }
        }
    } catch (e) {
        console.log('Status check failed:', e);
    }
}

// --- Connection -------------------------------------------------------------
async function connectToZomato() {
    if (isConnected) return;

    setConnecting();

    // Poll status while connecting to show auth URL in real-time
    connectPollTimer = setInterval(async () => {
        try {
            const s = await fetch('/api/status').then(r => r.json());
            if (s.connected) {
                clearInterval(connectPollTimer);
                updateConnectionUI(true, s.tools);
                addSystemMessage('Connected to Zomato MCP. Discovered <span class="highlight">' + (s.tools?.length || 0) + ' tools</span>. Start chatting to explore restaurants and order food.');
            } else if (s.authUrl) {
                // Show auth URL if captured
                const existing = document.getElementById('auth-url-msg');
                if (!existing) {
                    addAuthUrlMessage(s.authUrl);
                }
            }
        } catch (e) { /* ignore */ }
    }, 2000);

    try {
        const res = await fetch('/api/connect', { method: 'POST' });
        const data = await res.json();
        clearInterval(connectPollTimer);

        if (data.success) {
            updateConnectionUI(true, data.tools);
            addSystemMessage('Connected to Zomato MCP. Discovered <span class="highlight">' + (data.tools?.length || 0) + ' tools</span>. Start chatting to explore restaurants and order food.');
        } else {
            updateConnectionUI(false);
            let errorMsg = 'Connection failed: ' + (data.error || 'Unknown error');
            addErrorMessage(errorMsg);
            if (data.help) {
                addSystemMessage(data.help);
            }
        }
    } catch (err) {
        clearInterval(connectPollTimer);
        updateConnectionUI(false);
        addErrorMessage('Could not connect to the server. Make sure the backend is running on http://localhost:3000.');
    }
}

async function resetConnection() {
    try {
        clearInterval(connectPollTimer);
        await fetch('/api/disconnect', { method: 'POST' });
        updateConnectionUI(false);
        addSystemMessage('Connection reset. Stale auth tokens cleared. Click <strong>Connect to Zomato</strong> to try again.');
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

// --- Chat -------------------------------------------------------------------
function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

function sendSuggestion(text) {
    messageInput.value = text;
    sendMessage();
}

async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message || isSending) return;

    if (welcomeCard) {
        welcomeCard.style.display = 'none';
    }

    addMessage('user', message);
    messageInput.value = '';
    isSending = true;
    btnSend.disabled = true;

    const typingId = showTypingIndicator();

    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, sessionId })
        });

        const data = await res.json();
        removeTypingIndicator(typingId);

        if (data.error) {
            addErrorMessage(data.error);
        } else {
            if (data.toolCalls && data.toolCalls.length > 0) {
                data.toolCalls.forEach(tc => {
                    addToolCallIndicator(tc);
                });
            }
            addMessage('assistant', data.response);
            if (data.sessionId) {
                sessionId = data.sessionId;
            }
        }
    } catch (err) {
        removeTypingIndicator(typingId);
        addErrorMessage('Failed to send message. Check if the server is running.');
    }

    isSending = false;
    btnSend.disabled = false;
    messageInput.focus();
}

// --- Message Rendering ------------------------------------------------------
function addMessage(role, content) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    const avatar = role === 'user' ? 'U' : 'Z';
    div.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">${formatMessage(content)}</div>
    `;
    messagesArea.appendChild(div);
    scrollToBottom();
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
    // Only add once
    if (document.getElementById('auth-url-msg')) return;

    const div = document.createElement('div');
    div.className = 'auth-url-message';
    div.id = 'auth-url-msg';
    div.innerHTML = `
        <div class="auth-url-header">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <span>Zomato OAuth Login Required</span>
        </div>
        <p>A browser window should have opened for Zomato login. If it did not open, click the link below:</p>
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="auth-url-link">Open Zomato Login Page</a>
        <p class="auth-url-help">Enter your phone number and complete the OTP verification in the Zomato page. After successful login, the connection will be established automatically.</p>
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
        <div>
            <span class="tool-name">${escapeHtml(tc.name)}</span>
        </div>
        <div class="tool-status ${tc.status}">
            ${statusIcon}
            <span>${tc.status === 'success' ? 'Done' : tc.status === 'error' ? 'Failed' : 'Calling...'}</span>
        </div>
    `;

    messagesArea.appendChild(div);
    scrollToBottom();
}

function showTypingIndicator() {
    const id = 'typing-' + Date.now();
    const div = document.createElement('div');
    div.className = 'typing-indicator';
    div.id = id;
    div.innerHTML = `
        <div class="message-avatar" style="background: linear-gradient(135deg, var(--zomato-red), var(--zomato-red-light));">Z</div>
        <div class="typing-dots">
            <span></span><span></span><span></span>
        </div>
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

// --- Formatting -------------------------------------------------------------
function formatMessage(text) {
    if (!text) return '';
    let html = escapeHtml(text);
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
    html = html.replace(/`(.*?)`/g, '<code>$1</code>');
    html = html.replace(/\n/g, '<br>');
    html = html.replace(/(^|\<br\>)[\-\•]\s(.*?)(?=\<br\>|$)/g, '$1<li>$2</li>');
    return html;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// --- Init -------------------------------------------------------------------
init();
