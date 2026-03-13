// =============================================================
// Zomato MCP App — Native MCP Apps Architecture
// Implements direct browser-to-MCP-server with streaming
// =============================================================

// --- MCP Client Instance ---
const mcpClient = new MCPClient();

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
let currentOrderStage = 'search';
let userLocation = null;
let selectedDeliveryAddress = null;
let selectedPaymentMethod = 'UPI';
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 3;

// --- DOM Elements ---
const landingPage = document.getElementById('landingPage');
const app = document.getElementById('app');
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
// MCP CLIENT EVENT HANDLERS
// =============================================================

mcpClient.on('connect', (data) => {
    console.log('[MCP App] Connected to MCP server', data);
    isConnected = true;
    connectionAttempts = 0;
    updateConnectionUI();
    showToolsList();
    showNotification('Connected to Zomato MCP! 🎉', 'success');
});

mcpClient.on('disconnect', () => {
    console.log('[MCP App] Disconnected from MCP server');
    isConnected = false;
    updateConnectionUI();
    showNotification('Disconnected from Zomato MCP', 'info');
});

mcpClient.on('error', (error) => {
    console.error('[MCP App] Error:', error);
    showNotification(`Connection error: ${error.message}`, 'error');
    isConnected = false;
    updateConnectionUI();
});

mcpClient.on('tool-update', (tools) => {
    console.log('[MCP App] Tools updated:', tools.length);
    showToolsList();
});

mcpClient.on('connecting', () => {
    console.log('[MCP App] Connecting...');
    updateConnectionUI();
});

// =============================================================
// LANDING PAGE FUNCTIONS
// =============================================================

async function initializeApp() {
    console.log('[INIT] Initializing Zomato MCP App');
    
    // Hide landing page, show app
    if (landingPage) landingPage.style.display = 'none';
    if (app) app.style.display = 'flex';
    
    // Initialize session
    await initializeMainApp();
    
    // Auto-detect location if not already detected
    if (!userLocation) {
        detectUserLocation();
    }
    
    // Auto-connect to MCP
    setTimeout(() => {
        connectToMCPServer();
    }, 500);
}

async function quickSearch(category) {
    console.log('[QUICK SEARCH] Category:', category);
    
    await initializeApp();
    
    setTimeout(() => {
        const searchMessage = `Find best ${category} restaurants near me`;
        if (messageInput) {
            messageInput.value = searchMessage;
            const form = messageInput.closest('form');
            if (form) {
                form.dispatchEvent(new Event('submit'));
            }
        }
    }, 1000);
}

function detectUserLocation() {
    console.log('[GPS] Requesting user location...');
    
    if (!navigator.geolocation) {
        console.error('[GPS] Geolocation not supported');
        showNotification('Geolocation is not supported by your browser', 'error');
        return;
    }
    
    const detectBtn = document.querySelector('.detect-location-btn');
    if (detectBtn) {
        detectBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
            </svg>
            Detecting...
        `;
        detectBtn.disabled = true;
    }
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            userLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                label: `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`
            };
            console.log('[GPS] Location detected:', userLocation);
            
            if (detectBtn) {
                detectBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Location Detected
                `;
                detectBtn.style.borderColor = '#2ecc71';
                detectBtn.style.color = '#2ecc71';
            }
            
            updateLocationChip();
            showNotification('Location detected successfully! 📍', 'success');
        },
        (error) => {
            console.error('[GPS] Error:', error.message);
            
            if (detectBtn) {
                detectBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                        <circle cx="12" cy="10" r="3"/>
                    </svg>
                    Detect Location
                `;
                detectBtn.disabled = false;
            }
            
            let errorMsg = 'Could not detect location. ';
            if (error.code === 1) {
                errorMsg += 'Please allow location access in your browser.';
            } else if (error.code === 2) {
                errorMsg += 'Location information unavailable.';
            } else {
                errorMsg += 'Location request timed out.';
            }
            
            showNotification(errorMsg, 'error');
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

// =============================================================
// MCP CONNECTION FUNCTIONS
// =============================================================

async function connectToMCPServer() {
    if (isConnected) {
        console.log('[MCP App] Already connected');
        return;
    }
    
    if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
        showNotification('Maximum connection attempts reached. Please refresh the page.', 'error');
        return;
    }
    
    connectionAttempts++;
    
    try {
        console.log('[MCP App] Connecting to Zomato MCP server...');
        updateConnectionUI();
        
        await mcpClient.connect();
        
        // Poll for connection status
        startConnectionPolling();
        
    } catch (error) {
        console.error('[MCP App] Connection failed:', error);
        showNotification(`Connection failed: ${error.message}`, 'error');
        isConnected = false;
        updateConnectionUI();
    }
}

async function disconnectFromMCPServer() {
    try {
        await mcpClient.disconnect();
        isConnected = false;
        connectionAttempts = 0;
        updateConnectionUI();
        clearToolsList();
        showNotification('Disconnected from Zomato MCP', 'info');
    } catch (error) {
        console.error('[MCP App] Disconnect error:', error);
    }
}

function startConnectionPolling() {
    if (connectPollTimer) clearInterval(connectPollTimer);
    
    connectPollTimer = setInterval(async () => {
        try {
            const response = await fetch('/api/status');
            const status = await response.json();
            
            if (status.connected && !isConnected) {
                isConnected = true;
                clearInterval(connectPollTimer);
                connectPollTimer = null;
                
                // Refresh tools list
                await mcpClient.discover();
                updateConnectionUI();
                showToolsList();
                showNotification('Connected to Zomato MCP! 🎉', 'success');
            } else if (!status.connected && status.error && !status.connecting) {
                clearInterval(connectPollTimer);
                connectPollTimer = null;
                showNotification(`Connection error: ${status.error}`, 'error');
            }
        } catch (error) {
            console.error('[MCP App] Polling error:', error);
        }
    }, 2000);
    
    // Stop polling after 2 minutes
    setTimeout(() => {
        if (connectPollTimer) {
            clearInterval(connectPollTimer);
            connectPollTimer = null;
            if (!isConnected) {
                showNotification('Connection timeout. Please try again.', 'error');
            }
        }
    }, 120000);
}

function updateConnectionUI() {
    const status = mcpClient.getStatus();
    
    if (statusDot && statusText) {
        if (status.connected) {
            statusDot.className = 'status-dot connected';
            statusText.textContent = 'Connected to Zomato';
            if (btnConnect) {
                btnConnect.textContent = 'Disconnect';
                btnConnect.onclick = disconnectFromMCPServer;
                btnConnect.classList.remove('connecting');
            }
        } else if (status.connecting) {
            statusDot.className = 'status-dot connecting';
            statusText.textContent = 'Connecting...';
            if (btnConnect) {
                btnConnect.textContent = 'Connecting...';
                btnConnect.classList.add('connecting');
                btnConnect.disabled = true;
            }
        } else {
            statusDot.className = 'status-dot';
            statusText.textContent = 'Disconnected';
            if (btnConnect) {
                btnConnect.textContent = 'Connect to Zomato';
                btnConnect.onclick = connectToMCPServer;
                btnConnect.classList.remove('connecting');
                btnConnect.disabled = false;
            }
        }
    }
    
    // Update message input placeholder based on connection status
    if (messageInput) {
        // Always enable input so user can type
        messageInput.disabled = false;
        if (!status.connected) {
            messageInput.placeholder = 'Type your message... (will connect when you send)';
        } else {
            messageInput.placeholder = 'Ask me anything about food, restaurants, or orders...';
        }
    }
}

function showToolsList() {
    const tools = mcpClient.getTools();
    
    if (!toolsList || !toolCount) return;
    
    toolCount.textContent = tools.length;
    toolsList.innerHTML = '';
    
    if (tools.length === 0) {
        toolsList.innerHTML = '<div class="no-tools">No tools available</div>';
        return;
    }
    
    tools.forEach(tool => {
        const toolItem = document.createElement('div');
        toolItem.className = 'tool-item';
        toolItem.innerHTML = `
            <div class="tool-icon">🔧</div>
            <div class="tool-info">
                <div class="tool-name">${tool.name}</div>
                <div class="tool-description">${tool.description || 'No description'}</div>
            </div>
        `;
        toolsList.appendChild(toolItem);
    });
}

function clearToolsList() {
    if (toolCount) toolCount.textContent = '0';
    if (toolsList) toolsList.innerHTML = '<div class="no-tools">Not connected</div>';
}

// =============================================================
// CHAT FUNCTIONS (with MCP integration)
// =============================================================

// Global form submit handler
function handleSubmit(event) {
    event.preventDefault();
    const message = messageInput?.value?.trim();
    if (message) {
        sendMessage(message);
    }
}

async function sendMessage(message) {
    if (!message || !message.trim()) return;
    if (isSending) return;
    
    // Auto-connect if not connected
    if (!isConnected) {
        showNotification('Connecting to Zomato MCP...', 'info');
        await connectToMCPServer();
        
        // Wait a bit for connection to establish
        let attempts = 0;
        while (!isConnected && attempts < 30) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
        }
        
        if (!isConnected) {
            showNotification('Failed to connect. Please try clicking "Connect to Zomato" button.', 'error');
            return;
        }
    }
    
    isSending = true;
    
    // Add user message to UI
    addMessageToUI('user', message);
    conversationHistory.push({ role: 'user', content: message });
    
    // Clear input
    if (messageInput) messageInput.value = '';
    
    // Show typing indicator
    const typingId = showTypingIndicator();
    
    try {
        // Send to backend for OpenAI processing with MCP tools
        const response = await fetch('/api/chat', {
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
        
        const data = await response.json();
        
        // Remove typing indicator
        removeTypingIndicator(typingId);
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        // Add assistant response to UI with tool data
        const structuredData = extractStructuredData(data.toolCalls);
        addMessageToUI('assistant', data.response, data.toolCalls, structuredData);
        conversationHistory.push({ role: 'assistant', content: data.response });
        
        // Update order stage if needed
        detectAndUpdateOrderStage(data.response);
        
    } catch (error) {
        console.error('[Chat] Error:', error);
        removeTypingIndicator(typingId);
        addMessageToUI('error', `Sorry, an error occurred: ${error.message}`);
        showNotification('Failed to send message', 'error');
    } finally {
        isSending = false;
    }
}

/**
 * Extract structured data from MCP tool calls
 */
function extractStructuredData(toolCalls) {
    if (!toolCalls || toolCalls.length === 0) return null;
    
    // Look for restaurant search results
    const restaurantTool = toolCalls.find(tc => 
        tc.name === 'get_restaurants_for_keyword' && tc.status === 'success' && tc.data
    );
    if (restaurantTool && restaurantTool.data) {
        return {
            type: 'restaurants',
            data: restaurantTool.data
        };
    }
    
    // Look for menu data
    const menuTool = toolCalls.find(tc => 
        tc.name === 'get_menu_items_listing' && tc.status === 'success' && tc.data
    );
    if (menuTool && menuTool.data) {
        return {
            type: 'menu',
            data: menuTool.data
        };
    }
    
    // Look for cart data
    const cartTool = toolCalls.find(tc => 
        (tc.name === 'get_cart' || tc.name === 'add_to_cart' || tc.name === 'create_cart') && 
        tc.status === 'success' && tc.data
    );
    if (cartTool && cartTool.data) {
        return {
            type: 'cart',
            data: cartTool.data
        };
    }
    
    // Look for order confirmation
    const checkoutTool = toolCalls.find(tc => 
        tc.name === 'checkout_cart' && tc.status === 'success' && tc.data
    );
    if (checkoutTool && checkoutTool.data) {
        return {
            type: 'order',
            data: checkoutTool.data
        };
    }
    
    return null;
}

function addMessageToUI(role, content, toolCalls = [], structuredData = null) {
    if (!messagesArea) return;
    
    // Hide empty state
    if (emptyState) emptyState.style.display = 'none';
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    if (role === 'user') {
        messageDiv.innerHTML = `
            <div class="message-bubble user-bubble">
                <div class="message-text">${escapeHtml(content)}</div>
            </div>
        `;
    } else if (role === 'assistant') {
        // Render Zomato UI if we have structured data
        let zomatoHTML = '';
        if (structuredData && window.ZomatoUI) {
            zomatoHTML = renderZomatoUI(structuredData);
        }
        
        // If no structured data, try to parse content for JSON
        if (!zomatoHTML) {
            let parsedData = null;
            let textContent = content;
            
            // Try to extract JSON from markdown code blocks
            const jsonBlockPattern = /```json\s*([\s\S]*?)\s*```/;
            const jsonMatch = content.match(jsonBlockPattern);
            
            if (jsonMatch) {
                try {
                    parsedData = JSON.parse(jsonMatch[1]);
                    // Remove JSON block from text content
                    textContent = content.replace(jsonBlockPattern, '').trim();
                } catch (e) {
                    console.log('[Parser] Failed to parse JSON from code block:', e);
                }
            }
            
            // If we found JSON in content, render it
            if (parsedData && window.ZomatoUI) {
                zomatoHTML = renderZomatoUI({ type: 'auto', data: parsedData });
            }
            
            // Use the cleaned text content
            content = textContent || content;
        }
        
        // Render text content with markdown
        const renderedContent = md.render(content);
        
        messageDiv.innerHTML = `
            <div class="message-bubble assistant-bubble">
                <div class="assistant-header">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <circle cx="12" cy="12" r="3"/>
                    </svg>
                    <span>Zomato AI</span>
                </div>
                ${renderedContent ? `<div class="message-text markdown-content">${renderedContent}</div>` : ''}
                ${zomatoHTML}
                ${toolCalls && toolCalls.length > 0 ? renderToolCalls(toolCalls) : ''}
            </div>
        `;
        
        // Parse and render action buttons
        parseActionButtons(messageDiv);
    } else if (role === 'error') {
        messageDiv.innerHTML = `
            <div class="message-bubble error-bubble">
                <div class="message-text">${escapeHtml(content)}</div>
            </div>
        `;
    }
    
    messagesArea.appendChild(messageDiv);
    scrollToBottom();
}

/**
 * Render Zomato UI components based on data type
 */
function renderZomatoUI(structuredData) {
    const zomato = window.ZomatoUI;
    if (!zomato) return '';
    
    const { type, data } = structuredData;
    
    // Handle explicitly typed data
    if (type === 'restaurants') {
        // Extract restaurant array from data
        const restaurants = data.restaurants || data.results || (Array.isArray(data) ? data : null);
        if (!restaurants) return '';
        
        const location = data.location || userLocation?.label || 'you';
        return zomato.renderRestaurants(restaurants, location);
    }
    
    if (type === 'menu') {
        // Menu data structure varies
        const restaurantName = data.restaurant?.name || data.restaurantName || zomato.selectedRestaurant?.name;
        return zomato.renderMenu(data, restaurantName);
    }
    
    if (type === 'cart') {
        return zomato.renderCart(data);
    }
    
    if (type === 'order') {
        return zomato.renderOrderConfirmation(data);
    }
    
    // Auto-detect data type if type is 'auto'
    if (type === 'auto') {
        // Restaurant search results
        if (data.restaurants || (Array.isArray(data) && data[0]?.cuisine)) {
            const restaurants = data.restaurants || data;
            const location = data.location || userLocation?.label || 'you';
            return zomato.renderRestaurants(restaurants, location);
        }
        
        // Menu data
        if (data.menu || data.categories || (data.restaurant && data.items)) {
            const restaurantName = data.restaurant?.name || data.restaurantName || zomato.selectedRestaurant?.name;
            return zomato.renderMenu(data, restaurantName);
        }
        
        // Cart data
        if (data.cart || (data.items && data.total)) {
            return zomato.renderCart(data);
        }
        
        // Order confirmation
        if (data.order || data.orderId) {
            return zomato.renderOrderConfirmation(data);
        }
    }
    
    return '';
}

function renderToolCalls(toolCalls) {
    if (!toolCalls || toolCalls.length === 0) return '';
    
    const callsHTML = toolCalls.map(call => `
        <div class="tool-call">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
            <span>Called: <strong>${call.name}</strong></span>
        </div>
    `).join('');
    
    return `<div class="tool-calls-container">${callsHTML}</div>`;
}

function parseActionButtons(messageDiv) {
    const content = messageDiv.querySelector('.message-text');
    if (!content) return;
    
    const html = content.innerHTML;
    const actionPattern = /\[\[ACTION:([^:]+):([^\]]+)\]\]/g;
    
    const actions = [];
    let match;
    while ((match = actionPattern.exec(html)) !== null) {
        actions.push({
            label: match[1].trim(),
            data: match[2].trim()
        });
    }
    
    if (actions.length > 0) {
        // Remove action markers from text
        content.innerHTML = html.replace(actionPattern, '');
        
        // Add action buttons
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'action-buttons';
        
        actions.forEach(action => {
            const button = document.createElement('button');
            button.className = 'action-btn';
            button.textContent = action.label;
            button.onclick = () => handleActionClick(action);
            actionsDiv.appendChild(button);
        });
        
        const bubble = messageDiv.querySelector('.assistant-bubble');
        if (bubble) bubble.appendChild(actionsDiv);
    }
}

function handleActionClick(action) {
    console.log('[Action] Clicked:', action);
    
    // Parse the action data and send a message
    let message = '';
    
    if (action.label.includes('View Menu')) {
        message = `Show me the menu for ${action.data}`;
    } else if (action.label.includes('Add to Cart')) {
        message = `Add ${action.data} to cart`;
    } else if (action.label.includes('Check')) {
        message = action.data;
    } else {
        message = action.label;
    }
    
    if (messageInput) {
        messageInput.value = message;
        document.querySelector('.chat-form')?.dispatchEvent(new Event('submit'));
    }
}

function showTypingIndicator() {
    if (!messagesArea) return null;
    
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message assistant typing';
    typingDiv.id = 'typing-indicator-' + Date.now();
    typingDiv.innerHTML = `
        <div class="message-bubble assistant-bubble">
            <div class="typing-animation">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;
    
    messagesArea.appendChild(typingDiv);
    scrollToBottom();
    
    return typingDiv.id;
}

function removeTypingIndicator(id) {
    if (!id) return;
    const indicator = document.getElementById(id);
    if (indicator) indicator.remove();
}

// =============================================================
// UI HELPER FUNCTIONS
// =============================================================

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: ${type === 'success' ? '#2ecc71' : type === 'error' ? '#E23744' : '#60a5fa'};
        color: white;
        border-radius: 8px;
        font-weight: 600;
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        z-index: 10000;
        animation: slideInRight 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function updateLocationChip() {
    if (!contextChips || !userLocation) return;
    
    const locationChip = contextChips.querySelector('.context-chip.location');
    if (locationChip) {
        locationChip.querySelector('.chip-text').textContent = userLocation.label;
        locationChip.style.display = 'flex';
    }
}

function detectAndUpdateOrderStage(response) {
    const lowerResponse = response.toLowerCase();
    
    if (lowerResponse.includes('restaurant') || lowerResponse.includes('search')) {
        currentOrderStage = 'search';
    } else if (lowerResponse.includes('menu') || lowerResponse.includes('dish')) {
        currentOrderStage = 'menu';
    } else if (lowerResponse.includes('cart') || lowerResponse.includes('added')) {
        currentOrderStage = 'cart';
    } else if (lowerResponse.includes('offer') || lowerResponse.includes('discount')) {
        currentOrderStage = 'offers';
    } else if (lowerResponse.includes('payment') || lowerResponse.includes('pay')) {
        currentOrderStage = 'payment';
    }
    
    updateStepTracker();
}

function updateStepTracker() {
    if (!stepTracker) return;
    
    const stages = ['search', 'menu', 'cart', 'offers', 'payment'];
    const currentIndex = stages.indexOf(currentOrderStage);
    
    const steps = stepTracker.querySelectorAll('.step');
    steps.forEach((step, index) => {
        if (index < currentIndex) {
            step.classList.add('completed');
            step.classList.remove('active');
        } else if (index === currentIndex) {
            step.classList.add('active');
            step.classList.remove('completed');
        } else {
            step.classList.remove('active', 'completed');
        }
    });
}

function scrollToBottom() {
    if (messagesArea) {
        messagesArea.scrollTop = messagesArea.scrollHeight;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =============================================================
// INITIALIZATION
// =============================================================

async function initializeMainApp() {
    console.log('[INIT] Main app initialization');
    
    // Create session
    const response = await fetch('/api/session', { method: 'POST' });
    const data = await response.json();
    sessionId = data.sessionId;
    
    // Create first chat
    activeChatId = 'chat-' + Date.now();
    
    // Set up form handler
    const chatForm = document.querySelector('.chat-form');
    if (chatForm) {
        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const message = messageInput?.value?.trim();
            if (message) {
                sendMessage(message);
            }
        });
    }
    
    // Set up connect button
    if (btnConnect) {
        btnConnect.onclick = connectToMCPServer;
    }
    
    // Enable input field immediately
    if (messageInput) {
        messageInput.disabled = false;
        messageInput.placeholder = 'Type your message... (will connect when you send)';
    }
    
    // Initialize UI
    updateConnectionUI();
    updateStepTracker();
    
    console.log('[INIT] App initialized successfully');
}

// =============================================================
// START APPLICATION
// =============================================================

// Make functions globally available for HTML inline handlers
window.handleSubmit = handleSubmit;
window.initializeApp = initializeApp;
window.quickSearch = quickSearch;
window.detectUserLocation = detectUserLocation;
window.connectToZomato = connectToMCPServer;
window.startNewChat = () => {
    activeChatId = 'chat-' + Date.now();
    conversationHistory = [];
    if (messagesArea) messagesArea.innerHTML = '';
    if (emptyState) emptyState.style.display = 'flex';
};
window.toggleSidebar = () => {
    sidebarOpen = !sidebarOpen;
    if (sidebar) {
        sidebar.style.transform = sidebarOpen ? 'translateX(0)' : 'translateX(-100%)';
    }
};
window.sendSuggestion = (suggestion) => {
    if (messageInput) {
        messageInput.value = suggestion;
        handleSubmit({ preventDefault: () => {} });
    }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('[MCP App] Ready');
    });
} else {
    console.log('[MCP App] Ready');
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
@keyframes slideInRight {
    from {
        transform: translateX(100%);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}

@keyframes slideOutRight {
    from {
        transform: translateX(0);
        opacity: 1;
    }
    to {
        transform: translateX(100%);
        opacity: 0;
    }
}

.connecting {
    opacity: 0.7;
    pointer-events: none;
}

.tool-call {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: rgba(96, 165, 250, 0.1);
    border-radius: 6px;
    margin-top: 0.5rem;
    font-size: 0.875rem;
    color: #60a5fa;
}

.tool-calls-container {
    margin-top: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.action-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1rem;
}

.action-btn {
    padding: 0.5rem 1rem;
    background: linear-gradient(135deg, #E23744 0%, #ff6b6b 100%);
    color: white;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
}

.action-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(226, 55, 68, 0.3);
}

.typing-animation {
    display: flex;
    gap: 4px;
    padding: 1rem;
}

.typing-animation span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #60a5fa;
    animation: typing 1.4s infinite;
}

.typing-animation span:nth-child(2) {
    animation-delay: 0.2s;
}

.typing-animation span:nth-child(3) {
    animation-delay: 0.4s;
}

@keyframes typing {
    0%, 60%, 100% {
        transform: translateY(0);
        opacity: 0.7;
    }
    30% {
        transform: translateY(-10px);
        opacity: 1;
    }
}
`;
document.head.appendChild(style);

// =============================================================
// ZOMATO UI INTERACTIVE HANDLERS
// =============================================================

function safeSendPresetMessage(message) {
    if (!message || !messageInput) return;
    messageInput.value = message;
    sendMessage(message);
}

/**
 * Filter restaurants by criteria
 */
window.filterRestaurants = function(filter) {
    console.log('[Filter] Restaurants by:', filter);
    
    // Update active filter chip
    document.querySelectorAll('.filters .filter-chip').forEach(chip => {
        chip.classList.remove('active');
        if (chip.textContent.toLowerCase().includes(filter) || chip.onclick?.toString().includes(filter)) {
            chip.classList.add('active');
        }
    });
    
    const grid = document.getElementById('restaurantGrid');
    if (!grid) return;
    
    const cards = grid.querySelectorAll('.restaurant-card');
    
    cards.forEach(card => {
        card.style.display = 'block';
        
        if (filter === 'all') {
            card.style.display = 'block';
        } else if (filter === 'rating') {
            const rating = parseFloat(card.querySelector('.rating-badge span')?.textContent || '0');
            card.style.display = rating >= 4 ? 'block' : 'none';
        } else if (filter === 'delivery') {
            const deliveryTime = card.querySelector('.delivery-info span')?.textContent || '';
            const minutes = parseInt(deliveryTime);
            card.style.display = minutes <= 30 ? 'block' : 'none';
        } else if (filter === 'offers') {
            const hasOffer = card.querySelector('.offer-badge');
            card.style.display = hasOffer ? 'block' : 'none';
        }
    });
};

/**
 * Toggle favorite restaurant
 */
window.toggleFavorite = function(restaurantId) {
    console.log('[Favorite] Toggle restaurant:', restaurantId);
    showNotification('Added to favorites! ❤️', 'success');
};

/**
 * View restaurant menu
 */
window.viewRestaurantMenu = async function(restaurantId, restaurantName) {
    console.log('[Menu] View menu for:', restaurantId, restaurantName);
    
    // Store selected restaurant in ZomatoUI
    if (window.ZomatoUI) {
        window.ZomatoUI.selectedRestaurant = { id: restaurantId, name: restaurantName };
    }
    
    // Send message to get menu
    const message = `Show me the menu for restaurant ${restaurantName || restaurantId}`;
    if (messageInput) {
        messageInput.value = message;
        sendMessage(message);
    }
};

/**
 * Go back to previous view
 */
window.goBack = function() {
    console.log('[Navigation] Go back');
    if (messageInput) {
        messageInput.value = 'Show me restaurants again';
        sendMessage('Show me restaurants again');
    }
};

/**
 * View cart
 */
window.viewCart = function() {
    console.log('[Cart] View cart');
    const message = 'Show me my cart';
    if (messageInput) {
        messageInput.value = message;
        sendMessage(message);
    }
};

/**
 * Filter menu items
 */
window.filterMenu = function(filter) {
    console.log('[Filter] Menu items by:', filter);
    
    // Update active filter chip
    document.querySelectorAll('.menu-filters .filter-chip').forEach(chip => {
        chip.classList.remove('active');
        if (chip.textContent.toLowerCase().includes(filter) || chip.onclick?.toString().includes(filter)) {
            chip.classList.add('active');
        }
    });
    
    const menuItems = document.querySelectorAll('.menu-item');
    
    menuItems.forEach(item => {
        item.style.display = 'flex';
        
        if (filter === 'all') {
            item.style.display = 'flex';
        } else if (filter === 'veg') {
            const isVeg = item.querySelector('.veg-indicator.veg');
            item.style.display = isVeg ? 'flex' : 'none';
        } else if (filter === 'non-veg') {
            const isNonVeg = item.querySelector('.veg-indicator.non-veg');
            item.style.display = isNonVeg ? 'flex' : 'none';
        } else if (filter === 'bestseller') {
            const isBestseller = item.querySelector('.bestseller-badge');
            item.style.display = isBestseller ? 'flex' : 'none';
        }
    });
};

/**
 * Add item to cart
 */
window.addToCart = function(itemId, itemName, price = 0) {
    console.log('[Cart] Add item:', itemId, itemName, price);
    
    // Update cart in ZomatoUI
    if (window.ZomatoUI) {
        const existing = window.ZomatoUI.cart.find(i => i.id === itemId);
        if (existing) {
            existing.quantity += 1;
        } else {
            window.ZomatoUI.cart.push({
                id: itemId,
                name: itemName,
                price,
                quantity: 1
            });
        }
        
        // Update cart count badge
        const cartCount = document.querySelector('.cart-count');
        if (cartCount) {
            const totalItems = window.ZomatoUI.cart.reduce((sum, item) => sum + (item.quantity || 0), 0);
            cartCount.textContent = totalItems;
        }
    }
    
    showNotification(`${itemName} added to cart! 🛒`, 'success');
    safeSendPresetMessage(`Add ${itemName} to my cart`);
};

/**
 * Add more items (go back to menu)
 */
window.addMoreItems = function() {
    console.log('[Cart] Add more items');
    safeSendPresetMessage('Show me the menu again');
};

window.backToMenu = window.addMoreItems;

/**
 * Update item quantity in cart
 */
window.updateQuantity = function(itemId, delta, itemName = 'this item') {
    console.log('[Cart] Update quantity:', itemId, delta, itemName);
    
    if (window.ZomatoUI) {
        const item = window.ZomatoUI.cart.find(i => i.id === itemId);
        if (item) {
            item.quantity = Math.max(0, (item.quantity || 0) + delta);
            
            if (item.quantity === 0) {
                const index = window.ZomatoUI.cart.indexOf(item);
                window.ZomatoUI.cart.splice(index, 1);
                showNotification('Item removed from cart', 'info');
            }
        }
    }

    if (delta > 0) {
        safeSendPresetMessage(`Increase quantity of ${itemName} by 1 in my cart`);
    } else {
        safeSendPresetMessage(`Decrease quantity of ${itemName} by 1 in my cart`);
    }
};

/**
 * Proceed to checkout
 */
window.proceedToCheckout = function() {
    console.log('[Cart] Proceed to checkout');

    safeSendPresetMessage('Proceed to payment and checkout with my current cart');
};

/**
 * Track order
 */
window.trackOrder = function(orderId) {
    console.log('[Order] Track order:', orderId);
    safeSendPresetMessage(`Track my order ${orderId}`);
};

console.log('[Zomato UI Handlers] Interactive handlers loaded');
