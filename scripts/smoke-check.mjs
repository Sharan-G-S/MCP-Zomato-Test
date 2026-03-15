#!/usr/bin/env node

const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:3000';

async function request(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options
    });

    const text = await response.text();
    let json = null;
    try {
        json = JSON.parse(text);
    } catch {
        json = null;
    }

    return {
        ok: response.ok,
        status: response.status,
        text,
        json
    };
}

async function run() {
    console.log(`Smoke checking ${baseUrl}`);

    const checks = [];

    const statusRes = await request('/api/status');
    checks.push({
        name: 'GET /api/status',
        pass: statusRes.ok && typeof statusRes.json === 'object' && statusRes.json !== null,
        detail: statusRes.ok ? 'OK' : `HTTP ${statusRes.status}`
    });

    const sessionRes = await request('/api/session', { method: 'POST', body: '{}' });
    const sessionId = sessionRes.json?.sessionId;
    checks.push({
        name: 'POST /api/session',
        pass: sessionRes.ok && !!sessionId,
        detail: sessionRes.ok ? `sessionId=${sessionId || 'missing'}` : `HTTP ${sessionRes.status}`
    });

    let chatId = null;
    if (sessionId) {
        const createChatRes = await request('/api/chats/new', {
            method: 'POST',
            body: JSON.stringify({ sessionId })
        });
        chatId = createChatRes.json?.chatId;

        checks.push({
            name: 'POST /api/chats/new',
            pass: createChatRes.ok && !!chatId,
            detail: createChatRes.ok ? `chatId=${chatId || 'missing'}` : `HTTP ${createChatRes.status}`
        });

        const listChatsRes = await request(`/api/chats?sessionId=${encodeURIComponent(sessionId)}`);
        checks.push({
            name: 'GET /api/chats',
            pass: listChatsRes.ok && Array.isArray(listChatsRes.json?.chats),
            detail: listChatsRes.ok ? `chats=${listChatsRes.json?.chats?.length ?? 0}` : `HTTP ${listChatsRes.status}`
        });

        if (chatId) {
            const deleteRes = await request(`/api/chats/${encodeURIComponent(chatId)}?sessionId=${encodeURIComponent(sessionId)}`, {
                method: 'DELETE'
            });
            checks.push({
                name: 'DELETE /api/chats/:chatId',
                pass: deleteRes.ok && deleteRes.json?.success === true,
                detail: deleteRes.ok ? 'deleted' : `HTTP ${deleteRes.status}`
            });
        }
    }

    const toolsRes = await request('/api/mcp/tools');
    checks.push({
        name: 'GET /api/mcp/tools',
        pass: toolsRes.ok && Array.isArray(toolsRes.json?.tools),
        detail: toolsRes.ok ? `tools=${toolsRes.json?.tools?.length ?? 0}` : `HTTP ${toolsRes.status}`
    });

    const failed = checks.filter((check) => !check.pass);
    checks.forEach((check) => {
        console.log(`${check.pass ? 'PASS' : 'FAIL'}  ${check.name}  ${check.detail}`);
    });

    if (failed.length > 0) {
        console.error(`\nSmoke check failed: ${failed.length} checks did not pass.`);
        process.exit(1);
    }

    console.log('\nSmoke check passed. Core API routes are healthy.');
}

run().catch((error) => {
    console.error('Smoke check crashed:', error.message);
    process.exit(1);
});
