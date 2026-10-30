import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Vercel Serverless Function: /api/chat
 * Token-optimized Gemini AI endpoint supporting text + multimodal photos/PDFs,
 * automatic multi-model failover (gemini-2.5-flash -> gemini-3.5-flash-lite -> gemini-3.5-flash),
 * zero-thinking-overhead JSON output, and structured UI actions.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const primaryModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const modelChain = Array.from(
    new Set([
      primaryModel,
      'gemini-2.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash',
      'gemini-flash-lite-latest',
    ])
  );

  if (!apiKey) {
    return res.status(503).json({
      error: 'GEMINI_API_KEY is not configured on the server yet.',
      missingKey: true,
    });
  }

  try {
    const {
      message = '',
      compactCatalog = '',
      compactState = '',
      recentTurns = [],
      attachments = [],
    } = req.body || {};

    const systemPrompt = [
      'You are Nova, a concise, friendly Nigerian university campus delivery AI (Food, Groceries, Laundry, Parcel Pickup).',
      'Prices are in NGN (₦). Campuses: Wigwe University, University of Port Harcourt, Rivers State University.',
      'TOKEN RULE: Keep replies warm, helpful, and under 55 words.',
      'CATALOG (id|name|price|category|subcat):',
      compactCatalog,
      'STATE:',
      compactState,
      'Return STRICT JSON matching:',
      '{"reply":"string","actions":[...]}',
      'Allowed action objects in actions array:',
      '- {"type":"ADD_TO_BAG","productId":"<id>","quantity":1}',
      '- {"type":"REMOVE_FROM_BAG","productId":"<id>"}',
      '- {"type":"CLEAR_BAG"}',
      '- {"type":"NAVIGATE_HOME"}',
      '- {"type":"NAVIGATE_BROWSE","nodeId":"food|food/dishes|food/fastfood|food/snacks|food/drinks|groceries|groceries/foodstuffs|groceries/beverages|groceries/snacks|groceries/household|groceries/personal"}',
      '- {"type":"NAVIGATE_SERVICE","service":"Laundry|Parcel Pickup"}',
      '- {"type":"SET_LAUNDRY_QTY","serviceId":"wash|iron|dry|bedding","quantity":1}',
      '- {"type":"UPDATE_DELIVERY_DETAILS","details":{"university":"...","campusAddress":"...","phone":"..."}}',
      '- {"type":"GO_TO_CHECKOUT"}',
      '- {"type":"GO_TO_PAYMENT"}',
      '- {"type":"OPEN_BAG"} | {"type":"OPEN_ORDERS"} | {"type":"OPEN_SETTINGS"} | {"type":"OPEN_ADMIN"}',
      'If user confirms they are ready to pay or asks to pay, include {"type":"GO_TO_PAYMENT"}.',
      'If an image/PDF is a shopping list, match catalog items and emit ADD_TO_BAG actions. If it is a payment receipt, emit GO_TO_PAYMENT and acknowledge receipt.',
    ].join('\n');

    const parts: Array<Record<string, unknown>> = [];

    if (Array.isArray(recentTurns) && recentTurns.length > 0) {
      parts.push({
        text: `Recent context:\n${recentTurns.slice(-4).join('\n')}`,
      });
    }

    parts.push({
      text: message || 'Please inspect the attached file(s) and help me with my Nova order.',
    });

    if (Array.isArray(attachments)) {
      for (const att of attachments.slice(0, 3)) {
        if (att?.dataUrl && typeof att.dataUrl === 'string' && att.dataUrl.includes('base64,')) {
          const base64Data = att.dataUrl.split('base64,')[1];
          parts.push({
            inlineData: {
              mimeType: att.mimeType || 'image/jpeg',
              data: base64Data,
            },
          });
        } else if (att?.textContent) {
          parts.push({
            text: `Attached text file (${att.name}):\n${String(att.textContent).slice(0, 3000)}`,
          });
        }
      }
    }

    let geminiRes: Response | null = null;
    let lastErrorStatus = 502;
    let lastErrorText = '';
    let activeModel = primaryModel;

    for (const candidateModel of modelChain) {
      activeModel = candidateModel;
      const supportsZeroThinking = candidateModel === 'gemini-2.5-flash';
      const generationConfig: Record<string, unknown> = {
        temperature: 0.35,
        maxOutputTokens: 700,
        responseMimeType: 'application/json',
      };
      if (supportsZeroThinking) {
        generationConfig.thinkingConfig = { thinkingBudget: 0 };
      }

      const bodyPayload = JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts }],
        generationConfig,
      });

      const attempt = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${candidateModel}:generateContent?key=${encodeURIComponent(
          apiKey
        )}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: bodyPayload,
        }
      );

      if (attempt.ok) {
        geminiRes = attempt;
        break;
      }

      lastErrorStatus = attempt.status;
      lastErrorText = await attempt.text();
    }

    if (!geminiRes) {
      return res.status(lastErrorStatus).json({
        error: 'Gemini API request failed across model chain',
        details: lastErrorText.slice(0, 400),
      });
    }

    const payload = await geminiRes.json();
    const candidateParts: Array<{ thought?: boolean; text?: string }> =
      payload?.candidates?.[0]?.content?.parts || [];
    const textPart =
      candidateParts.find((p) => !p.thought && typeof p.text === 'string') || candidateParts[0];
    const rawCandidate =
      textPart?.text || '{"reply":"How can I help with your delivery?","actions":[]}';
    const usageTokens = Number(payload?.usageMetadata?.totalTokenCount || 280);

    let parsed: { reply?: string; actions?: unknown[] } = {};
    try {
      parsed = JSON.parse(rawCandidate);
    } catch {
      parsed = { reply: rawCandidate, actions: [] };
    }

    return res.status(200).json({
      reply: parsed.reply || 'Done! Let me know what else you need.',
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      tokensUsed: usageTokens,
      model: activeModel,
    });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Internal server error',
    });
  }
}
