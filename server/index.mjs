import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '../dist');
const PORT = Number(process.env.PORT || 10000);

const MIME_MAP = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

function readJsonBody(req, maxBytes = 15 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let bytes = 0;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      raw += chunk.toString('utf8');
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

async function handleChat(req, res) {
  const apiKey = process.env.GEMINI_API_KEY;
  const primaryModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const fallbackModel = 'gemini-2.5-flash-lite';

  if (!apiKey) {
    return sendJson(res, 503, { error: 'GEMINI_API_KEY is not configured.', missingKey: true });
  }

  try {
    const body = await readJsonBody(req);
    const {
      message = '',
      compactCatalog = '',
      compactState = '',
      recentTurns = [],
      attachments = [],
    } = body;

    const systemPrompt = [
      'You are Nova, a concise, friendly Nigerian university campus delivery AI (Food, Groceries, Laundry, Parcel Pickup).',
      'Prices are in NGN (₦). Campuses: Wigwe University, University of Port Harcourt, Rivers State University.',
      'TOKEN RULE: Keep replies warm, helpful, and under 55 words.',
      'CATALOG (id|name|price|category|subcat):',
      compactCatalog,
      'STATE:',
      compactState,
      'Return STRICT JSON matching: {"reply":"string","actions":[...]}',
      'Allowed actions: ADD_TO_BAG(productId,quantity), REMOVE_FROM_BAG(productId), CLEAR_BAG, NAVIGATE_HOME, NAVIGATE_BROWSE(nodeId), NAVIGATE_SERVICE(service: Laundry | Parcel Pickup), SET_LAUNDRY_QTY(serviceId: wash|iron|dry|bedding, quantity), UPDATE_DELIVERY_DETAILS(details:{university,campusAddress,phone}), GO_TO_CHECKOUT, GO_TO_PAYMENT, OPEN_BAG, OPEN_ORDERS, OPEN_SETTINGS, OPEN_ADMIN.',
      'If user confirms they are ready to pay or asks to pay, include {"type":"GO_TO_PAYMENT"}.',
    ].join('\n');

    const parts = [];
    if (Array.isArray(recentTurns) && recentTurns.length > 0) {
      parts.push({ text: `Recent context:\n${recentTurns.slice(-4).join('\n')}` });
    }
    parts.push({
      text: message || 'Please inspect the attached file(s) and help me with my Nova order.',
    });

    if (Array.isArray(attachments)) {
      for (const att of attachments.slice(0, 3)) {
        if (att?.dataUrl && typeof att.dataUrl === 'string' && att.dataUrl.includes('base64,')) {
          parts.push({
            inlineData: {
              mimeType: att.mimeType || 'image/jpeg',
              data: att.dataUrl.split('base64,')[1],
            },
          });
        } else if (att?.textContent) {
          parts.push({
            text: `Attached text file (${att.name}):\n${String(att.textContent).slice(0, 3000)}`,
          });
        }
      }
    }

    const geminiPayload = JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 360,
        responseMimeType: 'application/json',
      },
    });

    let gRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${primaryModel}:generateContent?key=${encodeURIComponent(
        apiKey
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: geminiPayload,
      }
    );

    if (!gRes.ok && primaryModel !== fallbackModel && [429, 500, 503].includes(gRes.status)) {
      gRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${fallbackModel}:generateContent?key=${encodeURIComponent(
          apiKey
        )}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: geminiPayload,
        }
      );
    }

    if (!gRes.ok) {
      const errTxt = await gRes.text();
      return sendJson(res, gRes.status, { error: 'Gemini error', details: errTxt.slice(0, 400) });
    }

    const payload = await gRes.json();
    const rawCandidate =
      payload?.candidates?.[0]?.content?.parts?.[0]?.text ||
      '{"reply":"How can I help with your delivery?","actions":[]}';
    const usageTokens = Number(payload?.usageMetadata?.totalTokenCount || 280);

    let parsed = {};
    try {
      parsed = JSON.parse(rawCandidate);
    } catch {
      parsed = { reply: rawCandidate, actions: [] };
    }

    return sendJson(res, 200, {
      reply: parsed.reply || 'Done! Let me know what else you need.',
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      tokensUsed: usageTokens,
    });
  } catch (err) {
    return sendJson(res, 500, { error: err instanceof Error ? err.message : 'Server error' });
  }
}

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  if (urlObj.pathname === '/api/health') {
    return sendJson(res, 200, {
      ok: true,
      service: 'nova-render-server',
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      timestamp: new Date().toISOString(),
    });
  }

  if (urlObj.pathname === '/api/chat' && req.method === 'POST') {
    return handleChat(req, res);
  }

  // Serve built Vite SPA from dist/
  let safePath = path.normalize(urlObj.pathname).replace(/^(\.\.[/\\])+/, '');
  if (safePath === '/' || safePath === '\\') safePath = '/index.html';
  let filePath = path.join(DIST_DIR, safePath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    return sendJson(res, 200, { ok: true, service: 'nova-api', note: 'Frontend dist not built' });
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME_MAP[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Nova server listening on http://0.0.0.0:${PORT}`);
});
