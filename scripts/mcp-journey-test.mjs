#!/usr/bin/env node

const baseUrl = process.env.JOURNEY_BASE_URL || 'http://localhost:3000';
const pollTimeoutMs = Number(process.env.JOURNEY_CONNECT_TIMEOUT_MS || 30000);

async function request(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, text, json };
}

function hasToolCall(data, pattern) {
  const calls = Array.isArray(data?.toolCalls) ? data.toolCalls : [];
  return calls.some((call) => pattern.test(call?.name || ''));
}

async function ensureConnected() {
  const status = await request('/api/status');
  if (status.ok && status.json?.connected) return { connected: true, via: 'existing' };

  await request('/api/mcp/connect', { method: 'POST', body: '{}' });
  const started = Date.now();

  while (Date.now() - started < pollTimeoutMs) {
    const next = await request('/api/status');
    if (next.ok && next.json?.connected) {
      return { connected: true, via: 'connect' };
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  const finalStatus = await request('/api/status');
  return {
    connected: false,
    reason: finalStatus.json?.error || 'MCP not connected (likely auth flow not completed in browser).'
  };
}

async function run() {
  console.log(`Journey test against ${baseUrl}`);

  const report = [];

  const health = await request('/api/status');
  report.push({
    stage: 'Server health',
    pass: health.ok,
    detail: health.ok ? 'API reachable' : `HTTP ${health.status}`
  });

  const conn = await ensureConnected();
  report.push({
    stage: 'MCP connection',
    pass: conn.connected,
    detail: conn.connected ? `Connected (${conn.via})` : conn.reason
  });

  if (!conn.connected) {
    const failed = report.filter((r) => !r.pass).length;
    report.forEach((r) => console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.stage}  ${r.detail}`));
    console.log('FAIL  Journey flow  Blocked: MCP connection prerequisite not met.');
    process.exit(failed > 0 ? 1 : 0);
  }

  const session = await request('/api/session', { method: 'POST', body: '{}' });
  const sessionId = session.json?.sessionId;
  const chat = await request('/api/chats/new', {
    method: 'POST',
    body: JSON.stringify({ sessionId })
  });
  const chatId = chat.json?.chatId;

  if (!sessionId || !chatId) {
    report.push({ stage: 'Session bootstrap', pass: false, detail: 'Unable to create session/chat for journey.' });
  } else {
    report.push({ stage: 'Session bootstrap', pass: true, detail: 'Session and chat created' });
  }

  const steps = [
    {
      stage: 'Search',
      prompt: 'Find top rated biryani restaurants near me',
      expect: /get_restaurants_for_keyword/i
    },
    {
      stage: 'Menu',
      prompt: 'Show me the menu for restaurant Behrouz Biryani',
      expect: /get_menu_items_listing/i
    },
    {
      stage: 'Cart',
      prompt: 'Add one chicken biryani to my cart',
      expect: /(add_to_cart|create_cart|get_cart)/i
    },
    {
      stage: 'Coupon',
      prompt: 'Show available coupons and apply the best coupon',
      expect: /(offer|coupon|discount)/i
    },
    {
      stage: 'Payment',
      prompt: 'Proceed to payment with UPI',
      expect: /(checkout|payment|upi)/i
    },
    {
      stage: 'UPI QR',
      prompt: 'Generate UPI QR code for payment',
      expect: /(qr|upi|payment)/i
    }
  ];

  for (const step of steps) {
    if (!sessionId || !chatId) {
      report.push({ stage: step.stage, pass: false, detail: 'Skipped: no session/chat' });
      continue;
    }

    const response = await request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: step.prompt,
        sessionId,
        chatId,
        history: []
      })
    });

    if (!response.ok || !response.json) {
      report.push({ stage: step.stage, pass: false, detail: `HTTP ${response.status}` });
      continue;
    }

    const text = String(response.json?.response || '');
    const toolMatch = hasToolCall(response.json, step.expect);
    const textMatch = step.expect.test(text);

    report.push({
      stage: step.stage,
      pass: toolMatch || textMatch,
      detail: toolMatch ? 'Expected MCP tool call observed' : (textMatch ? 'Expected stage keywords observed in response' : 'Expected signal not found')
    });
  }

  let passCount = 0;
  for (const item of report) {
    if (item.pass) passCount++;
    console.log(`${item.pass ? 'PASS' : 'FAIL'}  ${item.stage}  ${item.detail}`);
  }

  console.log(`\nSummary: ${passCount}/${report.length} stages passed.`);
  process.exit(passCount === report.length ? 0 : 1);
}

run().catch((error) => {
  console.error('Journey test crashed:', error.message);
  process.exit(1);
});
