import { BROWSE_NODES, formatNaira } from '../data/defaultCatalog';
import {
  AIAction,
  AIResolutionResult,
  CampusZone,
  ChatAttachment,
  ChatMessage,
  CheckoutStage,
  DeliveryDetails,
  LaundryServiceItem,
  NovaOrder,
  Product,
} from '../types/nova';

export interface NlpContext {
  products: Product[];
  laundryServices: LaundryServiceItem[];
  campusZones: CampusZone[];
  bag: Record<string, number>;
  activeService: string;
  checkoutStage: CheckoutStage;
  deliveryDetails: DeliveryDetails;
  orders: NovaOrder[];
  recentMessages: ChatMessage[];
}

const WORD_NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  couple: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  half_dozen: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  dozen: 12,
};

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function fuzzyIncludes(haystackTokens: string[], targetWord: string): boolean {
  const cleanTarget = targetWord.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!cleanTarget) return false;
  for (const token of haystackTokens) {
    if (token === cleanTarget) return true;
    if (cleanTarget.length >= 4 && token.length >= 4) {
      const maxDist = cleanTarget.length >= 7 ? 2 : 1;
      if (levenshtein(token, cleanTarget) <= maxDist) return true;
    }
  }
  return false;
}

function extractInlineDeliveryDetails(
  text: string,
  campusZones: CampusZone[]
): Partial<DeliveryDetails> {
  const extracted: Partial<DeliveryDetails> = {};
  const lower = text.toLowerCase();

  // University matching
  for (const zone of campusZones) {
    const zLower = zone.name.toLowerCase();
    if (
      lower.includes(zLower) ||
      (zLower.includes('wigwe') && /\bwigwe\b/.test(lower)) ||
      (zLower.includes('port harcourt') && /\b(uniport|port harcourt)\b/.test(lower)) ||
      (zLower.includes('rivers state') && /\b(rsu|rivers state|ust)\b/.test(lower))
    ) {
      extracted.university = zone.name;
      break;
    }
  }

  // Nigerian phone matching
  const phoneMatch = text.match(/(?:\+?234|0)[789][01]\d(?:[\s-]?\d){7}/);
  if (phoneMatch) {
    extracted.phone = phoneMatch[0].replace(/[\s-]/g, '');
  }

  // Campus hostel / room / block landmark matching
  const addrMatch = text.match(
    /\b((?:hostel|hall|block|lodge|quarters|faculty|building|room|gate)\s+[a-z0-9][a-z0-9\s,#-]{0,35})/i
  );
  if (addrMatch) {
    extracted.campusAddress = addrMatch[1].trim();
  }

  return extracted;
}

function matchProductsWithQuantities(
  rawText: string,
  products: Product[]
): Array<{ product: Product; quantity: number }> {
  // Split clause into segments around "and", ",", "&", "plus", ";" or newlines
  const segments = rawText
    .toLowerCase()
    .split(/(?:,|\band\b|\bplus\b|&|;|\n)+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const matchedMap = new Map<string, { product: Product; quantity: number }>();

  for (const seg of segments) {
    const segTokens = seg
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    if (!segTokens.length) continue;

    let bestProduct: Product | null = null;
    let bestScore = 0;

    for (const product of products) {
      if (!product.available) continue;
      const pLower = product.name.toLowerCase();
      let score = 0;

      if (seg.includes(pLower)) {
        score = 100;
      } else {
        const keywords = [
          ...pLower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/),
          ...(product.tags || []),
        ].filter((w) => w.length >= 3 && !['pack', 'with', 'and', 'pcs', 'litre'].includes(w));

        // Disambiguate jollof rice vs fried rice vs white rice vs jollof spaghetti
        if (product.id === 'jollof' && fuzzyIncludes(segTokens, 'jollof') && !fuzzyIncludes(segTokens, 'spaghetti')) {
          score += 65;
        } else if (product.id === 'fried' && fuzzyIncludes(segTokens, 'fried')) {
          score += 65;
        } else if (product.id === 'spaghetti' && (fuzzyIncludes(segTokens, 'spaghetti') || fuzzyIncludes(segTokens, 'pasta'))) {
          score += 70;
        } else if (product.id === 'rice' && (seg.includes('white rice') || (fuzzyIncludes(segTokens, 'stew') && fuzzyIncludes(segTokens, 'rice')))) {
          score += 70;
        }

        for (const kw of new Set(keywords)) {
          const kwParts = kw.split(/\s+/);
          if (kwParts.every((part) => fuzzyIncludes(segTokens, part))) {
            score += kwParts.length > 1 ? 45 : 28;
          }
        }
      }

      if (score > bestScore && score >= 28) {
        bestScore = score;
        bestProduct = product;
      }
    }

    if (bestProduct) {
      // Extract quantity from segment
      let qty = 1;
      const digitMatch = seg.match(/\b(\d{1,2})\s*(?:x|plates?|packs?|bottles?|loaves?|cups?|wraps?|pcs?)?\b/);
      if (digitMatch) {
        const parsed = Number(digitMatch[1]);
        if (parsed >= 1 && parsed <= 99) qty = parsed;
      } else {
        for (const tok of segTokens) {
          if (WORD_NUMBERS[tok]) {
            qty = WORD_NUMBERS[tok];
            break;
          }
        }
      }

      const prev = matchedMap.get(bestProduct.id);
      matchedMap.set(bestProduct.id, {
        product: bestProduct,
        quantity: (prev?.quantity || 0) + qty,
      });
    }
  }

  return Array.from(matchedMap.values());
}

/**
 * Tier-1 Zero-Token On-Device NLP Engine.
 * Returns a high-confidence resolution when it understands the user's intent locally,
 * or low confidence (< 0.78) so the hybrid client escalates to Gemini AI.
 */
export function runLocalNlp(
  rawText: string,
  attachments: ChatAttachment[],
  ctx: NlpContext
): AIResolutionResult | null {
  const text = rawText.trim();
  const lower = text.toLowerCase();
  const tokens = lower
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  // 1. If an image or PDF is attached:
  //    - Check if user is in payment stage or explicitly uploading payment proof -> handle locally for 0 tokens!
  //    - Otherwise return null so Gemini Multimodal Vision analyzes the photo/PDF!
  const hasVisualOrPdf = attachments.some((a) => a.kind === 'image' || a.kind === 'pdf');
  if (hasVisualOrPdf) {
    const isReceiptIntent =
      ctx.checkoutStage === 'payment' ||
      /\b(receipt|proof|paid|transfer|payment|teller|debit)\b/i.test(lower);
    if (isReceiptIntent) {
      return {
        reply:
          'Got your payment proof! I have attached it to your active payment screen — review the summary below and tap submit to send your order for verification.',
        actions: [{ type: 'GO_TO_PAYMENT' }],
        engine: 'nlp',
        confidence: 0.95,
        tokensSavedEstimate: 1100,
        tokensUsedEstimate: 0,
      };
    }
    return null; // Escalate photos/PDFs to Gemini Vision
  }

  // 2. If a TXT or CSV shopping list file is attached -> parse items locally for 0 tokens!
  const textAttachments = attachments.filter((a) => a.kind === 'text' && a.textContent);
  if (textAttachments.length > 0) {
    const combinedList = [text, ...textAttachments.map((a) => a.textContent || '')].join('\n');
    const found = matchProductsWithQuantities(combinedList, ctx.products);
    if (found.length > 0) {
      const actions: AIAction[] = found.map((f) => ({
        type: 'ADD_TO_BAG',
        productId: f.product.id,
        quantity: f.quantity,
      }));
      const summary = found
        .map((f) => `${f.quantity} × ${f.product.name} (${formatNaira(f.product.price * f.quantity)})`)
        .join(', ');
      return {
        reply: `I read your attached list and added ${summary} to your bag! Would you like to check out or add anything else?`,
        actions,
        engine: 'nlp',
        confidence: 0.94,
        tokensSavedEstimate: 920,
        tokensUsedEstimate: 0,
        quickActions: [
          { label: 'Proceed to checkout →', actionType: 'GO_TO_CHECKOUT' },
          { label: "I'm ready to pay →", actionType: 'GO_TO_PAYMENT' },
        ],
      };
    }
  }

  if (!text) return null;

  // Extract any inline campus/phone/address details mentioned in the message
  const inlineDetails = extractInlineDeliveryDetails(text, ctx.campusZones);
  const detailActions: AIAction[] =
    Object.keys(inlineDetails).length > 0
      ? [{ type: 'UPDATE_DELIVERY_DETAILS', details: inlineDetails }]
      : [];

  // 3. Explicit Admin Dashboard / Settings / Camera / Orders / Bag / New Chat navigation
  if (/\b(admin|dashboard|manage orders|verify payment|backoffice|operator)\b/.test(lower)) {
    return {
      reply: 'Opening the Nova Admin Dashboard so you can manage orders, verify payment proofs, and configure catalog pricing.',
      actions: [{ type: 'OPEN_ADMIN' }],
      engine: 'nlp',
      confidence: 0.98,
      tokensSavedEstimate: 540,
      tokensUsedEstimate: 0,
    };
  }

  if (/\b(wake\s*word|voice\s*setting|hey\s*nova\s*setting|microphone\s*setting)\b/.test(lower)) {
    return {
      reply: 'Opening Voice & Wake Word Settings — you can toggle "Hey Nova" and "Hi Nova" standby listening there.',
      actions: [{ type: 'OPEN_SETTINGS', tab: 'voice' }],
      engine: 'nlp',
      confidence: 0.97,
      tokensSavedEstimate: 520,
      tokensUsedEstimate: 0,
    };
  }

  if (/\b(chat\s*limit|conversation\s*limit|storage\s*limit|clear\s*old\s*chats|history\s*limit)\b/.test(lower)) {
    return {
      reply: 'Opening On-Device Storage Settings where you can set your conversation limit and auto-clear threshold.',
      actions: [{ type: 'OPEN_SETTINGS', tab: 'storage' }],
      engine: 'nlp',
      confidence: 0.97,
      tokensSavedEstimate: 520,
      tokensUsedEstimate: 0,
    };
  }

  if (/\b(open\s+settings|settings|preferences|configure)\b/.test(lower)) {
    return {
      reply: 'Opening your Nova Settings panel.',
      actions: [{ type: 'OPEN_SETTINGS' }],
      engine: 'nlp',
      confidence: 0.95,
      tokensSavedEstimate: 480,
      tokensUsedEstimate: 0,
    };
  }

  if (/\b(take\s+a?\s*photo|open\s+camera|snap\s+a?\s*(picture|photo)|use\s+camera)\b/.test(lower)) {
    return {
      reply: 'Opening your camera so you can snap a photo.',
      actions: [{ type: 'OPEN_CAMERA' }],
      engine: 'nlp',
      confidence: 0.96,
      tokensSavedEstimate: 460,
      tokensUsedEstimate: 0,
    };
  }

  if (/\b(my\s+orders?|track\s+(my\s+)?(order|delivery|parcel|laundry)|order\s+status|where\s+is\s+my\s+(order|food|delivery))\b/.test(lower)) {
    const latest = ctx.orders[0];
    const statusText = latest
      ? `Your latest order (${latest.orderCode} · ${latest.serviceType}) is currently **${latest.status.replace(/_/g, ' ')}**. I've opened your Orders tracker for full details.`
      : "You don't have any submitted orders on this device yet. I've opened the Orders panel for you.";
    return {
      reply: statusText,
      actions: [{ type: 'OPEN_ORDERS' }],
      engine: 'nlp',
      confidence: 0.96,
      tokensSavedEstimate: 580,
      tokensUsedEstimate: 0,
    };
  }

  if (/\b(new\s+chat|start\s+fresh|new\s+conversation|reset\s+chat)\b/.test(lower)) {
    return {
      reply: 'Starting a fresh conversation! What can Nova get for you today?',
      actions: [{ type: 'NEW_CONVERSATION' }],
      engine: 'nlp',
      confidence: 0.96,
      tokensSavedEstimate: 450,
      tokensUsedEstimate: 0,
    };
  }

  if (/\b(go\s+(back\s+)?home|home\s*page|main\s+menu|start\s+over)\b/.test(lower)) {
    return {
      reply: 'Taking you back to the Nova home screen. Your bag and saved details remain intact.',
      actions: [{ type: 'NAVIGATE_HOME' }],
      engine: 'nlp',
      confidence: 0.96,
      tokensSavedEstimate: 450,
      tokensUsedEstimate: 0,
    };
  }

  if (/\b(open|show|view|check|what'?s\s+in)\s+(my\s+)?(bag|cart|basket)\b/.test(lower)) {
    const itemEntries = Object.entries(ctx.bag).filter(([, q]) => q > 0);
    if (!itemEntries.length) {
      return {
        reply: 'Your shopping bag is currently empty. Tell me what food or groceries you need and I will add them right away!',
        actions: [{ type: 'OPEN_BAG' }],
        engine: 'nlp',
        confidence: 0.95,
        tokensSavedEstimate: 500,
        tokensUsedEstimate: 0,
      };
    }
    const summary = itemEntries
      .map(([id, q]) => {
        const p = ctx.products.find((prod) => prod.id === id);
        return p ? `${q} × ${p.name}` : `${q} × ${id}`;
      })
      .join(', ');
    return {
      reply: `You currently have ${summary} in your bag. Opening your bag now!`,
      actions: [{ type: 'OPEN_BAG' }],
      engine: 'nlp',
      confidence: 0.95,
      tokensSavedEstimate: 520,
      tokensUsedEstimate: 0,
    };
  }

  // 4. READY TO PAY / PAYMENT CONFIRMATION HANDOFF
  //    ("it should take them to check out and payment if they confirm they are ready to pay")
  const lastNovaMsg = [...ctx.recentMessages].reverse().find((m) => m.role === 'nova');
  const novaJustAskedPayment =
    lastNovaMsg &&
    /\b(ready to pay|proceed to payment|proceed to checkout|would you like to check out)\b/i.test(
      lastNovaMsg.text
    );

  const isAffirmativeConfirmation =
    novaJustAskedPayment &&
    /^(yes|yeah|yep|sure|ok|okay|confirm|confirmed|please do|go ahead|let'?s go|ready|pay now|i am ready)\b/i.test(
      lower
    );

  const isExplicitPaymentIntent =
    /\b(ready\s+to\s+pay|want\s+to\s+pay|let'?s\s+pay|pay\s+now|take\s+me\s+to\s+payment|go\s+to\s+payment|proceed\s+to\s+payment|make\s+payment|confirm\s+(and\s+)?pay|how\s+do\s+i\s+pay|bank\s+details|account\s+number)\b/.test(
      lower
    );

  if (isExplicitPaymentIntent || isAffirmativeConfirmation) {
    return {
      reply:
        Object.keys(inlineDetails).length > 0
          ? "Got your details! Taking you straight to the payment section so you can complete your order."
          : "Awesome — taking you straight to checkout & payment now!",
      actions: [...detailActions, { type: 'GO_TO_PAYMENT' }],
      engine: 'nlp',
      confidence: 0.98,
      tokensSavedEstimate: 680,
      tokensUsedEstimate: 0,
    };
  }

  // 5. CHECKOUT NAVIGATION INTENT
  if (
    /\b(check\s*out|take\s+me\s+to\s+check\s*out|go\s+to\s+check\s*out|proceed\s+to\s+check\s*out|place\s+(my\s+)?order|complete\s+(my\s+)?order|review\s+(my\s+)?order)\b/.test(
      lower
    )
  ) {
    return {
      reply: 'Moving you to checkout now so we can confirm your delivery details and payment.',
      actions: [...detailActions, { type: 'GO_TO_CHECKOUT' }],
      engine: 'nlp',
      confidence: 0.97,
      tokensSavedEstimate: 640,
      tokensUsedEstimate: 0,
    };
  }

  // 6. CLEAR / REMOVE FROM BAG INTENTS
  if (/\b(clear|empty|reset)\s+(my\s+)?(bag|cart|basket|order)\b/.test(lower)) {
    return {
      reply: "I've cleared your shopping bag. Let me know whenever you want to add new items!",
      actions: [{ type: 'CLEAR_BAG' }],
      engine: 'nlp',
      confidence: 0.96,
      tokensSavedEstimate: 500,
      tokensUsedEstimate: 0,
    };
  }

  if (/\b(remove|delete|take\s+out|drop|cancel)\b/.test(lower) && !/\b(account|chat)\b/.test(lower)) {
    const toRemove = matchProductsWithQuantities(text, ctx.products);
    if (toRemove.length > 0) {
      const actions: AIAction[] = toRemove.map((item) => ({
        type: 'REMOVE_FROM_BAG',
        productId: item.product.id,
      }));
      return {
        reply: `Removed ${toRemove.map((i) => i.product.name).join(', ')} from your bag.`,
        actions,
        engine: 'nlp',
        confidence: 0.94,
        tokensSavedEstimate: 560,
        tokensUsedEstimate: 0,
      };
    }
  }

  // 7. LAUNDRY SPECIFIC INTENTS (including item quantities like "wash 3 clothes and iron 2 shirts")
  if (
    /\b(laundry|wash\s*&?\s*fold|ironing|dry\s*clean|duvet|bedsheet)\b/.test(lower) ||
    tokens.some((t) => levenshtein(t, 'laundry') <= 1)
  ) {
    const laundryActions: AIAction[] = [{ type: 'NAVIGATE_SERVICE', service: 'Laundry' }];
    const serviceMatchers: Array<{ id: string; regex: RegExp }> = [
      {
        id: 'wash',
        regex:
          /(?:wash(?:\s*&?\s*fold)?|washing)\s*(\d+)|(\d+)\s*(?:items?|clothes?|shirts?|loads?)?\s*(?:for\s+|to\s+)?(?:wash|washing)/i,
      },
      {
        id: 'iron',
        regex:
          /(?:iron|ironing|press)\s*(\d+)|(\d+)\s*(?:items?|clothes?|shirts?|trousers?)?\s*(?:for\s+|to\s+)?(?:iron|ironing|pressing)/i,
      },
      {
        id: 'dry',
        regex:
          /(?:dry\s*clean(?:ing)?)\s*(\d+)|(\d+)\s*(?:items?|suits?|clothes?)?\s*(?:for\s+|to\s+)?(?:dry\s*clean)/i,
      },
      {
        id: 'bedding',
        regex:
          /(?:duvets?|bedsheets?|beddings?)\s*(\d+)|(\d+)\s*(?:duvets?|bedsheets?|beddings?)/i,
      },
    ];
    const addedNames: string[] = [];
    for (const sm of serviceMatchers) {
      const m = text.match(sm.regex);
      const qty = Number(m?.[1] || m?.[2] || 0);
      if (qty > 0 && qty <= 99) {
        laundryActions.push({ type: 'SET_LAUNDRY_QTY', serviceId: sm.id, quantity: qty });
        const svc = ctx.laundryServices.find((s) => s.id === sm.id);
        if (svc) addedNames.push(`${qty} × ${svc.name}`);
      }
    }

    return {
      reply: addedNames.length
        ? `I've opened Laundry and pre-selected ${addedNames.join(', ')} for you! Review the quantities below and tap Continue.`
        : 'Opening Laundry Pickup! Select the laundry services and item counts you need below.',
      actions: [...detailActions, ...laundryActions],
      engine: 'nlp',
      confidence: 0.94,
      tokensSavedEstimate: 640,
      tokensUsedEstimate: 0,
    };
  }

  // 8. PARCEL PICKUP NAVIGATION & QUICK ADDRESS EXTRACTION
  if (/\b(parcel|package|dispatch|courier|errand|pick\s*up\s+a?\s*(box|item|package|parcel)|deliver\s+a?\s*package)\b/.test(lower)) {
    const fromTo = text.match(/\bfrom\s+(.+?)\s+to\s+([^\.,;!?]+)/i);
    const parcelActions: AIAction[] = [{ type: 'NAVIGATE_SERVICE', service: 'Parcel Pickup' }];
    if (fromTo) {
      parcelActions.push({
        type: 'UPDATE_PARCEL_DETAILS',
        details: {
          pickupAddress: fromTo[1].trim(),
          dropoffAddress: fromTo[2].trim(),
        },
      });
    }
    return {
      reply: fromTo
        ? `I've opened Parcel Pickup and filled in pickup from "${fromTo[1].trim()}" to "${fromTo[2].trim()}". Confirm the details below to continue!`
        : "Opening Parcel Pickup! Enter the pickup and drop-off addresses below and I'll calculate your campus delivery fee.",
      actions: parcelActions,
      engine: 'nlp',
      confidence: 0.94,
      tokensSavedEstimate: 650,
      tokensUsedEstimate: 0,
    };
  }

  const isQuestionAboutProduct =
    /\b(how\s+much|price\s+of|cost|recommend|suggest|what\s+can\s+i\s+get\s+for|budget|under\s+₦?\d+|ingredients|healthy|spicy)\b/.test(
      lower
    );

  const isExplicitNavigationVerb =
    /\b(show(\s+me)?|take\s+me\s+to|go\s+to|open|browse|view|see|switch\s+to|move\s+to|navigate\s+to|section)\b/.test(
      lower
    ) && !/\b(add|buy|order|give\s+me|get\s+me)\b/.test(lower);

  const subcategoryRoutes: Array<{ nodeId: string; pattern: RegExp }> = [
    { nodeId: 'food/fastfood', pattern: /\b(fast\s*food|burgers?|shawarmas?|wraps?|fries)\b/ },
    { nodeId: 'food/snacks', pattern: /\b(snacks?\s*(&|and)\s*pastries|pastries|pastry|food\s+snacks)\b/ },
    { nodeId: 'food/drinks', pattern: /\b(smoothies?\s*(&|and)\s*drinks?|smoothies?|juices?|chilled\s+drinks?)\b/ },
    { nodeId: 'food/dishes', pattern: /\b(ready[\s-]*made|dishes|cooked\s+meals?|lunch|dinner)\b/ },
    { nodeId: 'groceries/beverages', pattern: /\b(beverages?|drinks\s+aisle|water\s+pack)\b/ },
    { nodeId: 'groceries/household', pattern: /\b(household|cleaning|detergent|toiletries|tissues?)\b/ },
    { nodeId: 'groceries/personal', pattern: /\b(personal\s*care|hygiene|toothpaste|body\s*wash)\b/ },
    { nodeId: 'groceries/snacks', pattern: /\b(grocery\s+snacks|plantain\s+chips|biscuits)\b/ },
    { nodeId: 'groceries/foodstuffs', pattern: /\b(foodstuffs?|raw\s+food|provisions|staples)\b/ },
    { nodeId: 'groceries', pattern: /\b(grocer(?:y|ies)|restock|supermarket)\b/ },
    { nodeId: 'food', pattern: /\b(food|hungry|meals?|eat|menu|restaurant)\b/ },
  ];

  // If the user explicitly asked to browse/show/go to a category or subcategory, navigate first!
  if (isExplicitNavigationVerb && !isQuestionAboutProduct) {
    for (const route of subcategoryRoutes) {
      if (route.pattern.test(lower)) {
        const node = BROWSE_NODES[route.nodeId];
        return {
          reply: node.text,
          actions: [{ type: 'NAVIGATE_BROWSE', nodeId: route.nodeId }],
          engine: 'nlp',
          confidence: 0.94,
          tokensSavedEstimate: 590,
          tokensUsedEstimate: 0,
        };
      }
    }
  }

  // 9. PRODUCT ORDERING / ADD TO BAG INTENTS
  //    Matches "I want 2 jollof rice and milk", "add shawarma", "give me bread and eggs", or direct product mention
  if (!isQuestionAboutProduct && !isExplicitNavigationVerb) {
    const matchedProducts = matchProductsWithQuantities(text, ctx.products);
    const hasOrderingVerb =
      /\b(add|want|need|get\s+me|give\s+me|order|buy|bring|pack|plates?\s+of|loaves?\s+of|bottles?\s+of|i'?ll\s+take|can\s+i\s+have)\b/.test(
        lower
      );

    if (matchedProducts.length > 0 && (hasOrderingVerb || tokens.length <= 5)) {
      const actions: AIAction[] = [
        ...detailActions,
        ...matchedProducts.map((m) => ({
          type: 'ADD_TO_BAG' as const,
          productId: m.product.id,
          quantity: m.quantity,
        })),
      ];
      const itemSummary = matchedProducts
        .map((m) => `${m.quantity} × ${m.product.name} (${formatNaira(m.product.price * m.quantity)})`)
        .join(', ');

      return {
        reply: `Added ${itemSummary} to your bag! Are you ready to pay, or would you like to add more items?`,
        actions,
        engine: 'nlp',
        confidence: 0.93,
        tokensSavedEstimate: 720,
        tokensUsedEstimate: 0,
        quickActions: [
          { label: "I'm ready to pay →", actionType: 'GO_TO_PAYMENT' },
          { label: 'Proceed to checkout →', actionType: 'GO_TO_CHECKOUT' },
        ],
      };
    }
  }

  // 10. SUBCATEGORY & CATEGORY NAVIGATION INTENTS (implicit mentions like "groceries" or "hungry")
  if (!isQuestionAboutProduct) {
    for (const route of subcategoryRoutes) {
      if (route.pattern.test(lower)) {
        const node = BROWSE_NODES[route.nodeId];
        return {
          reply: node.text,
          actions: [{ type: 'NAVIGATE_BROWSE', nodeId: route.nodeId }],
          engine: 'nlp',
          confidence: 0.9,
          tokensSavedEstimate: 590,
          tokensUsedEstimate: 0,
        };
      }
    }
  }

  // 11. GREETINGS & CAPABILITY HELP (0 tokens)
  if (/^(hi|hello|hey|good\s+(morning|afternoon|evening)|yo|sup|hey\s+nova|hi\s+nova)[!.,\s]*$/.test(lower)) {
    return {
      reply:
        'Hi there! I’m Nova — I can deliver hot meals, groceries, laundry pickup, or campus parcels. Tell me what you want (or say "Hey Nova"), snap a photo of your list, or pick a category below!',
      actions: [],
      engine: 'nlp',
      confidence: 0.96,
      tokensSavedEstimate: 480,
      tokensUsedEstimate: 0,
      choices: ['food', 'groceries'],
      quickActions: [
        { label: 'Laundry Pickup', actionType: 'NAVIGATE_LAUNDRY' },
        { label: 'Parcel Pickup', actionType: 'NAVIGATE_PARCEL' },
      ],
    };
  }

  // 12. If user only provided delivery details while already in checkout
  if (ctx.checkoutStage !== 'idle' && Object.keys(inlineDetails).length > 0) {
    return {
      reply: "I've updated your delivery details on the checkout card below! Let me know if you're ready to pay.",
      actions: detailActions,
      engine: 'nlp',
      confidence: 0.88,
      tokensSavedEstimate: 540,
      tokensUsedEstimate: 0,
      quickActions: [{ label: "I'm ready to pay →", actionType: 'GO_TO_PAYMENT' }],
    };
  }

  // 13. If user is inside Laundry or Parcel and writes a short specific handling instruction, keep it as a service note
  if (
    (ctx.activeService === 'Laundry' || ctx.activeService === 'Parcel Pickup') &&
    /\b(note|bleach|starch|fragile|careful|gate|call\s+me|knock|room|gentle|stain)\b/.test(lower)
  ) {
    const target = ctx.activeService === 'Laundry' ? 'laundry' : 'parcel';
    return {
      reply: `Noted! I've attached "${text}" to your ${ctx.activeService.toLowerCase()} instructions.`,
      actions: [{ type: 'ADD_SERVICE_NOTE', target, note: text }],
      engine: 'nlp',
      confidence: 0.86,
      tokensSavedEstimate: 510,
      tokensUsedEstimate: 0,
    };
  }

  // Complex, budget-planning, recommendation, or open-ended query -> Escalate to Gemini AI!
  return null;
}
