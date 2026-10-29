import React from 'react';
import { MessageSquarePlus, Settings, Trash2, X } from 'lucide-react';
import { StoredConversation } from '../types/nova';

interface HistoryDrawerProps {
  open: boolean;
  conversations: StoredConversation[];
  activeConversationId: string;
  maxLimit: number;
  storageEnabled: boolean;
  onClose: () => void;
  onSelectConversation: (conv: StoredConversation) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onOpenStorageSettings: () => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  open,
  conversations,
  activeConversationId,
  maxLimit,
  storageEnabled,
  onClose,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onOpenStorageSettings,
}) => {
  if (!open) return null;

  return (
    <div
      className="nova-modal-backdrop drawer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Saved conversations"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="history-drawer">
        <div className="nova-modal-header">
          <div>
            <h2>Saved Chats</h2>
            <p className="modal-subtitle">
              {storageEnabled
                ? `${conversations.length} of ${maxLimit} stored on device (oldest auto-clear)`
                : 'On-device chat storage is paused'}
            </p>
          </div>
          <button type="button" className="round" onClick={onClose} aria-label="Close history">
            <X size={18} />
          </button>
        </div>

        <div className="drawer-top-actions">
          <button
            type="button"
            className="primary"
            onClick={() => {
              onNewConversation();
              onClose();
            }}
          >
            <MessageSquarePlus size={16} /> Start New Conversation
          </button>
          <button
            type="button"
            className="secondary-outline"
            onClick={() => {
              onClose();
              onOpenStorageSettings();
            }}
          >
            <Settings size={15} /> Adjust Limit ({maxLimit})
          </button>
        </div>

        <div className="history-list">
          {!conversations.length ? (
            <p className="empty">No saved conversations on this device yet.</p>
          ) : (
            conversations.map((conv) => {
              const isActive = conv.id === activeConversationId;
              const dateStr = new Date(conv.updatedAt).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });
              return (
                <div
                  key={conv.id}
                  className={'history-item' + (isActive ? ' active' : '')}
                >
                  <button
                    type="button"
                    className="history-select-btn"
                    onClick={() => {
                      onSelectConversation(conv);
                      onClose();
                    }}
                  >
                    <strong>{conv.title}</strong>
                    <small>
                      {conv.messages.length} msgs · {dateStr}
                    </small>
                  </button>
                  <button
                    type="button"
                    className="history-delete-btn"
                    onClick={() => onDeleteConversation(conv.id)}
                    aria-label={`Delete conversation ${conv.title}`}
                    title="Delete chat"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
};
