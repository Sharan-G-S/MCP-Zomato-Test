/**
 * MCP Client for Browser - Native MCP Apps Architecture
 * Implements direct browser-to-MCP-server communication
 */

class MCPClient {
    constructor() {
        this.connected = false;
        this.connecting = false;
        this.tools = [];
        this.resources = [];
        this.prompts = [];
        this.sessionId = null;
        this.capabilities = {
            roots: { listChanged: true },
            sampling: {}
        };
        this.eventListeners = {
            'connect': [],
            'disconnect': [],
            'error': [],
            'tool-update': [],
            'resource-update': []
        };
    }

    /**
     * Connect to MCP server via backend proxy
     */
    async connect() {
        if (this.connecting || this.connected) {
            console.log('[MCP Client] Already connected or connecting');
            return;
        }

        this.connecting = true;
        this.emit('connecting');

        try {
            console.log('[MCP Client] Connecting to Zomato MCP server...');
            
            const response = await fetch('/api/mcp/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    capabilities: this.capabilities
                })
            });

            const data = await response.json();

            if (data.success) {
                this.connected = true;
                this.connecting = false;
                this.sessionId = data.sessionId;
                
                // Discover available tools, resources, and prompts
                await this.discover();
                
                this.emit('connect', { sessionId: this.sessionId });
                console.log('[MCP Client] Connected successfully');
                
                return { success: true, sessionId: this.sessionId };
            } else {
                throw new Error(data.error || 'Connection failed');
            }
        } catch (error) {
            this.connecting = false;
            this.connected = false;
            this.emit('error', error);
            console.error('[MCP Client] Connection error:', error);
            throw error;
        }
    }

    /**
     * Disconnect from MCP server
     */
    async disconnect() {
        if (!this.connected) return;

        try {
            await fetch('/api/mcp/disconnect', { method: 'POST' });
            this.connected = false;
            this.tools = [];
            this.resources = [];
            this.prompts = [];
            this.sessionId = null;
            this.emit('disconnect');
            console.log('[MCP Client] Disconnected');
        } catch (error) {
            console.error('[MCP Client] Disconnect error:', error);
        }
    }

    /**
     * Discover available tools, resources, and prompts
     */
    async discover() {
        try {
            // List tools
            const toolsResponse = await fetch('/api/mcp/tools');
            const toolsData = await toolsResponse.json();
            this.tools = toolsData.tools || [];
            this.emit('tool-update', this.tools);

            // List resources
            const resourcesResponse = await fetch('/api/mcp/resources');
            const resourcesData = await resourcesResponse.json();
            this.resources = resourcesData.resources || [];
            this.emit('resource-update', this.resources);

            console.log(`[MCP Client] Discovered ${this.tools.length} tools, ${this.resources.length} resources`);
        } catch (error) {
            console.error('[MCP Client] Discovery error:', error);
        }
    }

    /**
     * Call an MCP tool
     */
    async callTool(toolName, args = {}) {
        if (!this.connected) {
            throw new Error('Not connected to MCP server');
        }

        try {
            console.log(`[MCP Client] Calling tool: ${toolName}`, args);
            
            const response = await fetch('/api/mcp/call-tool', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: this.sessionId,
                    toolName,
                    arguments: args
                })
            });

            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }

            console.log(`[MCP Client] Tool ${toolName} result:`, data.result);
            return data.result;
        } catch (error) {
            console.error(`[MCP Client] Tool call error (${toolName}):`, error);
            throw error;
        }
    }

    /**
     * Read a resource
     */
    async readResource(uri) {
        if (!this.connected) {
            throw new Error('Not connected to MCP server');
        }

        try {
            const response = await fetch('/api/mcp/read-resource', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: this.sessionId,
                    uri
                })
            });

            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }

            return data.contents;
        } catch (error) {
            console.error('[MCP Client] Resource read error:', error);
            throw error;
        }
    }

    /**
     * Get a prompt
     */
    async getPrompt(name, args = {}) {
        if (!this.connected) {
            throw new Error('Not connected to MCP server');
        }

        try {
            const response = await fetch('/api/mcp/get-prompt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: this.sessionId,
                    name,
                    arguments: args
                })
            });

            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }

            return data.messages;
        } catch (error) {
            console.error('[MCP Client] Prompt get error:', error);
            throw error;
        }
    }

    /**
     * Event system
     */
    on(event, callback) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].push(callback);
        }
    }

    off(event, callback) {
        if (this.eventListeners[event]) {
            this.eventListeners[event] = this.eventListeners[event].filter(cb => cb !== callback);
        }
    }

    emit(event, data) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`[MCP Client] Event handler error (${event}):`, error);
                }
            });
        }
    }

    /**
     * Get connection status
     */
    getStatus() {
        return {
            connected: this.connected,
            connecting: this.connecting,
            sessionId: this.sessionId,
            toolCount: this.tools.length,
            resourceCount: this.resources.length
        };
    }

    /**
     * Get all tools
     */
    getTools() {
        return this.tools;
    }

    /**
     * Get all resources
     */
    getResources() {
        return this.resources;
    }
}

// Export for use in other scripts
window.MCPClient = MCPClient;
