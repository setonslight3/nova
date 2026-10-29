import {
  CampusZone,
  LaundryServiceItem,
  PlatformPaymentConfig,
  Product,
  UserSettings,
} from '../types/nova';

export const DEFAULT_PRODUCTS: Product[] = [
  // Food > Ready-Made Dishes (Original preview items preserved faithfully)
  {
    id: 'jollof',
    name: 'Jollof rice & chicken',
    desc: 'Smoky party jollof rice with grilled spiced chicken',
    servingSize: '1 hearty plate · grilled chicken',
    price: 3500,
    originalPrice: 4000,
    time: '25–35 min',
    category: 'Food',
    subcategory: 'Ready-Made Dishes',
    image: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=420&q=75',
    available: true,
    tags: ['jollof', 'rice', 'chicken', 'lunch', 'dinner', 'meal'],
  },
  {
    id: 'fried',
    name: 'Fried rice & chicken',
    desc: 'Golden vegetable fried rice served with peppered chicken',
    servingSize: '1 full plate · chicken thigh',
    price: 3200,
    time: '20–30 min',
    category: 'Food',
    subcategory: 'Ready-Made Dishes',
    image: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=420&q=75',
    available: true,
    tags: ['fried rice', 'rice', 'chicken', 'vegetable'],
  },
  {
    id: 'spaghetti',
    name: 'Jollof spaghetti',
    desc: 'Stir-fried spaghetti in rich tomato pepper sauce and veggies',
    servingSize: '1 regular pack',
    price: 2800,
    time: '20–30 min',
    category: 'Food',
    subcategory: 'Ready-Made Dishes',
    image: 'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=420&q=75',
    available: true,
    tags: ['spaghetti', 'pasta', 'noodles'],
  },
  {
    id: 'rice',
    name: 'White rice & stew',
    desc: 'Fluffy steamed white rice with rich beef & tomato stew',
    servingSize: '1 plate · assorted stew',
    price: 2500,
    time: '15–25 min',
    category: 'Food',
    subcategory: 'Ready-Made Dishes',
    image: 'https://images.unsplash.com/photo-1516714435131-44d6b64dc6a2?auto=format&fit=crop&w=420&q=75',
    available: true,
    tags: ['white rice', 'stew', 'rice'],
  },

  // Food > Fast Food (Previously empty in preview — now populated!)
  {
    id: 'shawarma',
    name: 'Chicken shawarma wrap',
    desc: 'Double-sausage creamy spicy chicken shawarma wrap',
    servingSize: 'Large wrap · double sausage',
    price: 3000,
    originalPrice: 3400,
    time: '15–25 min',
    category: 'Food',
    subcategory: 'Fast Food',
    image: 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=420&q=75',
    available: true,
    tags: ['shawarma', 'wrap', 'fast food', 'chicken'],
  },
  {
    id: 'burger',
    name: 'Classic beef burger & fries',
    desc: 'Grilled beef patty, cheddar cheese, lettuce & crispy fries',
    servingSize: 'Burger + regular fries',
    price: 4200,
    time: '20–30 min',
    category: 'Food',
    subcategory: 'Fast Food',
    image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=420&q=75',
    available: true,
    tags: ['burger', 'fries', 'chips', 'beef', 'fast food'],
  },

  // Food > Snacks & Pastries (Previously empty in preview — now populated!)
  {
    id: 'meatpie',
    name: 'Warm Nigerian meat pie (2 pcs)',
    desc: 'Flaky golden pastry filled with minced beef, potatoes & carrots',
    servingSize: 'Pack of 2 pies',
    price: 1600,
    time: '10–20 min',
    category: 'Food',
    subcategory: 'Snacks & Pastries',
    image: 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=420&q=75',
    available: true,
    tags: ['meat pie', 'pie', 'pastry', 'snack'],
  },

  // Food > Smoothies & Drinks (Previously empty in preview — now populated!)
  {
    id: 'smoothie',
    name: 'Tropical mango-pineapple smoothie',
    desc: 'Chilled fresh fruit blend with Greek yogurt drizzle',
    servingSize: '500 ml chilled cup',
    price: 2200,
    time: '10–15 min',
    category: 'Food',
    subcategory: 'Smoothies & Drinks',
    image: 'https://images.unsplash.com/photo-1505252585461-04db1eb84625?auto=format&fit=crop&w=420&q=75',
    available: true,
    tags: ['smoothie', 'juice', 'drink', 'mango', 'pineapple'],
  },

  // Groceries > Foodstuffs (Original preview items + campus staples)
  {
    id: 'eggs',
    name: 'Eggs · 6 pack',
    desc: 'Fresh farm eggs for everyday campus breakfast',
    price: 1800,
    time: '15–25 min',
    category: 'Groceries',
    subcategory: 'Foodstuffs',
    image: 'https://images.unsplash.com/photo-1518569656558-1f25e69d93d7?auto=format&fit=crop&w=420&q=75',
    available: true,
    tags: ['eggs', 'egg', 'breakfast', 'crate'],
  },
  {
    id: 'bread',
    name: 'Sliced bread',
    desc: 'One fresh soft family-sized sliced loaf',
    price: 1500,
    time: '15–25 min',
    category: 'Groceries',
    subcategory: 'Foodstuffs',
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=420&q=75',
    available: true,
    tags: ['bread', 'loaf', 'toast', 'breakfast'],
  },
  {
    id: 'noodles',
    name: 'Instant noodles · 5 pack',
    desc: 'Quick late-night hostel study pack (chicken flavour)',
    price: 2000,
    time: '15–25 min',
    category: 'Groceries',
    subcategory: 'Foodstuffs',
    image: 'https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?auto=format&fit=crop&w=420&q=75',
    available: true,
    tags: ['noodles', 'indomie', 'ramen', 'pack'],
  },

  // Groceries > Beverages
  {
    id: 'milk',
    name: 'Milk · 1 litre',
    desc: 'Full cream UHT liquid milk for cereal, tea & coffee',
    price: 2200,
    time: '15–25 min',
    category: 'Groceries',
    subcategory: 'Beverages',
    image: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=420&q=75',
    available: true,
    tags: ['milk', 'dairy', 'beverage', 'cereal'],
  },
  {
    id: 'water',
    name: 'Bottled water · 12 pack (75cl)',
    desc: 'Pure table water shrink-pack delivered to your hostel door',
    price: 2400,
    time: '15–30 min',
    category: 'Groceries',
    subcategory: 'Beverages',
    image: 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?auto=format&fit=crop&w=420&q=75',
    available: true,
    tags: ['water', 'bottled water', 'drink', 'pack'],
  },

  // Groceries > Snacks
  {
    id: 'plantain_chips',
    name: 'Crunchy plantain chips & peanuts',
    desc: 'Lightly salted ripe plantain chips + roasted groundnuts combo',
    price: 1200,
    time: '15–20 min',
    category: 'Groceries',
    subcategory: 'Snacks',
    image: 'https://images.unsplash.com/photo-1599490659213-e2b9527bd087?auto=format&fit=crop&w=420&q=75',
    available: true,
    tags: ['chips', 'plantain', 'snacks', 'peanuts', 'biscuits'],
  },

  // Groceries > Household Essentials
  {
    id: 'detergent',
    name: 'Laundry detergent & tissue pack',
    desc: '900g washing powder + 4-roll soft bathroom tissue bundle',
    price: 3400,
    time: '20–30 min',
    category: 'Groceries',
    subcategory: 'Household Essentials',
    image: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=420&q=75',
    available: true,
    tags: ['detergent', 'soap', 'tissue', 'toiletries', 'household'],
  },

  // Groceries > Personal Care
  {
    id: 'care_kit',
    name: 'Body wash & toothpaste essentials',
    desc: 'Refreshing moisturizing shower gel + fluoride toothpaste',
    price: 3800,
    time: '20–30 min',
    category: 'Groceries',
    subcategory: 'Personal Care',
    image: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?auto=format&fit=crop&w=420&q=75',
    available: true,
    tags: ['body wash', 'toothpaste', 'soap', 'personal care', 'hygiene'],
  },
];

export const DEFAULT_LAUNDRY_SERVICES: LaundryServiceItem[] = [
  {
    id: 'wash',
    name: 'Wash & Fold',
    description: 'Everyday clothes, washed and folded.',
    price: 1500,
    path: 'M4 3h16v18H4z M4 7h16 M8 5h1 M12 5h1 M17 14a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
    available: true,
  },
  {
    id: 'iron',
    name: 'Ironing',
    description: 'Professionally pressed, wrinkle-free clothes.',
    price: 1000,
    path: 'M3 18h18l-3-9H9l-6 9Z M9 9V5h7 M3 21h18 M12 13h4',
    available: true,
  },
  {
    id: 'dry',
    name: 'Dry Cleaning',
    description: 'Special care for delicate clothing.',
    price: 2500,
    path: 'm8 3-5 4 3 5 2-1v10h8V11l2 1 3-5-5-4c0 4-8 4-8 0Z',
    available: true,
  },
  {
    id: 'bedding',
    name: 'Bedsheet / Duvet',
    description: 'Bedding and larger laundry items.',
    price: 3000,
    path: 'M3 18V7h18v11 M3 12h18 M6 7V4h12v3 M3 18h18 M5 18v3 M19 18v3',
    available: true,
  },
];

export const DEFAULT_CAMPUS_ZONES: CampusZone[] = [
  {
    id: 'wigwe',
    name: 'Wigwe University',
    foodDeliveryFee: 600,
    laundryPickupFee: 1000,
    parcelBaseFee: 700,
    estimatedEta: '15–25 min',
    active: true,
  },
  {
    id: 'uniport',
    name: 'University of Port Harcourt',
    foodDeliveryFee: 800,
    laundryPickupFee: 1000,
    parcelBaseFee: 900,
    estimatedEta: '25–35 min',
    active: true,
  },
  {
    id: 'rsu',
    name: 'Rivers State University',
    foodDeliveryFee: 800,
    laundryPickupFee: 1200,
    parcelBaseFee: 900,
    estimatedEta: '25–40 min',
    active: true,
  },
];

export const DEFAULT_PAYMENT_CONFIG: PlatformPaymentConfig = {
  paymentMode: 'demo',
  bankName: 'Moniepoint MFB (Nova Campus)',
  accountName: 'NOVA DELIVERY TECHNOLOGIES',
  accountNumber: '8140029384',
  supportPhone: '+234 803 000 6682',
  allowPayOnDelivery: true,
  adminPin: import.meta.env.VITE_ADMIN_PIN || '2026',
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  voiceEnabled: true,
  wakeWordEnabled: false,
  allowHeyNova: true,
  allowHiNova: true,
  customWakePhrase: '',
  wakeChimeEnabled: true,
  voiceReplyTts: false,
  voiceLanguage: 'en-NG',
  autoSendVoice: true,

  storeConversationsOnDevice: true,
  maxStoredConversations: 10,
  maxMessagesPerConversation: 60,

  preferLocalNlpFirst: true,
  devGeminiApiKey: '',
};

export interface BrowseNode {
  id: string;
  label: string;
  root: 'Food' | 'Groceries';
  parent?: string;
  text: string;
  children?: string[];
  subcategory?: string;
}

export const BROWSE_NODES: Record<string, BrowseNode> = {
  food: {
    id: 'food',
    label: 'Food',
    root: 'Food',
    text: 'Hungry? Choose a food category below, or tell me exactly what you are craving.',
    children: ['food/dishes', 'food/fastfood', 'food/snacks', 'food/drinks'],
  },
  'food/dishes': {
    id: 'food/dishes',
    label: 'Ready-Made Dishes',
    root: 'Food',
    parent: 'food',
    subcategory: 'Ready-Made Dishes',
    text: 'Here are freshly prepared meals ready for campus delivery.',
  },
  'food/fastfood': {
    id: 'food/fastfood',
    label: 'Fast Food',
    root: 'Food',
    parent: 'food',
    subcategory: 'Fast Food',
    text: 'Quick bites, wraps, and burgers made hot to order.',
  },
  'food/snacks': {
    id: 'food/snacks',
    label: 'Snacks & Pastries',
    root: 'Food',
    parent: 'food',
    subcategory: 'Snacks & Pastries',
    text: 'Warm pastries and light snacks for your day.',
  },
  'food/drinks': {
    id: 'food/drinks',
    label: 'Smoothies & Drinks',
    root: 'Food',
    parent: 'food',
    subcategory: 'Smoothies & Drinks',
    text: 'Refreshing smoothies and chilled drinks.',
  },
  groceries: {
    id: 'groceries',
    label: 'Groceries',
    root: 'Groceries',
    text: 'Need to restock your hostel room? Pick a grocery aisle or tell me your list.',
    children: [
      'groceries/foodstuffs',
      'groceries/beverages',
      'groceries/snacks',
      'groceries/household',
      'groceries/personal',
    ],
  },
  'groceries/foodstuffs': {
    id: 'groceries/foodstuffs',
    label: 'Foodstuffs',
    root: 'Groceries',
    parent: 'groceries',
    subcategory: 'Foodstuffs',
    text: 'Everyday foodstuffs and hostel kitchen staples.',
  },
  'groceries/beverages': {
    id: 'groceries/beverages',
    label: 'Beverages',
    root: 'Groceries',
    parent: 'groceries',
    subcategory: 'Beverages',
    text: 'Milk, bottled water packs, and daily beverages.',
  },
  'groceries/snacks': {
    id: 'groceries/snacks',
    label: 'Snacks',
    root: 'Groceries',
    parent: 'groceries',
    subcategory: 'Snacks',
    text: 'Crunchy snacks and study fuel.',
  },
  'groceries/household': {
    id: 'groceries/household',
    label: 'Household Essentials',
    root: 'Groceries',
    parent: 'groceries',
    subcategory: 'Household Essentials',
    text: 'Detergent, tissues, and room cleaning essentials.',
  },
  'groceries/personal': {
    id: 'groceries/personal',
    label: 'Personal Care',
    root: 'Groceries',
    parent: 'groceries',
    subcategory: 'Personal Care',
    text: 'Personal hygiene and daily care essentials.',
  },
};

export const formatNaira = (amount: number): string =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(amount);

export const isValidNigerianPhone = (value: string): boolean =>
  /^(?:0|\+?234)[789][01]\d{8}$/.test(value.replace(/[\s()-]/g, ''));
