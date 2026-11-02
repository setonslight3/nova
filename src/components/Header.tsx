import React from 'react';
import {
  History,
  PackageCheck,
  Settings,
  ShieldCheck,
  ShoppingBag,
} from 'lucide-react';

interface HeaderProps {
  bagCount: number;
  activeOrdersCount: number;
  savedChatsCount: number;
  maxChatsLimit: number;
  isAdminView: boolean;
  onGoHome: () => void;
  onOpenBag: () => void;
  onOpenOrders: () => void;
  onOpenHistory: () => void;
  onOpenSettings: (tab?: 'voice' | 'storage' | 'ai') => void;
  onToggleAdmin: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  bagCount,
  activeOrdersCount,
  savedChatsCount,
  maxChatsLimit,
  isAdminView,
  onGoHome,
  onOpenBag,
  onOpenOrders,
  onOpenHistory,
  onOpenSettings,
  onToggleAdmin,
}) => {
  const [logoOk, setLogoOk] = React.useState(true);

  return (
    <header className="nova-header">
      <div className="nova-header-left">
        <a
          href="#home"
          aria-label="Nova homepage"
          className="nova-brand-link"
          onClick={(e) => {
            e.preventDefault();
            onGoHome();
          }}
        >
          {logoOk ? (
            <img
              src="/logo.png"
              alt="Nova"
              className="nova-logo"
              onError={() => setLogoOk(false)}
            />
          ) : (
            <span className="nova-logo-fallback">NOVA</span>
          )}
        </a>

        {!isAdminView && (
          <button
            type="button"
            className="header-pill history-pill"
            onClick={onOpenHistory}
            title="Saved conversations on this device"
            aria-label="Open saved chats history"
          >
            <History size={16} />
            <span className="pill-label">
              Chats <strong>{savedChatsCount}/{maxChatsLimit}</strong>
            </span>
          </button>
        )}
      </div>

      <div className="nova-header-actions">
        <button
          type="button"
          className="header-icon-btn"
          onClick={onOpenOrders}
          title="My Orders & Tracking"
          aria-label={`Open orders, ${activeOrdersCount} active`}
        >
          <PackageCheck size={19} />
          {activeOrdersCount > 0 && <span className="badge">{activeOrdersCount}</span>}
        </button>

        <button
          type="button"
          className="header-icon-btn"
          onClick={() => onOpenSettings()}
          title="Voice, Storage & AI Settings"
          aria-label="Open settings"
        >
          <Settings size={19} />
        </button>

        <button
          type="button"
          className={'header-pill admin-pill' + (isAdminView ? ' active' : '')}
          onClick={onToggleAdmin}
          title={isAdminView ? 'Return to Customer View' : 'Open Admin Dashboard'}
          aria-label={isAdminView ? 'Return to customer app' : 'Open Admin Dashboard'}
        >
          <ShieldCheck size={16} />
          <span className="pill-label">{isAdminView ? 'Exit' : 'Admin'}</span>
        </button>

        {!isAdminView && (
          <button
            type="button"
            className="bag-button"
            onClick={onOpenBag}
            aria-label={`Open shopping bag, ${bagCount} items`}
          >
            <ShoppingBag size={19} />
            <span className="badge">{bagCount}</span>
          </button>
        )}
      </div>
    </header>
  );
};
