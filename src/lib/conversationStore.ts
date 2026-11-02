import { DEFAULT_USER_SETTINGS } from '../data/defaultCatalog';
import {
  ChatMessage,
  StoredConversation,
  TokenMetrics,
  UserSettings,
} from '../types/nova';

const CONVERSATIONS_KEY = 'nova.conversations.v2';
const ACTIVE_CONVO_ID_KEY = 'nova.active_conversation_id.v2';
const SETTINGS_KEY = 'nova.user_settings.v2';
const METRICS_KEY = 'nova.token_metrics.v1';

export function loadUserSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_USER_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_USER_SETTINGS,
      ...parsed,
      enableLocalNlp: typeof parsed.enableLocalNlp === 'boolean' ? parsed.enableLocalNlp : true,
      enableGeminiApi: typeof parsed.enableGeminiApi === 'boolean' ? parsed.enableGeminiApi : true,
      maxStoredConversations: Math.min(
        50,
        Math.max(1, Number(parsed.maxStoredConversations) || DEFAULT_USER_SETTINGS.maxStoredConversations)
      ),
      maxMessagesPerConversation: Math.min(
        200,
        Math.max(10, Number(parsed.maxMessagesPerConversation) || DEFAULT_USER_SETTINGS.maxMessagesPerConversation)
      ),
    };
  } catch {
    return { ...DEFAULT_USER_SETTINGS };
  }
}

export function saveUserSettings(settings: UserSettings): { prunedCount: number } {
  const normalized: UserSettings = {
    ...settings,
    maxStoredConversations: Math.min(50, Math.max(1, Math.round(settings.maxStoredConversations))),
    maxMessagesPerConversation: Math.min(200, Math.max(10, Math.round(settings.maxMessagesPerConversation))),
  };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore storage write error
  }

  if (!normalized.storeConversationsOnDevice) {
    return { prunedCount: 0 };
  }

  // Immediately enforce new limits and clear excess old chats
  const existing = loadStoredConversations();
  const { pruned, removedCount } = enforceConversationLimits(
    existing,
    normalized.maxStoredConversations,
    normalized.maxMessagesPerConversation
  );
  if (removedCount > 0 || pruned.length !== existing.length) {
    persistConversationsArray(pruned);
  }
  return { prunedCount: removedCount };
}

export function deriveConversationTitle(messages: ChatMessage[], fallbackService = ''): string {
  const firstUser = messages.find((m) => m.role === 'you' && m.text.trim().length > 0);
  if (firstUser) {
    const clean = firstUser.text.trim().replace(/\s+/g, ' ');
    return clean.length > 38 ? `${clean.slice(0, 38)}…` : clean;
  }
  if (fallbackService) return `${fallbackService} session`;
  return 'New Nova chat';
}

/**
 * Sorts conversations newest-first by updatedAt, trims each conversation's messages
 * to maxMessages, and drops oldest conversations when total exceeds maxConversations.
 */
export function enforceConversationLimits(
  conversations: StoredConversation[],
  maxConversations: number,
  maxMessages: number
): { pruned: StoredConversation[]; removedCount: number } {
  const sorted = [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const removedCount = Math.max(0, sorted.length - maxConversations);
  const kept = sorted.slice(0, maxConversations).map((conv, convIdx) => {
    const trimmedMessages =
      conv.messages.length > maxMessages
        ? conv.messages.slice(conv.messages.length - maxMessages)
        : conv.messages;

    // For older archived chats (beyond the 2 most recent), strip heavy base64 dataUrls to preserve device storage
    const lightweightMessages =
      convIdx >= 2
        ? trimmedMessages.map((msg) =>
            msg.attachments?.length
              ? {
                  ...msg,
                  attachments: msg.attachments.map((att) => ({
                    ...att,
                    dataUrl: undefined,
                  })),
                }
              : msg
          )
        : trimmedMessages;

    return {
      ...conv,
      messages: lightweightMessages,
    };
  });

  return { pruned: kept, removedCount };
}

function persistConversationsArray(conversations: StoredConversation[]): void {
  try {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
  } catch {
    // Quota fallback: strip base64 image dataUrls and retry
    try {
      const stripped = conversations.map((c) => ({
        ...c,
        messages: c.messages.map((m) => ({
          ...m,
          attachments: m.attachments?.map((a) => ({ ...a, dataUrl: undefined })),
        })),
      }));
      localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(stripped));
    } catch {
      // Last resort: keep only the newest 2 conversations
      try {
        localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations.slice(0, 2)));
      } catch {
        // Storage unavailable
      }
    }
  }
}

export function loadStoredConversations(): StoredConversation[] {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.sort(
      (a: StoredConversation, b: StoredConversation) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch {
    return [];
  }
}

export function upsertStoredConversation(
  conversation: StoredConversation,
  settings: UserSettings
): { conversations: StoredConversation[]; prunedCount: number } {
  if (!settings.storeConversationsOnDevice) {
    return { conversations: loadStoredConversations(), prunedCount: 0 };
  }
  if (!conversation.messages.length) {
    return { conversations: loadStoredConversations(), prunedCount: 0 };
  }

  const current = loadStoredConversations().filter((c) => c.id !== conversation.id);
  const updated: StoredConversation = {
    ...conversation,
    title: deriveConversationTitle(conversation.messages, conversation.serviceContext),
    updatedAt: new Date().toISOString(),
  };

  const { pruned, removedCount } = enforceConversationLimits(
    [updated, ...current],
    settings.maxStoredConversations,
    settings.maxMessagesPerConversation
  );

  persistConversationsArray(pruned);
  try {
    localStorage.setItem(ACTIVE_CONVO_ID_KEY, updated.id);
  } catch {
    // Ignore
  }
  return { conversations: pruned, prunedCount: removedCount };
}

export function deleteStoredConversation(id: string): StoredConversation[] {
  const remaining = loadStoredConversations().filter((c) => c.id !== id);
  persistConversationsArray(remaining);
  return remaining;
}

export function clearAllStoredConversations(): void {
  try {
    localStorage.removeItem(CONVERSATIONS_KEY);
    localStorage.removeItem(ACTIVE_CONVO_ID_KEY);
  } catch {
    // Ignore
  }
}

export function getActiveConversationId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_CONVO_ID_KEY);
  } catch {
    return null;
  }
}

export function setActiveConversationId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_CONVO_ID_KEY, id);
  } catch {
    // Ignore
  }
}

export function getConversationStorageSizeKB(): number {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY) || '';
    return Math.round((raw.length * 2) / 1024);
  } catch {
    return 0;
  }
}

export function loadTokenMetrics(): TokenMetrics {
  try {
    const raw = localStorage.getItem(METRICS_KEY);
    if (!raw) {
      return {
        localNlpCount: 0,
        geminiCallCount: 0,
        estimatedTokensSaved: 0,
        estimatedGeminiTokensUsed: 0,
      };
    }
    return JSON.parse(raw);
  } catch {
    return {
      localNlpCount: 0,
      geminiCallCount: 0,
      estimatedTokensSaved: 0,
      estimatedGeminiTokensUsed: 0,
    };
  }
}

export function recordTokenMetric(
  engine: 'nlp' | 'gemini',
  tokensSaved: number,
  tokensUsed: number
): TokenMetrics {
  const current = loadTokenMetrics();
  const next: TokenMetrics = {
    localNlpCount: current.localNlpCount + (engine === 'nlp' ? 1 : 0),
    geminiCallCount: current.geminiCallCount + (engine === 'gemini' ? 1 : 0),
    estimatedTokensSaved: current.estimatedTokensSaved + Math.max(0, tokensSaved),
    estimatedGeminiTokensUsed: current.estimatedGeminiTokensUsed + Math.max(0, tokensUsed),
  };
  try {
    localStorage.setItem(METRICS_KEY, JSON.stringify(next));
  } catch {
    // Ignore
  }
  return next;
}
