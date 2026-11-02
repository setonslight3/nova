import React from 'react';
import {
  Cpu,
  Database,
  Mic,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { getConversationStorageSizeKB } from '../lib/conversationStore';
import { isSpeechRecognitionSupported, playWakeChime } from '../lib/voiceEngine';
import { TokenMetrics, UserSettings } from '../types/nova';

interface SettingsModalProps {
  open: boolean;
  initialTab?: 'voice' | 'storage' | 'ai';
  settings: UserSettings;
  savedChatsCount: number;
  tokenMetrics: TokenMetrics;
  onUpdateSettings: (next: UserSettings) => void;
  onClearAllConversations: () => void;
  onClose: () => void;
  onGoToAdmin?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  initialTab = 'voice',
  settings,
  savedChatsCount,
  tokenMetrics,
  onUpdateSettings,
  onClearAllConversations,
  onClose,
  onGoToAdmin,
}) => {
  const [tab, setTab] = React.useState<'voice' | 'storage' | 'ai'>(initialTab);
  const [confirmClear, setConfirmClear] = React.useState(false);

  React.useEffect(() => {
    if (open && initialTab) {
      setTab(initialTab);
      setConfirmClear(false);
    }
  }, [open, initialTab]);

  if (!open) return null;

  const speechSupported = isSpeechRecognitionSupported();
  const storageKB = getConversationStorageSizeKB();
  const totalQueries = tokenMetrics.localNlpCount + tokenMetrics.geminiCallCount;
  const nlpRatio =
    totalQueries > 0 ? Math.round((tokenMetrics.localNlpCount / totalQueries) * 100) : 100;

  const patch = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    onUpdateSettings({ ...settings, [key]: value });
  };

  return (
    <div
      className="nova-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Nova Settings"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="nova-modal settings-modal">
        <div className="nova-modal-header">
          <div>
            <h2>Nova Settings</h2>
            <p className="modal-subtitle">
              Wake word, voice commands, chat storage limits & hybrid AI
            </p>
          </div>
          <button type="button" className="round" onClick={onClose} aria-label="Close settings">
            <X size={18} />
          </button>
        </div>

        <div className="settings-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'voice'}
            className={'settings-tab' + (tab === 'voice' ? ' active' : '')}
            onClick={() => setTab('voice')}
          >
            <Mic size={15} /> Voice & Wake Word
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'storage'}
            className={'settings-tab' + (tab === 'storage' ? ' active' : '')}
            onClick={() => setTab('storage')}
          >
            <Database size={15} /> Chat Storage
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'ai'}
            className={'settings-tab' + (tab === 'ai' ? ' active' : '')}
            onClick={() => setTab('ai')}
          >
            <Cpu size={15} /> Hybrid AI & Tokens
          </button>
        </div>

        <div className="nova-modal-body settings-body">
          {tab === 'voice' && (
            <div className="settings-section">
              {!speechSupported && (
                <div className="settings-alert-box">
                  Browser SpeechRecognition API was not detected. Use Google Chrome or Microsoft
                  Edge for continuous "Hey Nova" wake-word listening.
                </div>
              )}

              <div className="setting-toggle-row">
                <div>
                  <strong>Enable Voice Commands</strong>
                  <p>Allow microphone dictation and voice ordering in the chat bar.</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.voiceEnabled}
                  onChange={(e) => patch('voiceEnabled', e.target.checked)}
                />
              </div>

              <div className="setting-toggle-row highlight-row">
                <div>
                  <strong>Wake Word Standby ("Hey Nova" / "Hi Nova")</strong>
                  <p>
                    Nova listens quietly in the background and wakes automatically when you say
                    your wake phrase.
                  </p>
                </div>
                <input
                  type="checkbox"
                  disabled={!settings.voiceEnabled || !speechSupported}
                  checked={settings.wakeWordEnabled}
                  onChange={(e) => patch('wakeWordEnabled', e.target.checked)}
                />
              </div>

              <div className="setting-group-card">
                <span className="setting-group-label">Active Wake Phrases</span>
                <div className="wake-phrases-checks">
                  <label className="wake-check">
                    <input
                      type="checkbox"
                      checked={settings.allowHeyNova}
                      onChange={(e) => patch('allowHeyNova', e.target.checked)}
                    />
                    <span>"Hey Nova"</span>
                  </label>
                  <label className="wake-check">
                    <input
                      type="checkbox"
                      checked={settings.allowHiNova}
                      onChange={(e) => patch('allowHiNova', e.target.checked)}
                    />
                    <span>"Hi Nova"</span>
                  </label>
                </div>

                <label className="setting-input-label">
                  Optional extra wake phrase
                  <input
                    type="text"
                    placeholder='e.g. "Okay Nova"'
                    value={settings.customWakePhrase}
                    onChange={(e) => patch('customWakePhrase', e.target.value)}
                  />
                </label>
              </div>

              <div className="setting-toggle-row">
                <div>
                  <strong>Wake Sound Chime</strong>
                  <p>Play a soft tone when Nova wakes up to listen.</p>
                </div>
                <div className="inline-control-pair">
                  <button
                    type="button"
                    className="mini-btn"
                    onClick={() => playWakeChime()}
                  >
                    <Volume2 size={13} /> Test
                  </button>
                  <input
                    type="checkbox"
                    checked={settings.wakeChimeEnabled}
                    onChange={(e) => patch('wakeChimeEnabled', e.target.checked)}
                  />
                </div>
              </div>

              <div className="setting-toggle-row">
                <div>
                  <strong>Spoken Voice Replies (TTS)</strong>
                  <p>Have Nova read concise replies out loud.</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.voiceReplyTts}
                  onChange={(e) => patch('voiceReplyTts', e.target.checked)}
                />
              </div>

              <label className="setting-input-label">
                Voice Recognition Language & Accent
                <select
                  value={settings.voiceLanguage}
                  onChange={(e) =>
                    patch('voiceLanguage', e.target.value as UserSettings['voiceLanguage'])
                  }
                >
                  <option value="en-NG">English (Nigeria — en-NG)</option>
                  <option value="en-GB">English (UK — en-GB)</option>
                  <option value="en-US">English (US — en-US)</option>
                </select>
              </label>
            </div>
          )}

          {tab === 'storage' && (
            <div className="settings-section">
              <div className="storage-meter-card">
                <div>
                  <span className="meter-eyebrow">On-Device Conversation Storage</span>
                  <h3>
                    {savedChatsCount} / {settings.maxStoredConversations} conversations stored
                  </h3>
                  <small>Approx. {storageKB} KB saved in local device storage</small>
                </div>
                <div className="meter-bar-track">
                  <div
                    className="meter-bar-fill"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round((savedChatsCount / settings.maxStoredConversations) * 100)
                      )}%`,
                    }}
                  />
                </div>
              </div>

              <div className="setting-toggle-row">
                <div>
                  <strong>Save Conversations on This Device</strong>
                  <p>Keep chat threads locally so you can pick up orders where you left off.</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.storeConversationsOnDevice}
                  onChange={(e) => patch('storeConversationsOnDevice', e.target.checked)}
                />
              </div>

              <div className="setting-slider-block">
                <div className="slider-header">
                  <strong>Maximum Stored Conversations Limit</strong>
                  <span className="slider-badge">{settings.maxStoredConversations} chats</span>
                </div>
                <p>
                  When saved chats exceed this limit, Nova automatically clears the oldest
                  conversations first.
                </p>
                <div className="slider-input-row">
                  <input
                    type="range"
                    min={1}
                    max={50}
                    value={settings.maxStoredConversations}
                    onChange={(e) =>
                      patch('maxStoredConversations', Number(e.target.value))
                    }
                  />
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={settings.maxStoredConversations}
                    onChange={(e) =>
                      patch(
                        'maxStoredConversations',
                        Math.min(50, Math.max(1, Number(e.target.value) || 1))
                      )
                    }
                  />
                </div>
              </div>

              <div className="setting-slider-block">
                <div className="slider-header">
                  <strong>Max Messages per Conversation</strong>
                  <span className="slider-badge">
                    {settings.maxMessagesPerConversation} msgs
                  </span>
                </div>
                <p>Trims very old turns inside long threads to keep the app fast and light.</p>
                <div className="slider-input-row">
                  <input
                    type="range"
                    min={10}
                    max={200}
                    step={5}
                    value={settings.maxMessagesPerConversation}
                    onChange={(e) =>
                      patch('maxMessagesPerConversation', Number(e.target.value))
                    }
                  />
                  <input
                    type="number"
                    min={10}
                    max={200}
                    value={settings.maxMessagesPerConversation}
                    onChange={(e) =>
                      patch(
                        'maxMessagesPerConversation',
                        Math.min(200, Math.max(10, Number(e.target.value) || 20))
                      )
                    }
                  />
                </div>
              </div>

              <div className="danger-zone-box">
                {!confirmClear ? (
                  <button
                    type="button"
                    className="danger-outline-btn"
                    onClick={() => setConfirmClear(true)}
                  >
                    <Trash2 size={15} /> Clear All Saved Chats Now
                  </button>
                ) : (
                  <div className="confirm-clear-inline">
                    <span>Clear all {savedChatsCount} saved chats from this device?</span>
                    <button
                      type="button"
                      className="danger-solid-btn"
                      onClick={() => {
                        onClearAllConversations();
                        setConfirmClear(false);
                      }}
                    >
                      Yes, Clear All
                    </button>
                    <button
                      type="button"
                      className="mini-btn"
                      onClick={() => setConfirmClear(false)}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'ai' && (
            <div className="settings-section">
              <div className="token-telemetry-card">
                <div className="telemetry-title">
                  <Sparkles size={16} />
                  <strong>AI Engine & Testing Controls</strong>
                </div>
                <div className="telemetry-stats">
                  <div>
                    <span>Local NLP</span>
                    <strong>{settings.enableLocalNlp !== false ? 'Enabled' : 'Disabled'}</strong>
                  </div>
                  <div>
                    <span>Google Gemini API</span>
                    <strong>{settings.enableGeminiApi !== false ? 'Enabled' : 'Disabled'}</strong>
                  </div>
                  <div>
                    <span>Active Test Mode</span>
                    <strong>
                      {!settings.enableLocalNlp && settings.enableGeminiApi
                        ? 'Pure API Only'
                        : settings.enableLocalNlp && !settings.enableGeminiApi
                        ? 'Pure NLP Only'
                        : settings.enableLocalNlp && settings.enableGeminiApi
                        ? 'Hybrid Smart'
                        : 'Both Paused'}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="setting-toggle-row">
                <div>
                  <strong>Enable Local NLP Engine</strong>
                  <p>
                    On-device natural language rule matching. Turn this OFF if you want to test
                    pure Google Gemini API replies directly without local NLP intervention.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.enableLocalNlp !== false}
                  onChange={(e) => patch('enableLocalNlp', e.target.checked)}
                />
              </div>

              <div className="setting-toggle-row">
                <div>
                  <strong>Enable Gemini AI (Google API)</strong>
                  <p>
                    Connects to Gemini 2.5 Flash for complex queries, open-ended answers, and
                    receipt photos. Turn this OFF to test only on-device NLP.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.enableGeminiApi !== false}
                  onChange={(e) => patch('enableGeminiApi', e.target.checked)}
                />
              </div>

              <label className="setting-input-label">
                Optional Local Testing Gemini API Key
                <input
                  type="password"
                  placeholder="AIzaSy... (Leave blank in production — Vercel uses GEMINI_API_KEY)"
                  value={settings.devGeminiApiKey}
                  onChange={(e) => patch('devGeminiApiKey', e.target.value)}
                />
                <small>
                  When Local NLP is turned off, Nova uses this key for pure direct API calls
                  during local testing without a live backend.
                </small>
              </label>

              {onGoToAdmin && (
                <div className="setting-group-card admin-jump-card">
                  <div className="setting-jump-row">
                    <div>
                      <strong>Operator & Admin Portal</strong>
                      <p>Access the dedicated orders dashboard, pricing editor, and receipt verifier.</p>
                    </div>
                    <button
                      type="button"
                      className="admin-link-btn"
                      onClick={() => {
                        onClose();
                        onGoToAdmin();
                      }}
                    >
                      Go to Admin Login →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
