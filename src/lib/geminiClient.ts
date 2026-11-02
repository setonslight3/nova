import { formatNaira } from '../data/defaultCatalog';
import {
  AIAction,
  AIResolutionResult,
  ChatAttachment,
  UserSettings,
} from '../types/nova';
import { NlpContext, runLocalNlp } from './nlpEngine';

/**
 * Builds an ultra-compact SKU string so Gemini uses ~75% fewer input tokens per call.
 */
function buildCompactCatalog(ctx: NlpContext): string {
  const prodLines = ctx.products
    .filter((p) => p.available)
    .map((p) => `${p.id}|${p.name}|₦${p.price}|${p.category}>${p.subcategory}`)
    .join('\n');
  const laundryLines = ctx.laundryServices
    .filter((l) => l.available)
    .map((l) => `laundry:${l.id}|${l.name}|₦${l.price}/item`)
    .join('\n');
  return `${prodLines}\n${laundryLines}`;
}

function buildCompactState(ctx: NlpContext): string {
  const bagItems = Object.entries(ctx.bag)
    .filter(([, q]) => q > 0)
    .map(([id, q]) => `${id}x${q}`)
    .join(',') || 'empty';
  return `service=${ctx.activeService || 'home'};checkout=${ctx.checkoutStage};bag=${bagItems};uni=${
    ctx.deliveryDetails.university || 'unset'
  };orders=${ctx.orders.length}`;
}

async function callDirectDevGemini(
  devApiKey: string,
  message: string,
  compactCatalog: string,
  compactState: string,
  recentTurns: string[],
  attachments: ChatAttachment[]
): Promise<{ reply: string; actions: AIAction[]; tokensUsed: number }> {
  const systemPrompt = [
    'You are Nova, a concise, friendly Nigerian university campus delivery AI (Food, Groceries, Laundry, Parcel Pickup).',
    'Prices are in NGN (₦). Campuses: Wigwe University, University of Port Harcourt, Rivers State University.',
    'Keep replies warm, helpful, and under 55 words.',
    'CATALOG (id|name|price|cat):',
    compactCatalog,
    'STATE:',
    compactState,
    'Return STRICT JSON: {"reply":"string","actions":[...]}',
    'Allowed actions: ADD_TO_BAG(productId,quantity), REMOVE_FROM_BAG(productId), CLEAR_BAG, NAVIGATE_HOME, NAVIGATE_BROWSE(nodeId: food, food/dishes, food/fastfood, food/snacks, food/drinks, groceries, groceries/foodstuffs, groceries/beverages, groceries/snacks, groceries/household, groceries/personal), NAVIGATE_SERVICE(service: Laundry | Parcel Pickup), SET_LAUNDRY_QTY(serviceId: wash|iron|dry|bedding, quantity), UPDATE_DELIVERY_DETAILS(details:{university,campusAddress,phone}), GO_TO_CHECKOUT, GO_TO_PAYMENT, OPEN_BAG, OPEN_ORDERS, OPEN_SETTINGS, OPEN_ADMIN.',
  ].join('\n');

  const parts: Array<Record<string, unknown>> = [];
  if (recentTurns.length) {
    parts.push({ text: `Recent:\n${recentTurns.slice(-4).join('\n')}` });
  }
  parts.push({
    text: message || 'Inspect the attached file(s) and assist with my Nova delivery request.',
  });

  for (const att of attachments.slice(0, 3)) {
    if (att.dataUrl && att.dataUrl.includes('base64,')) {
      parts.push({
        inlineData: {
          mimeType: att.mimeType,
          data: att.dataUrl.split('base64,')[1],
        },
      });
    } else if (att.textContent) {
      parts.push({ text: `File (${att.name}):\n${att.textContent.slice(0, 3000)}` });
    }
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
      devApiKey.trim()
    )}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 360,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini error (${res.status})`);
  }

  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const tokensUsed = Number(data?.usageMetadata?.totalTokenCount || 260);
  const parsed = JSON.parse(raw);
  return {
    reply: parsed.reply || 'Done! How else can Nova help?',
    actions: Array.isArray(parsed.actions) ? parsed.actions : [],
    tokensUsed,
  };
}

/**
 * Smart Local Budget / Recommendation Fallback when Gemini API key isn't connected yet
 * so the platform ALWAYS understands budget/price/recommendation questions gracefully!
 */
function buildSmartOfflineFallback(
  message: string,
  attachments: ChatAttachment[],
  ctx: NlpContext
): AIResolutionResult {
  const lower = message.toLowerCase();

  // Budget query fallback e.g. "what can I get with 5000" or "under ₦4000"
  const budgetMatch = lower.match(/(?:under|with|have|budget(?:\s+of)?|for)\s*₦?\s*(\d{3,6})/);
  if (budgetMatch) {
    const budget = Number(budgetMatch[1]);
    const affordable = ctx.products
      .filter((p) => p.available && p.price <= budget)
      .sort((a, b) => a.price - b.price);
    if (affordable.length > 0) {
      const topIds = affordable.slice(0, 3).map((p) => p.id);
      const list = affordable
        .slice(0, 3)
        .map((p) => `${p.name} (${formatNaira(p.price)})`)
        .join(', ');
      return {
        reply: `With ${formatNaira(budget)}, you can get ${list}! Tap + on any card below or tell me which ones to add.`,
        actions: [],
        productIds: topIds,
        engine: 'nlp',
        confidence: 0.85,
        tokensSavedEstimate: 680,
        tokensUsedEstimate: 0,
      };
    }
  }

  // Product & price inquiry fallback e.g. "how much is jollof", "do you have shawarma", etc.
  const matched = ctx.products.filter((p) =>
    lower.includes(p.id) ||
    p.name
      .toLowerCase()
      .split(/\s+/)
      .some((w) => w.length >= 4 && lower.includes(w))
  );
  if (matched.length > 0) {
    const first = matched[0];
    return {
      reply: `I found **${first.name}** for **${formatNaira(first.price)}** (${first.time}). I can add it to your bag for you right now, or you can browse the ${first.category} section!`,
      actions: [],
      productIds: matched.slice(0, 3).map((p) => p.id),
      engine: 'nlp',
      confidence: 0.88,
      tokensSavedEstimate: 590,
      tokensUsedEstimate: 0,
      quickActions: [
        { label: `+ Add ${first.name} (${formatNaira(first.price)})`, actionType: `ADD_PRODUCT:${first.id}` },
        { label: `Browse ${first.category} →`, actionType: first.category === 'Food' ? 'BROWSE_FOOD' : 'BROWSE_GROCERIES' },
      ],
    };
  }

  if (attachments.length > 0) {
    const names = attachments.map((a) => a.name).join(', ');
    return {
      reply: `I received your attachment (${names}). Live Gemini Vision will analyze photos & PDFs automatically as soon as your Gemini API key is connected on Vercel (or pasted in Settings → AI). Meanwhile, you can attach payment receipts directly in Checkout or tell me items to add!`,
      actions: [],
      engine: 'nlp',
      confidence: 0.75,
      tokensSavedEstimate: 400,
      tokensUsedEstimate: 0,
      quickActions: [
        { label: 'Browse Food', actionType: 'BROWSE_FOOD' },
        { label: 'Open AI Settings', actionType: 'OPEN_AI_SETTINGS' },
      ],
    };
  }

  return {
    reply:
      'I can take you anywhere on Nova or build your order! Try saying: "Add 2 jollof rice and milk", "Take me to laundry", "I’m ready to pay", or pick a service below.',
    actions: [],
    choices: ['food', 'groceries'],
    quickActions: [
      { label: 'Laundry Pickup', actionType: 'NAVIGATE_LAUNDRY' },
      { label: 'Parcel Pickup', actionType: 'NAVIGATE_PARCEL' },
    ],
    engine: 'nlp',
    confidence: 0.75,
    tokensSavedEstimate: 450,
    tokensUsedEstimate: 0,
  };
}

export async function resolveUserTurn(
  message: string,
  attachments: ChatAttachment[],
  ctx: NlpContext,
  settings: UserSettings
): Promise<AIResolutionResult> {
  const allowNlp = settings.enableLocalNlp !== false;
  const allowGemini = settings.enableGeminiApi !== false;

  // 1. Both engines disabled
  if (!allowNlp && !allowGemini) {
    return {
      reply: 'Both Local NLP and Gemini API are currently disabled in Settings. Enable at least one engine under Settings → Hybrid AI to send queries.',
      actions: [],
      engine: 'nlp',
      confidence: 1,
      tokensSavedEstimate: 0,
      tokensUsedEstimate: 0,
    };
  }

  // 2. Local NLP check (if allowed)
  if (allowNlp) {
    const localResult = runLocalNlp(message, attachments, ctx);
    // If Gemini is disabled, we always stay on-device
    if (!allowGemini) {
      if (localResult && localResult.confidence >= 0.75) {
        return localResult;
      }
      return buildSmartOfflineFallback(message, attachments, ctx);
    }

    // In hybrid mode, return local NLP if confident
    if (localResult && localResult.confidence >= 0.78) {
      return localResult;
    }
  }

  // 3. Pure Gemini API (or hybrid escalation when local NLP did not match)
  if (!allowGemini) {
    return buildSmartOfflineFallback(message, attachments, ctx);
  }

  // Escalate to Gemini AI (Serverless /api/chat first, or local dev key in Settings)
  const compactCatalog = buildCompactCatalog(ctx);
  const compactState = buildCompactState(ctx);
  const recentTurns = ctx.recentMessages
    .slice(-4)
    .map((m) => `${m.role === 'you' ? 'U' : 'N'}: ${m.text.slice(0, 120)}`);

  if (settings.devGeminiApiKey.trim()) {
    try {
      const res = await callDirectDevGemini(
        settings.devGeminiApiKey,
        message,
        compactCatalog,
        compactState,
        recentTurns,
        attachments
      );
      return {
        reply: res.reply,
        actions: res.actions,
        engine: 'gemini',
        confidence: 0.95,
        tokensSavedEstimate: 420,
        tokensUsedEstimate: res.tokensUsed,
      };
    } catch {
      // Fall through to server endpoint
    }
  }

  const endpoints = ['/api/chat'];
  const renderBackup = (import.meta.env.VITE_RENDER_API_URL as string | undefined)?.trim();
  if (renderBackup) {
    endpoints.push(`${renderBackup.replace(/\/$/, '')}/api/chat`);
  }

  const requestBody = JSON.stringify({
    message,
    compactCatalog,
    compactState,
    recentTurns,
    attachments: attachments.map((a) => ({
      name: a.name,
      mimeType: a.mimeType,
      dataUrl: a.dataUrl,
      textContent: a.textContent,
    })),
  });

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      });

      if (response.ok) {
        const data = await response.json();
        return {
          reply: data.reply,
          actions: Array.isArray(data.actions) ? data.actions : [],
          engine: 'gemini',
          confidence: 0.95,
          tokensSavedEstimate: 420,
          tokensUsedEstimate: Number(data.tokensUsed || 260),
        };
      }
    } catch {
      // Try next configured endpoint
    }
  }

  // If user disabled NLP to test pure Gemini API and the API call failed:
  if (!allowNlp) {
    return {
      reply: 'Gemini API call could not be completed. For pure API testing without a backend, please paste your Gemini API Key in Settings → Hybrid AI.',
      actions: [],
      engine: 'gemini',
      confidence: 0.5,
      tokensSavedEstimate: 0,
      tokensUsedEstimate: 0,
    };
  }

  return buildSmartOfflineFallback(message, attachments, ctx);
}
