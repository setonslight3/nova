export type ServiceType = 'Food' | 'Groceries' | 'Laundry' | 'Parcel Pickup';

export type ScreenSection =
  | 'home'
  | 'categories'
  | 'category'
  | 'admin';

export type CheckoutStage = 'idle' | 'delivery' | 'review' | 'payment' | 'submitted';

export type OrderStatus =
  | 'pending_verification'
  | 'confirmed'
  | 'preparing'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type PaymentMethod = 'bank_transfer' | 'card' | 'pay_on_delivery';

export interface Product {
  id: string;
  name: string;
  desc: string;
  servingSize?: string;
  price: number;
  originalPrice?: number;
  time: string;
  category: 'Food' | 'Groceries';
  subcategory: string;
  image: string;
  available: boolean;
  tags?: string[];
}

export interface LaundryServiceItem {
  id: string;
  name: string;
  description: string;
  price: number;
  path: string;
  available: boolean;
}

export interface CampusZone {
  id: string;
  name: string;
  foodDeliveryFee: number;
  laundryPickupFee: number;
  parcelBaseFee: number;
  estimatedEta: string;
  active: boolean;
}

export interface PlatformPaymentConfig {
  paymentMode: 'demo' | 'live';
  bankName: string;
  accountName: string;
  accountNumber: string;
  supportPhone: string;
  allowPayOnDelivery: boolean;
  adminPin: string;
}

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'pdf' | 'text';
  dataUrl?: string;
  textContent?: string;
  source: 'file' | 'camera';
}

export interface DeliveryDetails {
  university: string;
  campusAddress: string;
  phone: string;
  timing: 'ASAP' | 'Scheduled';
  time: string;
}

export interface LaundryState {
  step: 1 | 2 | 3;
  furthestStep: 1 | 2 | 3;
  quantities: Record<string, number>;
  pickup: DeliveryDetails;
  notes: string[];
  paymentMethod: PaymentMethod;
  proof: ChatAttachment | null;
  submittedOrderId: string | null;
}

export interface ParcelState {
  step: 1 | 2 | 3;
  furthestStep: 1 | 2 | 3;
  university: string;
  itemDescription: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickupPhone: string;
  dropoffPhone: string;
  timing: 'ASAP' | 'Scheduled';
  time: string;
  notes: string[];
  itemPhoto: ChatAttachment | null;
  paymentMethod: PaymentMethod;
  proof: ChatAttachment | null;
  submittedOrderId: string | null;
}

export interface OrderLineItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface NovaOrder {
  id: string;
  orderCode: string;
  serviceType: ServiceType;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentVerified: boolean;
  proofFileName?: string;
  proofDataUrl?: string;
  items: OrderLineItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  university?: string;
  campusAddress?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  customerPhone: string;
  secondaryPhone?: string;
  itemDescription?: string;
  itemPhotoUrl?: string;
  timing: 'ASAP' | 'Scheduled';
  scheduledTime?: string;
  notes: string[];
  riderName?: string;
  riderPhone?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'nova' | 'you';
  text: string;
  timestamp: string;
  sourceEngine?: 'nlp' | 'gemini' | 'system';
  services?: boolean;
  choices?: string[];
  productIds?: string[];
  nodeId?: string;
  shopping?: boolean;
  confirmation?: boolean;
  orderCardId?: string;
  attachments?: ChatAttachment[];
  quickActions?: Array<{
    label: string;
    actionType: string;
    payload?: string;
  }>;
}

export interface StoredConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  serviceContext: string;
  messages: ChatMessage[];
}

export interface UserSettings {
  // Voice & Wake Word Settings
  voiceEnabled: boolean;
  wakeWordEnabled: boolean;
  allowHeyNova: boolean;
  allowHiNova: boolean;
  customWakePhrase: string;
  wakeChimeEnabled: boolean;
  voiceReplyTts: boolean;
  voiceLanguage: 'en-NG' | 'en-GB' | 'en-US';
  autoSendVoice: boolean;

  // On-Device Conversation Storage & Limits
  storeConversationsOnDevice: boolean;
  maxStoredConversations: number;
  maxMessagesPerConversation: number;

  // AI & Token Optimization
  enableLocalNlp: boolean;
  enableGeminiApi: boolean;
  preferLocalNlpFirst: boolean;
  devGeminiApiKey: string;
}

export interface TokenMetrics {
  localNlpCount: number;
  geminiCallCount: number;
  estimatedTokensSaved: number;
  estimatedGeminiTokensUsed: number;
}

export type AIAction =
  | { type: 'NAVIGATE_HOME' }
  | { type: 'NAVIGATE_BROWSE'; nodeId: string }
  | { type: 'NAVIGATE_SERVICE'; service: ServiceType; step?: 1 | 2 | 3 }
  | { type: 'OPEN_BAG' }
  | { type: 'OPEN_ORDERS' }
  | { type: 'OPEN_SETTINGS'; tab?: 'voice' | 'storage' | 'ai' }
  | { type: 'OPEN_ADMIN' }
  | { type: 'OPEN_CAMERA' }
  | { type: 'ADD_TO_BAG'; productId: string; quantity: number }
  | { type: 'SET_BAG_QUANTITY'; productId: string; quantity: number }
  | { type: 'REMOVE_FROM_BAG'; productId: string }
  | { type: 'CLEAR_BAG' }
  | { type: 'SET_LAUNDRY_QTY'; serviceId: string; quantity: number }
  | { type: 'UPDATE_DELIVERY_DETAILS'; details: Partial<DeliveryDetails> }
  | { type: 'UPDATE_PARCEL_DETAILS'; details: Partial<ParcelState> }
  | { type: 'ADD_SERVICE_NOTE'; target: 'laundry' | 'parcel'; note: string }
  | { type: 'GO_TO_CHECKOUT' }
  | { type: 'GO_TO_PAYMENT' }
  | { type: 'NEW_CONVERSATION' };

export interface AIResolutionResult {
  reply: string;
  actions: AIAction[];
  engine: 'nlp' | 'gemini';
  confidence: number;
  tokensSavedEstimate: number;
  tokensUsedEstimate: number;
  quickActions?: ChatMessage['quickActions'];
  productIds?: string[];
  choices?: string[];
}
