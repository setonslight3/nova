import React from 'react';
import {
  ArrowUp,
  Camera,
  FileText,
  Mic,
  Paperclip,
  Shirt,
  ShoppingBag,
  Sparkles,
  Truck,
  UtensilsCrossed,
  Volume2,
  X,
} from 'lucide-react';
import { AdminDashboard } from './components/AdminDashboard';
import { BagModal } from './components/BagModal';
import { CameraModal } from './components/CameraModal';
import { CheckoutFlow } from './components/CheckoutFlow';
import { Header } from './components/Header';
import { HistoryDrawer } from './components/HistoryDrawer';
import { LaundryFlow } from './components/LaundryFlow';
import { OrdersModal } from './components/OrdersModal';
import { ParcelFlow } from './components/ParcelFlow';
import { ProductCard } from './components/ProductCard';
import { SettingsModal } from './components/SettingsModal';
import {
  BROWSE_NODES,
  DEFAULT_CAMPUS_ZONES,
  DEFAULT_LAUNDRY_SERVICES,
  DEFAULT_PAYMENT_CONFIG,
  DEFAULT_PRODUCTS,
  formatNaira,
  isValidNigerianPhone,
} from './data/defaultCatalog';
import {
  clearAllStoredConversations,
  deleteStoredConversation,
  getActiveConversationId,
  loadStoredConversations,
  loadTokenMetrics,
  loadUserSettings,
  recordTokenMetric,
  saveUserSettings,
  setActiveConversationId,
  upsertStoredConversation,
} from './lib/conversationStore';
import {
  ACCEPT_ATTRIBUTE,
  formatFileSize,
  MAX_ATTACHMENTS_PER_MESSAGE,
  validateAndProcessFile,
} from './lib/fileValidator';
import { resolveUserTurn } from './lib/geminiClient';
import {
  createNovaOrder,
  fetchCampusZones,
  fetchLaundryServices,
  fetchOrders,
  fetchPaymentConfig,
  fetchProductsCatalog,
  saveCampusZones,
  saveLaundryServices,
  savePaymentConfig,
  saveProductsCatalog,
  subscribeToNovaRealtime,
  updateNovaOrder,
} from './lib/supabase';
import { NovaVoiceController, VoiceModeState } from './lib/voiceEngine';
import {
  AIAction,
  CampusZone,
  ChatAttachment,
  ChatMessage,
  CheckoutStage,
  DeliveryDetails,
  LaundryServiceItem,
  LaundryState,
  NovaOrder,
  OrderStatus,
  ParcelState,
  PaymentMethod,
  PlatformPaymentConfig,
  Product,
  ScreenSection,
  ServiceType,
  StoredConversation,
  TokenMetrics,
  UserSettings,
} from './types/nova';

const EXAMPLES = [
  'Say "Hey Nova" or type: Add 2 jollof rice and milk...',
  'Can you pick up a parcel from Hostel A to Admin Block?',
  'Snap a photo of my handwritten grocery list...',
  'I am ready to pay — take me to payment!',
];

const DELIVERY_LOCAL_KEY = 'nova.delivery.v1';

function createFreshConversationId(): string {
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function App() {
  // Catalog & Platform State
  const [products, setProducts] = React.useState<Product[]>(DEFAULT_PRODUCTS);
  const [laundryServices, setLaundryServices] =
    React.useState<LaundryServiceItem[]>(DEFAULT_LAUNDRY_SERVICES);
  const [campusZones, setCampusZones] = React.useState<CampusZone[]>(DEFAULT_CAMPUS_ZONES);
  const [paymentConfig, setPaymentConfig] =
    React.useState<PlatformPaymentConfig>(DEFAULT_PAYMENT_CONFIG);
  const [orders, setOrders] = React.useState<NovaOrder[]>([]);

  // Settings & Stored Conversations State
  const [settings, setSettings] = React.useState<UserSettings>(() => loadUserSettings());
  const [tokenMetrics, setTokenMetrics] = React.useState<TokenMetrics>(() => loadTokenMetrics());
  const [storedConversations, setStoredConversations] = React.useState<StoredConversation[]>(() =>
    loadStoredConversations()
  );
  const [conversationId, setConversationId] = React.useState<string>(() => {
    const activeId = getActiveConversationId();
    const list = loadStoredConversations();
    if (activeId && list.some((c) => c.id === activeId)) return activeId;
    return createFreshConversationId();
  });

  // Active Chat & Navigation State
  const [messages, setMessages] = React.useState<ChatMessage[]>(() => {
    const activeId = getActiveConversationId();
    const list = loadStoredConversations();
    const found = activeId ? list.find((c) => c.id === activeId) : undefined;
    return found ? found.messages : [];
  });
  const [screen, setScreen] = React.useState<ScreenSection>(() => {
    const activeId = getActiveConversationId();
    const list = loadStoredConversations();
    const found = activeId ? list.find((c) => c.id === activeId) : undefined;
    return found && found.messages.length > 0 ? 'category' : 'home';
  });
  const [activeService, setActiveService] = React.useState<string>('');
  const [activeBrowseNode, setActiveBrowseNode] = React.useState<string>('');

  // Composer & Attachment State
  const [input, setInput] = React.useState('');
  const [pendingAttachments, setPendingAttachments] = React.useState<ChatAttachment[]>([]);
  const [typing, setTyping] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [exampleIdx, setExampleIdx] = React.useState(0);
  const [placeholderFade, setPlaceholderFade] = React.useState(false);
  const [toast, setToast] = React.useState('');

  // Bag & Checkout State
  const [bag, setBag] = React.useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem('nova.bag.v2');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [checkoutStage, setCheckoutStage] = React.useState<CheckoutStage>('idle');
  const [checkoutProof, setCheckoutProof] = React.useState<ChatAttachment | null>(null);
  const [shoppingPrompt, setShoppingPrompt] = React.useState(false);
  const [rememberDetails, setRememberDetails] = React.useState(false);
  const [deliveryDetails, setDeliveryDetails] = React.useState<DeliveryDetails>({
    university: '',
    campusAddress: '',
    phone: '',
    timing: 'ASAP',
    time: '',
  });

  // Laundry & Parcel Service Flows
  const [laundryActive, setLaundryActive] = React.useState(false);
  const [laundryData, setLaundryData] = React.useState<LaundryState>({
    step: 1,
    furthestStep: 1,
    quantities: {},
    pickup: { university: '', campusAddress: '', phone: '', timing: 'ASAP', time: '' },
    notes: [],
    paymentMethod: 'bank_transfer',
    proof: null,
    submittedOrderId: null,
  });

  const [parcelData, setParcelData] = React.useState<ParcelState>({
    step: 1,
    furthestStep: 1,
    university: DEFAULT_CAMPUS_ZONES[0].name,
    itemDescription: '',
    pickupAddress: '',
    dropoffAddress: '',
    pickupPhone: '',
    dropoffPhone: '',
    timing: 'ASAP',
    time: '',
    notes: [],
    itemPhoto: null,
    paymentMethod: 'bank_transfer',
    proof: null,
    submittedOrderId: null,
  });

  // Modals & Drawers
  const [bagOpen, setBagOpen] = React.useState(false);
  const [ordersOpen, setOrdersOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [settingsTab, setSettingsTab] = React.useState<'voice' | 'storage' | 'ai'>('voice');
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const [cameraTarget, setCameraTarget] = React.useState<
    'chat' | 'checkout_proof' | 'laundry_proof' | 'parcel_item' | 'parcel_proof'
  >('chat');

  // Voice & Wake Word State
  const [voiceState, setVoiceState] = React.useState<VoiceModeState>('off');
  const [interimVoiceText, setInterimVoiceText] = React.useState('');

  // Refs
  const endRef = React.useRef<HTMLDivElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const checkoutRef = React.useRef<HTMLDivElement | null>(null);
  const laundryRef = React.useRef<HTMLDivElement | null>(null);
  const toastTimerRef = React.useRef<number | null>(null);
  const msgSeqRef = React.useRef(Date.now());
  const previousBagRef = React.useRef<Record<string, number>>(bag);
  const suppressBagEchoRef = React.useRef(false);
  const voiceControllerRef = React.useRef<NovaVoiceController | null>(null);
  const voiceSubmitRef = React.useRef<(cmd: string, fromWake: boolean) => void>(() => {});

  const isAdminView = screen === 'admin';
  const chatting = !isAdminView && messages.length > 0 && screen !== 'home';

  const bagLines = products.filter((p) => (bag[p.id] || 0) > 0);
  const bagCount = Object.values(bag).reduce((a, b) => a + b, 0);
  const activeOrdersCount = orders.filter(
    (o) => !['delivered', 'cancelled'].includes(o.status)
  ).length;

  const flashToast = React.useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(''), 4200);
  }, []);

  // Dedicated Admin routing via URL hash #admin
  React.useEffect(() => {
    const handleHash = () => {
      if (window.location.hash === '#admin') {
        setScreen('admin');
      } else if (window.location.hash === '#home' && screen === 'admin') {
        setScreen(messages.length ? 'category' : 'home');
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, [messages.length, screen]);

  // Load initial catalog, zones, payment config & orders (from Supabase or LocalStorage)
  React.useEffect(() => {
    Promise.all([
      fetchProductsCatalog(),
      fetchLaundryServices(),
      fetchCampusZones(),
      fetchPaymentConfig(),
      fetchOrders(),
    ]).then(([prods, laundry, zones, payCfg, ords]) => {
      setProducts(prods);
      setLaundryServices(laundry);
      setCampusZones(zones);
      setPaymentConfig(payCfg);
      setOrders(ords);
    });

    const unsubscribeRealtime = subscribeToNovaRealtime({
      onOrdersChange: () => {
        fetchOrders().then(setOrders);
      },
      onCatalogChange: () => {
        fetchProductsCatalog().then(setProducts);
      },
      onSettingsChange: () => {
        fetchPaymentConfig().then(setPaymentConfig);
      },
    });

    try {
      const saved = JSON.parse(localStorage.getItem(DELIVERY_LOCAL_KEY) || 'null');
      if (saved && typeof saved.university === 'string') {
        const remembered = {
          university: saved.university || '',
          campusAddress: saved.campusAddress || '',
          phone: saved.phone || '',
        };
        setDeliveryDetails((d) => ({ ...d, ...remembered }));
        setLaundryData((l) => ({ ...l, pickup: { ...l.pickup, ...remembered } }));
        setRememberDetails(true);
      }
    } catch {
      // Ignore
    }

    return () => {
      unsubscribeRealtime();
    };
  }, []);

  // Persist bag locally
  React.useEffect(() => {
    try {
      localStorage.setItem('nova.bag.v2', JSON.stringify(bag));
    } catch {
      // Ignore
    }
    if (bagCount === 0 && checkoutStage !== 'idle') {
      setCheckoutStage('idle');
    }
  }, [bag, bagCount, checkoutStage]);

  // Persist remembered delivery details
  React.useEffect(() => {
    if (!rememberDetails) return;
    try {
      localStorage.setItem(
        DELIVERY_LOCAL_KEY,
        JSON.stringify({
          university: deliveryDetails.university,
          campusAddress: deliveryDetails.campusAddress,
          phone: deliveryDetails.phone,
        })
      );
    } catch {
      // Ignore
    }
  }, [
    rememberDetails,
    deliveryDetails.university,
    deliveryDetails.campusAddress,
    deliveryDetails.phone,
  ]);

  // Persist active conversation on device with configured limits & auto-pruning of oldest chats!
  React.useEffect(() => {
    if (!messages.length || !settings.storeConversationsOnDevice) return;
    const conv: StoredConversation = {
      id: conversationId,
      title: '',
      createdAt: messages[0]?.timestamp || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      serviceContext: activeService,
      messages,
    };
    const { conversations, prunedCount } = upsertStoredConversation(conv, settings);
    setStoredConversations(conversations);
    if (prunedCount > 0) {
      flashToast(
        `Chat limit (${settings.maxStoredConversations}) reached — cleared ${prunedCount} oldest chat${
          prunedCount > 1 ? 's' : ''
        }.`
      );
    }
  }, [messages, conversationId, activeService, settings, flashToast]);

  // Homepage cycling example placeholder
  React.useEffect(() => {
    if (focused || input || chatting) return;
    let fadeTimer: number;
    const interval = window.setInterval(() => {
      setPlaceholderFade(true);
      fadeTimer = window.setTimeout(() => {
        setExampleIdx((x) => (x + 1) % EXAMPLES.length);
        setPlaceholderFade(false);
      }, 180);
    }, 4000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(fadeTimer);
      setPlaceholderFade(false);
    };
  }, [focused, input, chatting]);

  // Mobile VisualViewport keyboard binding (from preview's tested viewport shell)
  React.useEffect(() => {
    if (!chatting) return;
    const shell = document.querySelector('.nova-app.chat-mode') as HTMLElement | null;
    if (!shell) return;
    const vp = window.visualViewport;
    const measure = () => {
      shell.style.setProperty(
        '--chat-viewport-height',
        `${Math.round(vp?.height || window.innerHeight)}px`
      );
      shell.style.setProperty('--chat-viewport-top', `${Math.round(vp?.offsetTop || 0)}px`);
    };
    measure();
    vp?.addEventListener('resize', measure);
    vp?.addEventListener('scroll', measure);
    window.addEventListener('resize', measure);
    return () => {
      vp?.removeEventListener('resize', measure);
      vp?.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      shell.style.removeProperty('--chat-viewport-height');
      shell.style.removeProperty('--chat-viewport-top');
    };
  }, [chatting]);

  // Auto-grow composer textarea in chat mode
  React.useEffect(() => {
    if (!chatting || !textareaRef.current) return;
    textareaRef.current.style.height = '38px';
    textareaRef.current.style.height = `${Math.min(144, textareaRef.current.scrollHeight)}px`;
  }, [input, chatting]);

  // Smooth scroll on new messages / active flow changes
  React.useEffect(() => {
    if (isAdminView) return;
    const activeEl = checkoutRef.current || laundryRef.current;
    if (activeEl && activeEl.contains(document.activeElement)) return;
    const target = activeEl || endRef.current;
    const frame = requestAnimationFrame(() => {
      target?.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        block: activeEl ? 'nearest' : 'end',
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, typing, checkoutStage, laundryActive, screen, isAdminView]);

  // Observe manual bag button clicks on product cards to show conversational confirmation
  React.useEffect(() => {
    const before = previousBagRef.current;
    previousBagRef.current = bag;
    if (suppressBagEchoRef.current) {
      suppressBagEchoRef.current = false;
      return;
    }
    const added = products.filter((p) => (bag[p.id] || 0) > (before[p.id] || 0));
    if (!added.length) return;
    const product = added[added.length - 1];
    const qty = bag[product.id];
    setShoppingPrompt(false);

    const confMsg: ChatMessage = {
      id: `bag-conf-${++msgSeqRef.current}`,
      role: 'nova',
      text: `I've added ${qty} × ${product.name} to your bag! ✓`,
      timestamp: new Date().toISOString(),
      confirmation: true,
      sourceEngine: 'system',
    };

    setMessages((curr) =>
      curr[curr.length - 1]?.confirmation
        ? [...curr.slice(0, -1), { ...confMsg, id: curr[curr.length - 1].id }]
        : [...curr, confMsg]
    );
  }, [bag, products]);

  const appendMessage = React.useCallback(
    (role: 'nova' | 'you', text: string, extra: Partial<ChatMessage> = {}) => {
      const msg: ChatMessage = {
        id: `msg-${++msgSeqRef.current}`,
        role,
        text,
        timestamp: new Date().toISOString(),
        ...extra,
      };
      setMessages((curr) => [...curr, msg]);
      return msg;
    },
    []
  );

  const changeBagQty = React.useCallback(
    (id: string, delta: number, e?: React.MouseEvent, silent = false) => {
      if (e && e.detail > 1) return;
      if (silent) suppressBagEchoRef.current = true;
      setBag((curr) => {
        const nextQty = Math.max(0, (curr[id] || 0) + delta);
        const next = { ...curr, [id]: nextQty };
        if (!nextQty) delete next[id];
        return next;
      });
    },
    []
  );

  const selectBrowseNode = React.useCallback(
    (nodeId: string, withUserBubble = true) => {
      const node = BROWSE_NODES[nodeId];
      if (!node) return;
      setActiveBrowseNode(nodeId);
      setLaundryActive(false);
      setCheckoutStage('idle');
      setShoppingPrompt(false);
      setActiveService(node.root);
      setScreen('category');

      if (withUserBubble) {
        appendMessage('you', node.label);
      }

      const matchingProducts = node.subcategory
        ? products
            .filter((p) => p.category === node.root && p.subcategory === node.subcategory)
            .map((p) => p.id)
        : [];

      appendMessage('nova', node.text, {
        choices: node.children || [],
        productIds: matchingProducts,
        nodeId,
        sourceEngine: 'system',
      });
    },
    [appendMessage, products]
  );

  const startServiceFlow = React.useCallback(
    (serviceName: ServiceType, withUserBubble = true, targetStep?: 1 | 2 | 3) => {
      if (serviceName === 'Food' || serviceName === 'Groceries') {
        selectBrowseNode(serviceName.toLowerCase(), withUserBubble);
        return;
      }
      setCheckoutStage('idle');
      setShoppingPrompt(false);
      setActiveService(serviceName);
      setScreen('category');

      if (serviceName === 'Laundry') {
        setLaundryActive(true);
        if (targetStep) {
          setLaundryData((l) => ({
            ...l,
            step: targetStep,
            furthestStep: Math.max(l.furthestStep, targetStep) as 1 | 2 | 3,
          }));
        }
        if (withUserBubble) appendMessage('you', 'Laundry');
      } else if (serviceName === 'Parcel Pickup') {
        setLaundryActive(false);
        if (targetStep) {
          setParcelData((p) => ({
            ...p,
            step: targetStep,
            furthestStep: Math.max(p.furthestStep, targetStep) as 1 | 2 | 3,
          }));
        }
        if (withUserBubble) appendMessage('you', 'Parcel Pickup');
      }
    },
    [appendMessage, selectBrowseNode]
  );

  const isDeliveryDetailsComplete = React.useCallback(
    (d: DeliveryDetails) => {
      const validUni = campusZones.some((z) => z.active && z.name === d.university);
      const validAddr = Boolean(d.campusAddress.trim());
      const validPhone = isValidNigerianPhone(d.phone);
      const validTime =
        d.timing !== 'Scheduled' || Boolean(d.time && new Date(d.time) > new Date());
      return validUni && validAddr && validPhone && validTime;
    },
    [campusZones]
  );

  const goToCheckout = React.useCallback(() => {
    if (bagCount === 0) {
      // Check if user actually has active Laundry or Parcel items
      const laundryCount = Object.values(laundryData.quantities).reduce((a, b) => a + b, 0);
      if (laundryActive || laundryCount > 0) {
        setScreen('category');
        setActiveService('Laundry');
        setLaundryActive(true);
        setLaundryData((l) => ({ ...l, step: 2, furthestStep: Math.max(l.furthestStep, 2) as 1 | 2 | 3 }));
        return;
      }
      flashToast('Your bag is empty — add an item first!');
      return;
    }
    setBagOpen(false);
    setScreen('category');
    if (!activeService || activeService === 'Laundry' || activeService === 'Parcel Pickup') {
      setActiveService('Food');
    }
    setLaundryActive(false);
    setShoppingPrompt(false);
    setCheckoutStage((curr) => (curr === 'idle' ? 'delivery' : curr));
  }, [bagCount, laundryData.quantities, laundryActive, activeService, flashToast]);

  /**
   * Direct Ready-to-Pay Jump ("it should take them to check out and payment if they confirm they are ready to pay")
   */
  const goStraightToPayment = React.useCallback(
    (overrideDetails?: Partial<DeliveryDetails>) => {
      setBagOpen(false);
      const mergedDetails = { ...deliveryDetails, ...(overrideDetails || {}) };

      // 1. If user is currently in Laundry (or bag is empty & laundry has items)
      const laundryItemCount = Object.values(laundryData.quantities).reduce((a, b) => a + b, 0);
      if ((laundryActive || bagCount === 0) && laundryItemCount > 0) {
        setScreen('category');
        setActiveService('Laundry');
        setLaundryActive(true);
        const mergedPickup = { ...laundryData.pickup, ...(overrideDetails || {}) };
        const pickupReady = isDeliveryDetailsComplete(mergedPickup);
        setLaundryData((l) => ({
          ...l,
          pickup: mergedPickup,
          step: pickupReady ? 3 : 2,
          furthestStep: Math.max(l.furthestStep, pickupReady ? 3 : 2) as 1 | 2 | 3,
        }));
        if (!pickupReady) {
          flashToast('Confirm your campus pickup address & phone to view final payment.');
        }
        return;
      }

      // 2. If user is in Parcel Pickup and bag is empty
      if (activeService === 'Parcel Pickup' && bagCount === 0) {
        setScreen('category');
        setLaundryActive(false);
        const addrOk = Boolean(
          parcelData.pickupAddress.trim() &&
            parcelData.dropoffAddress.trim() &&
            parcelData.itemDescription.trim()
        );
        const phoneOk =
          isValidNigerianPhone(parcelData.pickupPhone) &&
          isValidNigerianPhone(parcelData.dropoffPhone);
        const nextStep: 1 | 2 | 3 = !addrOk ? 1 : !phoneOk ? 2 : 3;
        setParcelData((p) => ({
          ...p,
          step: nextStep,
          furthestStep: Math.max(p.furthestStep, nextStep) as 1 | 2 | 3,
        }));
        return;
      }

      // 3. Food / Groceries Bag Payment Handoff
      if (bagCount === 0) {
        flashToast('Add items to your bag first before proceeding to payment.');
        return;
      }

      setScreen('category');
      if (!activeService || activeService === 'Laundry' || activeService === 'Parcel Pickup') {
        setActiveService('Food');
      }
      setLaundryActive(false);
      setShoppingPrompt(false);

      if (isDeliveryDetailsComplete(mergedDetails)) {
        setCheckoutStage('payment');
      } else {
        setCheckoutStage('delivery');
        flashToast('Enter your campus address & phone below, then tap "Skip to Payment →".');
      }
    },
    [
      deliveryDetails,
      laundryData,
      laundryActive,
      bagCount,
      activeService,
      parcelData,
      isDeliveryDetailsComplete,
      flashToast,
    ]
  );

  const startNewConversation = React.useCallback(() => {
    const newId = createFreshConversationId();
    setConversationId(newId);
    setActiveConversationId(newId);
    setMessages([]);
    setScreen('home');
    setActiveService('');
    setActiveBrowseNode('');
    setLaundryActive(false);
    setCheckoutStage('idle');
    setPendingAttachments([]);
  }, []);

  /**
   * Executes structured AI actions returned by either Local NLP or Gemini AI.
   */
  const executeAiActions = React.useCallback(
    (actions: AIAction[], turnAttachments: ChatAttachment[] = []) => {
      let updatedDetailsPatch: Partial<DeliveryDetails> | undefined;

      for (const action of actions) {
        switch (action.type) {
          case 'NAVIGATE_HOME':
            setScreen('home');
            setCheckoutStage('idle');
            setLaundryActive(false);
            break;

          case 'NAVIGATE_BROWSE': {
            const node = BROWSE_NODES[action.nodeId];
            if (node) {
              setActiveBrowseNode(action.nodeId);
              setLaundryActive(false);
              setCheckoutStage('idle');
              setActiveService(node.root);
              setScreen('category');
            }
            break;
          }

          case 'NAVIGATE_SERVICE':
            startServiceFlow(action.service, false, action.step);
            break;

          case 'OPEN_BAG':
            setBagOpen(true);
            break;

          case 'OPEN_ORDERS':
            setOrdersOpen(true);
            break;

          case 'OPEN_SETTINGS':
            if (action.tab) setSettingsTab(action.tab);
            setSettingsOpen(true);
            break;

          case 'OPEN_ADMIN':
            setScreen('admin');
            break;

          case 'OPEN_CAMERA':
            setCameraTarget('chat');
            setCameraOpen(true);
            break;

          case 'NEW_CONVERSATION':
            startNewConversation();
            break;

          case 'ADD_TO_BAG': {
            const exists = products.find((p) => p.id === action.productId && p.available);
            if (exists) {
              changeBagQty(exists.id, Math.max(1, action.quantity || 1), undefined, true);
              if (screen === 'home' || screen === 'admin') {
                setScreen('category');
                setActiveService(exists.category);
              }
            }
            break;
          }

          case 'SET_BAG_QUANTITY': {
            suppressBagEchoRef.current = true;
            setBag((curr) => {
              const next = { ...curr };
              if (action.quantity <= 0) delete next[action.productId];
              else next[action.productId] = action.quantity;
              return next;
            });
            break;
          }

          case 'REMOVE_FROM_BAG': {
            suppressBagEchoRef.current = true;
            setBag((curr) => {
              const next = { ...curr };
              delete next[action.productId];
              return next;
            });
            break;
          }

          case 'CLEAR_BAG':
            suppressBagEchoRef.current = true;
            setBag({});
            setCheckoutStage('idle');
            break;

          case 'SET_LAUNDRY_QTY':
            setLaundryData((curr) => ({
              ...curr,
              quantities: {
                ...curr.quantities,
                [action.serviceId]: Math.max(0, action.quantity),
              },
            }));
            break;

          case 'UPDATE_DELIVERY_DETAILS':
            updatedDetailsPatch = { ...(updatedDetailsPatch || {}), ...action.details };
            setDeliveryDetails((curr) => ({ ...curr, ...action.details }));
            setLaundryData((curr) => ({
              ...curr,
              pickup: { ...curr.pickup, ...action.details },
            }));
            break;

          case 'UPDATE_PARCEL_DETAILS':
            setParcelData((curr) => ({ ...curr, ...action.details }));
            break;

          case 'ADD_SERVICE_NOTE':
            if (action.target === 'laundry') {
              setLaundryData((c) => ({ ...c, notes: [...c.notes, action.note] }));
            } else {
              setParcelData((c) => ({ ...c, notes: [...c.notes, action.note] }));
            }
            break;

          case 'GO_TO_CHECKOUT':
            setTimeout(() => goToCheckout(), 30);
            break;

          case 'GO_TO_PAYMENT': {
            // If user attached an image or PDF in this turn, auto-bind it as payment proof!
            const proofCandidate = turnAttachments.find(
              (a) => a.kind === 'image' || a.kind === 'pdf'
            );
            if (proofCandidate) {
              setCheckoutProof(proofCandidate);
              setLaundryData((l) => ({ ...l, proof: proofCandidate }));
              setParcelData((p) => ({ ...p, proof: proofCandidate }));
            }
            const patchCopy = updatedDetailsPatch;
            setTimeout(() => goStraightToPayment(patchCopy), 40);
            break;
          }
        }
      }
    },
    [
      changeBagQty,
      goStraightToPayment,
      goToCheckout,
      products,
      screen,
      startNewConversation,
      startServiceFlow,
    ]
  );

  /**
   * Main User Turn Handler (Text, Voice Command, or Multimodal Photo/File Attachments)
   */
  const handleSendTurn = React.useCallback(
    async (overrideText?: string, fromVoice = false) => {
      const rawText = (overrideText !== undefined ? overrideText : input).trim();
      const attachmentsToUse = overrideText !== undefined ? [] : pendingAttachments;

      if ((!rawText && attachmentsToUse.length === 0) || typing) return;

      if (overrideText === undefined) {
        setInput('');
        setPendingAttachments([]);
      }

      if (screen === 'home' || screen === 'admin') {
        setScreen('category');
      }

      const displayUserText =
        rawText ||
        `Sent ${attachmentsToUse.length} ${
          attachmentsToUse.length === 1 ? 'attachment' : 'attachments'
        }`;

      appendMessage('you', displayUserText, {
        attachments: attachmentsToUse.length ? attachmentsToUse : undefined,
      });

      setTyping(true);
      try {
        const result = await resolveUserTurn(
          rawText,
          attachmentsToUse,
          {
            products,
            laundryServices,
            campusZones,
            bag,
            activeService,
            checkoutStage,
            deliveryDetails,
            orders,
            recentMessages: messages,
          },
          settings
        );

        // Update token savings telemetry
        const updatedMetrics = recordTokenMetric(
          result.engine,
          result.tokensSavedEstimate,
          result.tokensUsedEstimate
        );
        setTokenMetrics(updatedMetrics);

        // Determine if any NAVIGATE_BROWSE action should attach its products/choices to Nova's reply bubble
        const browseAction = result.actions.find((a) => a.type === 'NAVIGATE_BROWSE') as
          | { type: 'NAVIGATE_BROWSE'; nodeId: string }
          | undefined;
        let replyChoices = result.choices;
        let replyProducts = result.productIds;
        if (browseAction && BROWSE_NODES[browseAction.nodeId]) {
          const node = BROWSE_NODES[browseAction.nodeId];
          replyChoices = node.children || replyChoices;
          if (node.subcategory) {
            replyProducts = products
              .filter((p) => p.category === node.root && p.subcategory === node.subcategory)
              .map((p) => p.id);
          }
        }

        executeAiActions(result.actions, attachmentsToUse);

        appendMessage('nova', result.reply, {
          sourceEngine: result.engine,
          choices: replyChoices,
          productIds: replyProducts,
          quickActions: result.quickActions,
        });

        if (fromVoice || settings.voiceReplyTts) {
          voiceControllerRef.current?.speakReply(result.reply);
        }
      } finally {
        setTyping(false);
      }
    },
    [
      activeService,
      appendMessage,
      bag,
      campusZones,
      checkoutStage,
      deliveryDetails,
      executeAiActions,
      input,
      laundryServices,
      messages,
      orders,
      pendingAttachments,
      products,
      screen,
      settings,
      typing,
    ]
  );

  // Keep voiceSubmitRef pointing at latest handleSendTurn
  React.useEffect(() => {
    voiceSubmitRef.current = (cmd: string, fromWake: boolean) => {
      if (fromWake) {
        flashToast(`Heard: "${cmd}"`);
      }
      handleSendTurn(cmd, true);
    };
  }, [handleSendTurn, flashToast]);

  // Initialize & synchronize NovaVoiceController for "Hey Nova" / "Hi Nova" wake word
  React.useEffect(() => {
    const controller = new NovaVoiceController(settings, {
      onStateChange: (st) => setVoiceState(st),
      onInterimTranscript: (txt) => setInterimVoiceText(txt),
      onWakeTriggered: (phrase) => {
        flashToast(`${phrase} — Listening for your command…`);
      },
      onCommandCaptured: (cmd, fromWake) => {
        voiceSubmitRef.current(cmd, fromWake);
      },
      onError: (errMsg) => flashToast(errMsg),
    });

    voiceControllerRef.current = controller;
    if (settings.voiceEnabled && settings.wakeWordEnabled) {
      controller.startWakeWordStandby();
    }

    return () => {
      controller.stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push settings updates to VoiceController without recreating controller
  React.useEffect(() => {
    voiceControllerRef.current?.updateSettings(settings);
  }, [settings]);

  const handleUpdateSettings = (next: UserSettings) => {
    setSettings(next);
    const { prunedCount } = saveUserSettings(next);
    setStoredConversations(loadStoredConversations());
    if (prunedCount > 0) {
      flashToast(`Cleared ${prunedCount} oldest chat(s) to match your new limit of ${next.maxStoredConversations}.`);
    }
  };

  const handleToggleWakeWordQuick = () => {
    if (voiceState === 'awake_listening' || voiceState === 'manual_listening') {
      voiceControllerRef.current?.stopManualOrAwakeCapture();
      return;
    }
    const nextEnabled = !settings.wakeWordEnabled;
    const nextSettings: UserSettings = {
      ...settings,
      voiceEnabled: true,
      wakeWordEnabled: nextEnabled,
    };
    handleUpdateSettings(nextSettings);
    flashToast(
      nextEnabled
        ? 'Wake word enabled! Say "Hey Nova" or "Hi Nova" anytime.'
        : 'Wake word standby turned off.'
    );
  };

  // File Picker Handler (enforces strict whitelist!)
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const slotsLeft = MAX_ATTACHMENTS_PER_MESSAGE - pendingAttachments.length;
    if (slotsLeft <= 0) {
      flashToast(`Maximum ${MAX_ATTACHMENTS_PER_MESSAGE} attachments per message.`);
      e.target.value = '';
      return;
    }

    const added: ChatAttachment[] = [];
    for (const file of files.slice(0, slotsLeft)) {
      const outcome = await validateAndProcessFile(file);
      if (!outcome.valid || !outcome.attachment) {
        flashToast(outcome.error || 'Unsupported file type.');
      } else {
        added.push(outcome.attachment);
      }
    }

    if (added.length > 0) {
      setPendingAttachments((curr) => [...curr, ...added]);
    }
    e.target.value = '';
  };

  // Camera Capture Routing
  const handleCameraCaptured = (att: ChatAttachment) => {
    if (cameraTarget === 'checkout_proof') {
      setCheckoutProof(att);
      flashToast('Payment receipt photo attached!');
    } else if (cameraTarget === 'laundry_proof') {
      setLaundryData((l) => ({ ...l, proof: att }));
      flashToast('Laundry payment receipt photo attached!');
    } else if (cameraTarget === 'parcel_item') {
      setParcelData((p) => ({ ...p, itemPhoto: att }));
      flashToast('Parcel item photo attached!');
    } else if (cameraTarget === 'parcel_proof') {
      setParcelData((p) => ({ ...p, proof: att }));
      flashToast('Parcel payment receipt photo attached!');
    } else {
      setPendingAttachments((curr) =>
        curr.length < MAX_ATTACHMENTS_PER_MESSAGE ? [...curr, att] : curr
      );
    }
  };

  // Order Creation Handlers (Food/Groceries, Laundry, Parcel)
  const buildOrderCode = () => `#NV-${Math.floor(1000 + Math.random() * 9000)}`;

  const handleSubmitFoodOrder = async ({
    paymentMethod,
    proof,
    deliveryFee,
  }: {
    paymentMethod: PaymentMethod;
    proof: ChatAttachment | null;
    deliveryFee: number;
  }) => {
    const items = bagLines.map((p) => ({
      id: p.id,
      name: p.name,
      quantity: bag[p.id],
      unitPrice: p.price,
      totalPrice: p.price * bag[p.id],
    }));
    const subtotal = items.reduce((s, i) => s + i.totalPrice, 0);
    const hasFood = bagLines.some((p) => p.category === 'Food');
    const now = new Date().toISOString();

    const newOrder: NovaOrder = {
      id: `ord-${Date.now()}`,
      orderCode: buildOrderCode(),
      serviceType: hasFood ? 'Food' : 'Groceries',
      status: paymentMethod === 'pay_on_delivery' ? 'confirmed' : 'pending_verification',
      paymentMethod,
      paymentVerified: false,
      proofFileName: proof?.name,
      proofDataUrl: proof?.dataUrl,
      items,
      subtotal,
      deliveryFee,
      total: subtotal + deliveryFee,
      university: deliveryDetails.university,
      campusAddress: deliveryDetails.campusAddress,
      customerPhone: deliveryDetails.phone,
      timing: deliveryDetails.timing,
      scheduledTime: deliveryDetails.time || undefined,
      notes: [],
      createdAt: now,
      updatedAt: now,
    };

    const updatedOrders = await createNovaOrder(newOrder);
    setOrders(updatedOrders);
    suppressBagEchoRef.current = true;
    setBag({});
    setCheckoutProof(null);
    setCheckoutStage('idle');

    appendMessage(
      'nova',
      `Order ${newOrder.orderCode} received (${formatNaira(newOrder.total)})! ${
        paymentMethod === 'bank_transfer'
          ? 'Your payment receipt has been sent to our operators for quick verification.'
          : 'Your campus rider is being assigned — please have payment ready on arrival.'
      } You can track live progress anytime in My Orders.`,
      {
        sourceEngine: 'system',
        quickActions: [{ label: 'Track Order Status →', actionType: 'OPEN_ORDERS' }],
      }
    );
    flashToast(`Order ${newOrder.orderCode} placed!`);
  };

  const handleSubmitLaundryOrder = async ({
    subtotal,
    pickupFee,
    total,
    paymentMethod,
    proof,
  }: {
    subtotal: number;
    pickupFee: number;
    total: number;
    paymentMethod: PaymentMethod;
    proof: ChatAttachment | null;
  }) => {
    const items = laundryServices
      .filter((s) => (laundryData.quantities[s.id] || 0) > 0)
      .map((s) => ({
        id: s.id,
        name: s.name,
        quantity: laundryData.quantities[s.id],
        unitPrice: s.price,
        totalPrice: s.price * laundryData.quantities[s.id],
      }));
    const now = new Date().toISOString();

    const newOrder: NovaOrder = {
      id: `ord-${Date.now()}`,
      orderCode: buildOrderCode(),
      serviceType: 'Laundry',
      status: paymentMethod === 'pay_on_delivery' ? 'confirmed' : 'pending_verification',
      paymentMethod,
      paymentVerified: false,
      proofFileName: proof?.name,
      proofDataUrl: proof?.dataUrl,
      items,
      subtotal,
      deliveryFee: pickupFee,
      total,
      university: laundryData.pickup.university,
      campusAddress: laundryData.pickup.campusAddress,
      customerPhone: laundryData.pickup.phone,
      timing: laundryData.pickup.timing,
      scheduledTime: laundryData.pickup.time || undefined,
      notes: laundryData.notes,
      createdAt: now,
      updatedAt: now,
    };

    const updatedOrders = await createNovaOrder(newOrder);
    setOrders(updatedOrders);
    setLaundryActive(false);
    setLaundryData((l) => ({
      ...l,
      step: 1,
      furthestStep: 1,
      quantities: {},
      notes: [],
      proof: null,
      submittedOrderId: newOrder.id,
    }));

    appendMessage(
      'nova',
      `Laundry pickup ${newOrder.orderCode} booked (${formatNaira(total)})! Track pickup verification & rider dispatch in My Orders.`,
      {
        sourceEngine: 'system',
        quickActions: [{ label: 'Track Laundry Order →', actionType: 'OPEN_ORDERS' }],
      }
    );
    flashToast(`Laundry Order ${newOrder.orderCode} submitted!`);
  };

  const handleSubmitParcelOrder = async ({
    fee,
    paymentMethod,
    proof,
  }: {
    fee: number;
    paymentMethod: PaymentMethod;
    proof: ChatAttachment | null;
  }) => {
    const now = new Date().toISOString();
    const newOrder: NovaOrder = {
      id: `ord-${Date.now()}`,
      orderCode: buildOrderCode(),
      serviceType: 'Parcel Pickup',
      status: paymentMethod === 'pay_on_delivery' ? 'confirmed' : 'pending_verification',
      paymentMethod,
      paymentVerified: false,
      proofFileName: proof?.name,
      proofDataUrl: proof?.dataUrl,
      items: [
        {
          id: 'parcel',
          name: `Parcel: ${parcelData.itemDescription}`,
          quantity: 1,
          unitPrice: fee,
          totalPrice: fee,
        },
      ],
      subtotal: 0,
      deliveryFee: fee,
      total: fee,
      university: parcelData.university,
      pickupAddress: parcelData.pickupAddress,
      dropoffAddress: parcelData.dropoffAddress,
      customerPhone: parcelData.pickupPhone,
      secondaryPhone: parcelData.dropoffPhone,
      itemDescription: parcelData.itemDescription,
      itemPhotoUrl: parcelData.itemPhoto?.dataUrl,
      timing: parcelData.timing,
      scheduledTime: parcelData.time || undefined,
      notes: parcelData.notes,
      createdAt: now,
      updatedAt: now,
    };

    const updatedOrders = await createNovaOrder(newOrder);
    setOrders(updatedOrders);
    setActiveService('');
    setParcelData((p) => ({
      ...p,
      step: 1,
      furthestStep: 1,
      itemDescription: '',
      pickupAddress: '',
      dropoffAddress: '',
      notes: [],
      itemPhoto: null,
      proof: null,
      submittedOrderId: newOrder.id,
    }));

    appendMessage(
      'nova',
      `Parcel dispatch ${newOrder.orderCode} created (${formatNaira(fee)}) from ${newOrder.pickupAddress} to ${newOrder.dropoffAddress}!`,
      {
        sourceEngine: 'system',
        quickActions: [{ label: 'Track Parcel →', actionType: 'OPEN_ORDERS' }],
      }
    );
    flashToast(`Parcel ${newOrder.orderCode} booked!`);
  };

  // Back Button Navigation (preserving state across steps just like preview!)
  const handleBack = () => {
    if (laundryActive && laundryData.step > 1) {
      setLaundryData((l) => ({ ...l, step: (l.step - 1) as 1 | 2 }));
      return;
    }
    if (activeService === 'Parcel Pickup' && checkoutStage === 'idle' && parcelData.step > 1) {
      setParcelData((p) => ({ ...p, step: (p.step - 1) as 1 | 2 }));
      return;
    }
    if (checkoutStage !== 'idle') {
      setCheckoutStage((curr) =>
        curr === 'payment' ? 'review' : curr === 'review' ? 'delivery' : 'idle'
      );
      return;
    }
    if (activeBrowseNode && BROWSE_NODES[activeBrowseNode]?.parent) {
      selectBrowseNode(BROWSE_NODES[activeBrowseNode].parent!, false);
      return;
    }
    setLaundryActive(false);
    setShoppingPrompt(false);
    setActiveService('');
    setScreen((curr) => (curr === 'category' ? 'categories' : 'home'));
  };

  const handleQuickActionClick = (actionType: string) => {
    if (actionType.startsWith('ADD_PRODUCT:')) {
      const prodId = actionType.replace('ADD_PRODUCT:', '');
      const prod = products.find((p) => p.id === prodId);
      if (prod) {
        changeBagQty(prod.id, 1, undefined, true);
        flashToast(`Added ${prod.name} to bag!`);
      }
      return;
    }

    switch (actionType) {
      case 'GO_TO_CHECKOUT':
        goToCheckout();
        break;
      case 'GO_TO_PAYMENT':
        goStraightToPayment();
        break;
      case 'NAVIGATE_LAUNDRY':
        startServiceFlow('Laundry');
        break;
      case 'NAVIGATE_PARCEL':
        startServiceFlow('Parcel Pickup');
        break;
      case 'BROWSE_FOOD':
        selectBrowseNode('food');
        break;
      case 'BROWSE_GROCERIES':
        selectBrowseNode('groceries');
        break;
      case 'OPEN_BAG':
        setBagOpen(true);
        break;
      case 'OPEN_ORDERS':
        setOrdersOpen(true);
        break;
      case 'OPEN_AI_SETTINGS':
        setSettingsTab('ai');
        setSettingsOpen(true);
        break;
      case 'OPEN_SETTINGS':
        setSettingsOpen(true);
        break;
      case 'OPEN_ADMIN':
        setScreen('admin');
        break;
    }
  };

  const renderNovaMessage = (m: ChatMessage) => (
    <article
      key={m.id}
      data-message-id={m.id}
      className="message nova nova-chat-message"
    >
      <span className="nova-avatar" aria-hidden="true">
        <img src="/logo.png" alt="" />
      </span>
      <div className="nova-message-content">
        <div className="nova-sender-row">
          <small className="nova-sender">Nova</small>
          {m.sourceEngine === 'nlp' && (
            <span className="engine-tag nlp-tag" title="Resolved on device · 0 Gemini tokens used">
              Instant NLP · 0 tokens
            </span>
          )}
          {m.sourceEngine === 'gemini' && (
            <span className="engine-tag gemini-tag" title="Powered by Gemini 2.5 Flash">
              <Sparkles size={10} /> Gemini AI
            </span>
          )}
        </div>

        <div className="nova-message-bubble">
          <p>{m.text}</p>

          {m.services && (
            <div className="message-options">
              {(['Food', 'Groceries', 'Laundry', 'Parcel Pickup'] as const).map((svc) => (
                <button
                  key={svc}
                  type="button"
                  className="category"
                  onClick={() => startServiceFlow(svc)}
                >
                  {svc}
                </button>
              ))}
            </div>
          )}

          {m.choices && m.choices.length > 0 && (
            <div className="message-options">
              {m.choices.map((nodeId) => {
                const node = BROWSE_NODES[nodeId];
                if (!node) return null;
                return (
                  <button
                    key={nodeId}
                    type="button"
                    className={
                      'subcategory-chip' + (activeBrowseNode === nodeId ? ' active' : '')
                    }
                    aria-pressed={activeBrowseNode === nodeId}
                    onClick={() => selectBrowseNode(nodeId)}
                  >
                    {node.label}
                  </button>
                );
              })}
            </div>
          )}

          {m.shopping && (
            <div className="message-options">
              <button
                type="button"
                className="suggestion-chip"
                onClick={goToCheckout}
              >
                Proceed to checkout →
              </button>
              <button
                type="button"
                className="suggestion-chip primary-chip"
                onClick={() => goStraightToPayment()}
              >
                Ready to pay →
              </button>
              {!shoppingPrompt && (
                <button
                  type="button"
                  className="suggestion-chip"
                  onClick={() => {
                    setCheckoutStage('idle');
                    setShoppingPrompt(true);
                    textareaRef.current?.focus();
                  }}
                >
                  + Add more items
                </button>
              )}
            </div>
          )}

          {m.quickActions && m.quickActions.length > 0 && (
            <div className="message-options">
              {m.quickActions.map((qa, i) => (
                <button
                  key={i}
                  type="button"
                  className="suggestion-chip"
                  onClick={() => handleQuickActionClick(qa.actionType)}
                >
                  {qa.label}
                </button>
              ))}
            </div>
          )}

          {m.productIds && m.productIds.length > 0 && (
            <>
              <p className="demo-note">
                Campus catalog · tap + to add to your bag or tell Nova quantities by voice
              </p>
              <div className="products">
                {products
                  .filter((prod) => m.productIds!.includes(prod.id))
                  .map((prod) => (
                    <ProductCard
                      key={prod.id}
                      product={prod}
                      quantity={bag[prod.id] || 0}
                      onChangeQuantity={changeBagQty}
                    />
                  ))}
              </div>
            </>
          )}
        </div>
      </div>
    </article>
  );

  const renderUserMessage = (m: ChatMessage) => (
    <article key={m.id} data-message-id={m.id} className="message you">
      <small>You</small>
      {m.attachments && m.attachments.length > 0 && (
        <div className="message-attachments-grid">
          {m.attachments.map((att) =>
            att.kind === 'image' && att.dataUrl ? (
              <img
                key={att.id}
                src={att.dataUrl}
                alt={att.name}
                className="chat-attached-thumb"
              />
            ) : (
              <div key={att.id} className="chat-attached-doc">
                <FileText size={14} />
                <span>{att.name}</span>
              </div>
            )
          )}
        </div>
      )}
      <p>{m.text}</p>
    </article>
  );

  const isVoiceActivelyListening =
    voiceState === 'awake_listening' || voiceState === 'manual_listening';

  const renderComposer = () => (
    <div className="composer-wrap">
      {chatting && (
        <button
          type="button"
          className="navigation-back"
          onClick={handleBack}
          aria-label="Back to previous screen"
        >
          ← Back
        </button>
      )}

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          handleSendTurn();
        }}
      >
        {isVoiceActivelyListening && (
          <div className="voice-listening-banner" role="status">
            <div className="voice-wave-bars" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
            <p>
              {interimVoiceText ? (
                <>
                  <strong>"{interimVoiceText}"</strong>
                </>
              ) : (
                'Nova is listening… speak your order or search request'
              )}
            </p>
            <button
              type="button"
              className="voice-stop-chip"
              onClick={() => voiceControllerRef.current?.stopManualOrAwakeCapture()}
            >
              Done
            </button>
          </div>
        )}

        {pendingAttachments.length > 0 && (
          <div className="composer-attachments-strip">
            {pendingAttachments.map((att) => (
              <div className="composer-att-chip" key={att.id}>
                {att.kind === 'image' && att.dataUrl ? (
                  <img src={att.dataUrl} alt={att.name} />
                ) : (
                  <FileText size={15} />
                )}
                <div className="att-meta">
                  <span>{att.name}</span>
                  <small>{formatFileSize(att.size)}</small>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setPendingAttachments((curr) => curr.filter((x) => x.id !== att.id))
                  }
                  aria-label={`Remove ${att.name}`}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="composer-main-bar">
          <div className="composer-tools-inline left-tools">
            <button
              type="button"
              className="attach"
              onClick={() => fileInputRef.current?.click()}
              title="Attach photo, list, or receipt"
              aria-label="Attach file"
            >
              <Paperclip size={17} />
            </button>

            <button
              type="button"
              className="attach"
              onClick={() => {
                setCameraTarget('chat');
                setCameraOpen(true);
              }}
              title="Take photo"
              aria-label="Take photo"
            >
              <Camera size={17} />
            </button>
          </div>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={chatting ? 'Message Nova...' : 'Ask Nova anything...'}
            className={placeholderFade ? 'fading' : ''}
            aria-label="Ask Nova or type an order"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSendTurn();
              }
            }}
          />

          <input
            type="file"
            ref={fileInputRef}
            hidden
            multiple
            accept={ACCEPT_ATTRIBUTE}
            onChange={handleFileInputChange}
          />

          <div className="composer-tools-inline right-tools">
            {settings.voiceEnabled && (
              <button
                type="button"
                className={'attach mic-btn' + (isVoiceActivelyListening ? ' active' : '')}
                onClick={() => {
                  if (isVoiceActivelyListening) {
                    voiceControllerRef.current?.stopManualOrAwakeCapture();
                  } else {
                    voiceControllerRef.current?.startManualVoiceCapture();
                  }
                }}
                title={
                  isVoiceActivelyListening
                    ? 'Stop voice dictation'
                    : 'Speak a voice command'
                }
                aria-label="Voice command microphone"
              >
                {isVoiceActivelyListening ? <Volume2 size={17} /> : <Mic size={17} />}
              </button>
            )}

            <button
              type="submit"
              className="send"
              disabled={(!input.trim() && pendingAttachments.length === 0) || typing}
              aria-label="Send message"
            >
              <ArrowUp size={17} />
            </button>
          </div>
        </div>
      </form>

      {!chatting && (
        <div className="categories-quick-row">
          <button
            type="button"
            className="category-pill-btn"
            onClick={() => startServiceFlow('Food')}
          >
            <UtensilsCrossed size={14} /> Food
          </button>
          <button
            type="button"
            className="category-pill-btn"
            onClick={() => startServiceFlow('Groceries')}
          >
            <ShoppingBag size={14} /> Groceries
          </button>
          <button
            type="button"
            className="category-pill-btn"
            onClick={() => startServiceFlow('Laundry')}
          >
            <Shirt size={14} /> Laundry
          </button>
          <button
            type="button"
            className="category-pill-btn"
            onClick={() => startServiceFlow('Parcel Pickup')}
          >
            <Truck size={14} /> Parcel
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div
      className={
        'nova-app' +
        (chatting ? ' chat-mode' : '') +
        (laundryActive ? ' laundry-mode' : '') +
        (isAdminView ? ' admin-mode' : '')
      }
    >
      <Header
        bagCount={bagCount}
        activeOrdersCount={activeOrdersCount}
        savedChatsCount={storedConversations.length}
        maxChatsLimit={settings.maxStoredConversations}
        onGoHome={() => {
          setScreen('home');
          setCheckoutStage('idle');
          setLaundryActive(false);
        }}
        onOpenBag={() => setBagOpen(true)}
        onOpenOrders={() => setOrdersOpen(true)}
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenSettings={(tab) => {
          if (tab) setSettingsTab(tab);
          setSettingsOpen(true);
        }}
      />

      {isAdminView ? (
        <AdminDashboard
          products={products}
          laundryServices={laundryServices}
          campusZones={campusZones}
          paymentConfig={paymentConfig}
          orders={orders}
          tokenMetrics={tokenMetrics}
          onUpdateProducts={(next) => {
            setProducts(next);
            saveProductsCatalog(next);
          }}
          onUpdateLaundryServices={(next) => {
            setLaundryServices(next);
            saveLaundryServices(next);
          }}
          onUpdateCampusZones={(next) => {
            setCampusZones(next);
            saveCampusZones(next);
          }}
          onUpdatePaymentConfig={(next) => {
            setPaymentConfig(next);
            savePaymentConfig(next);
          }}
          onUpdateOrder={async (orderId, patch) => {
            const next = await updateNovaOrder(orderId, patch);
            setOrders(next);
            flashToast('Order updated!');
          }}
          onRefreshOrders={async () => {
            const latest = await fetchOrders();
            setOrders(latest);
            flashToast('Orders synced.');
          }}
          onExitAdmin={() => {
            window.location.hash = '#home';
            setScreen(messages.length ? 'category' : 'home');
          }}
        />
      ) : (
        <>
          <main className={chatting ? 'nova-main conversation' : 'nova-main homepage'}>
            {!chatting ? (
              <>
                <div className="intro">
                  <h1>
                    What can <span>Nova</span> get you?
                  </h1>
                  <p>
                    Campus food, groceries, laundry and parcels on demand.
                  </p>
                </div>
                {renderComposer()}
              </>
            ) : (
              <section className="messages" aria-label="Conversation" aria-live="polite">
                {messages.map((m) =>
                  m.role === 'nova' ? renderNovaMessage(m) : renderUserMessage(m)
                )}

                {typing && (
                  <p className="typing" role="status">
                    Nova is thinking<span>•••</span>
                  </p>
                )}

                {laundryActive ? (
                  <div className="laundry-session" ref={laundryRef}>
                    <LaundryFlow
                      services={laundryServices}
                      campusZones={campusZones}
                      paymentConfig={paymentConfig}
                      data={laundryData}
                      setData={setLaundryData}
                      onOpenCameraForProof={() => {
                        setCameraTarget('laundry_proof');
                        setCameraOpen(true);
                      }}
                      onSubmitLaundryOrder={handleSubmitLaundryOrder}
                    />
                  </div>
                ) : activeService === 'Parcel Pickup' && checkoutStage === 'idle' ? (
                  <ParcelFlow
                    campusZones={campusZones}
                    paymentConfig={paymentConfig}
                    data={parcelData}
                    setData={setParcelData}
                    onOpenCameraForItem={() => {
                      setCameraTarget('parcel_item');
                      setCameraOpen(true);
                    }}
                    onOpenCameraForProof={() => {
                      setCameraTarget('parcel_proof');
                      setCameraOpen(true);
                    }}
                    onSubmitParcelOrder={handleSubmitParcelOrder}
                  />
                ) : checkoutStage !== 'idle' ? (
                  <div ref={checkoutRef}>
                    <CheckoutFlow
                      stage={checkoutStage}
                      setStage={setCheckoutStage}
                      products={products}
                      bag={bag}
                      details={deliveryDetails}
                      setDetails={setDeliveryDetails}
                      remember={rememberDetails}
                      setRemember={(val) => {
                        setRememberDetails(val);
                        if (!val) {
                          try {
                            localStorage.removeItem(DELIVERY_LOCAL_KEY);
                          } catch {
                            // Ignore
                          }
                        }
                      }}
                      onClearSavedDetails={() => {
                        try {
                          localStorage.removeItem(DELIVERY_LOCAL_KEY);
                        } catch {
                          // Ignore
                        }
                        setRememberDetails(false);
                        setDeliveryDetails({
                          university: '',
                          campusAddress: '',
                          phone: '',
                          timing: 'ASAP',
                          time: '',
                        });
                      }}
                      onChangeQuantity={changeBagQty}
                      onRemoveItem={(id) =>
                        setBag((b) => {
                          const next = { ...b };
                          delete next[id];
                          return next;
                        })
                      }
                      onAddMoreItems={() => {
                        setCheckoutStage('idle');
                        setShoppingPrompt(true);
                        textareaRef.current?.focus();
                      }}
                      campusZones={campusZones}
                      paymentConfig={paymentConfig}
                      externalProof={checkoutProof}
                      onSetExternalProof={setCheckoutProof}
                      onOpenCameraForProof={() => {
                        setCameraTarget('checkout_proof');
                        setCameraOpen(true);
                      }}
                      onSubmitOrder={handleSubmitFoodOrder}
                    />
                  </div>
                ) : null}

                <div ref={endRef} />
              </section>
            )}
          </main>

          {chatting && renderComposer()}
        </>
      )}

      <BagModal
        open={bagOpen}
        products={products}
        bag={bag}
        onClose={() => setBagOpen(false)}
        onChangeQuantity={changeBagQty}
        onRemoveItem={(id) =>
          setBag((b) => {
            const next = { ...b };
            delete next[id];
            return next;
          })
        }
        onCheckout={goToCheckout}
        onGoStraightToPayment={() => goStraightToPayment()}
      />

      <OrdersModal
        open={ordersOpen}
        orders={orders}
        onClose={() => setOrdersOpen(false)}
      />

      <HistoryDrawer
        open={historyOpen}
        conversations={storedConversations}
        activeConversationId={conversationId}
        maxLimit={settings.maxStoredConversations}
        storageEnabled={settings.storeConversationsOnDevice}
        onClose={() => setHistoryOpen(false)}
        onSelectConversation={(conv) => {
          setConversationId(conv.id);
          setActiveConversationId(conv.id);
          setMessages(conv.messages);
          setActiveService(conv.serviceContext || '');
          setCheckoutStage('idle');
          setLaundryActive(false);
          setScreen(conv.messages.length ? 'category' : 'home');
        }}
        onNewConversation={startNewConversation}
        onDeleteConversation={(id) => {
          const remaining = deleteStoredConversation(id);
          setStoredConversations(remaining);
          if (id === conversationId) {
            startNewConversation();
          }
        }}
        onOpenStorageSettings={() => {
          setSettingsTab('storage');
          setSettingsOpen(true);
        }}
      />

      <SettingsModal
        open={settingsOpen}
        initialTab={settingsTab}
        settings={settings}
        savedChatsCount={storedConversations.length}
        tokenMetrics={tokenMetrics}
        onUpdateSettings={handleUpdateSettings}
        onClearAllConversations={() => {
          clearAllStoredConversations();
          setStoredConversations([]);
          startNewConversation();
          flashToast('All saved chats cleared from this device.');
        }}
        onClose={() => setSettingsOpen(false)}
        onGoToAdmin={() => {
          window.location.hash = '#admin';
          setScreen('admin');
        }}
      />

      <CameraModal
        open={cameraOpen}
        purposeLabel={
          cameraTarget.includes('proof')
            ? 'Snap a clear photo of your payment transfer receipt'
            : cameraTarget === 'parcel_item'
            ? 'Snap a photo of the parcel item to be picked up'
            : 'Snap a handwritten list, receipt, or item for Nova AI'
        }
        onClose={() => setCameraOpen(false)}
        onCapture={handleCameraCaptured}
      />

      <div className="toast" role="status">
        {toast}
      </div>
    </div>
  );
}
export default App;
