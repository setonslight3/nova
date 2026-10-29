import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_CAMPUS_ZONES,
  DEFAULT_LAUNDRY_SERVICES,
  DEFAULT_PAYMENT_CONFIG,
  DEFAULT_PRODUCTS,
} from '../data/defaultCatalog';
import {
  CampusZone,
  LaundryServiceItem,
  NovaOrder,
  OrderStatus,
  PlatformPaymentConfig,
  Product,
} from '../types/nova';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('http') &&
    !supabaseUrl.includes('your-project-id')
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;

const PRODUCTS_STORAGE_KEY = 'nova.products.v2';
const LAUNDRY_STORAGE_KEY = 'nova.laundry_services.v2';
const ZONES_STORAGE_KEY = 'nova.campus_zones.v2';
const PAYMENT_STORAGE_KEY = 'nova.payment_config.v2';
const ORDERS_STORAGE_KEY = 'nova.orders.v2';

// ============================================================================
// PRODUCTS CATALOG
// ============================================================================
export async function fetchProductsCatalog(): Promise<Product[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase.from('products').select('*').order('created_at');
      if (!error && data && data.length > 0) {
        const mapped: Product[] = data.map((row: Record<string, unknown>) => ({
          id: String(row.id),
          name: String(row.name),
          desc: String(row.description || ''),
          servingSize: row.serving_size ? String(row.serving_size) : undefined,
          price: Number(row.price),
          originalPrice: row.original_price ? Number(row.original_price) : undefined,
          time: String(row.prep_time || '20–30 min'),
          category: row.category === 'Groceries' ? 'Groceries' : 'Food',
          subcategory: String(row.subcategory),
          image: String(row.image),
          available: Boolean(row.available ?? true),
          tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
        }));
        localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(mapped));
        return mapped;
      }
    } catch {
      // Fallback to local
    }
  }

  try {
    const saved = localStorage.getItem(PRODUCTS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // Ignore
  }
  return DEFAULT_PRODUCTS;
}

export async function saveProductsCatalog(products: Product[]): Promise<void> {
  try {
    localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(products));
  } catch {
    // Ignore
  }

  if (supabase) {
    try {
      const rows = products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.desc,
        serving_size: p.servingSize || null,
        price: p.price,
        original_price: p.originalPrice || null,
        prep_time: p.time,
        category: p.category,
        subcategory: p.subcategory,
        image: p.image,
        available: p.available,
        tags: p.tags || [],
      }));
      await supabase.from('products').upsert(rows);
    } catch {
      // Ignore network failure
    }
  }
}

// ============================================================================
// LAUNDRY SERVICES
// ============================================================================
export async function fetchLaundryServices(): Promise<LaundryServiceItem[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase.from('laundry_services').select('*');
      if (!error && data && data.length > 0) {
        const mapped: LaundryServiceItem[] = data.map((row: Record<string, unknown>) => ({
          id: String(row.id),
          name: String(row.name),
          description: String(row.description),
          price: Number(row.price),
          path: String(row.icon_path),
          available: Boolean(row.available ?? true),
        }));
        localStorage.setItem(LAUNDRY_STORAGE_KEY, JSON.stringify(mapped));
        return mapped;
      }
    } catch {
      // Fallback
    }
  }

  try {
    const saved = localStorage.getItem(LAUNDRY_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // Ignore
  }
  return DEFAULT_LAUNDRY_SERVICES;
}

export async function saveLaundryServices(services: LaundryServiceItem[]): Promise<void> {
  try {
    localStorage.setItem(LAUNDRY_STORAGE_KEY, JSON.stringify(services));
  } catch {
    // Ignore
  }

  if (supabase) {
    try {
      await supabase.from('laundry_services').upsert(
        services.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          price: s.price,
          icon_path: s.path,
          available: s.available,
        }))
      );
    } catch {
      // Ignore
    }
  }
}

// ============================================================================
// CAMPUS ZONES & FEES
// ============================================================================
export async function fetchCampusZones(): Promise<CampusZone[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase.from('campus_zones').select('*');
      if (!error && data && data.length > 0) {
        const mapped: CampusZone[] = data.map((row: Record<string, unknown>) => ({
          id: String(row.id),
          name: String(row.name),
          foodDeliveryFee: Number(row.food_delivery_fee),
          laundryPickupFee: Number(row.laundry_pickup_fee),
          parcelBaseFee: Number(row.parcel_base_fee),
          estimatedEta: String(row.estimated_eta),
          active: Boolean(row.active ?? true),
        }));
        localStorage.setItem(ZONES_STORAGE_KEY, JSON.stringify(mapped));
        return mapped;
      }
    } catch {
      // Fallback
    }
  }

  try {
    const saved = localStorage.getItem(ZONES_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // Ignore
  }
  return DEFAULT_CAMPUS_ZONES;
}

export async function saveCampusZones(zones: CampusZone[]): Promise<void> {
  try {
    localStorage.setItem(ZONES_STORAGE_KEY, JSON.stringify(zones));
  } catch {
    // Ignore
  }

  if (supabase) {
    try {
      await supabase.from('campus_zones').upsert(
        zones.map((z) => ({
          id: z.id,
          name: z.name,
          food_delivery_fee: z.foodDeliveryFee,
          laundry_pickup_fee: z.laundryPickupFee,
          parcel_base_fee: z.parcelBaseFee,
          estimated_eta: z.estimatedEta,
          active: z.active,
        }))
      );
    } catch {
      // Ignore
    }
  }
}

// ============================================================================
// PLATFORM PAYMENT CONFIG
// ============================================================================
export async function fetchPaymentConfig(): Promise<PlatformPaymentConfig> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('*')
        .eq('id', 'default')
        .maybeSingle();
      if (!error && data) {
        const mapped: PlatformPaymentConfig = {
          paymentMode: data.payment_mode === 'live' ? 'live' : 'demo',
          bankName: String(data.bank_name),
          accountName: String(data.account_name),
          accountNumber: String(data.account_number),
          supportPhone: String(data.support_phone || DEFAULT_PAYMENT_CONFIG.supportPhone),
          allowPayOnDelivery: true,
          adminPin: DEFAULT_PAYMENT_CONFIG.adminPin,
        };
        localStorage.setItem(PAYMENT_STORAGE_KEY, JSON.stringify(mapped));
        return mapped;
      }
    } catch {
      // Fallback
    }
  }

  try {
    const saved = localStorage.getItem(PAYMENT_STORAGE_KEY);
    if (saved) return { ...DEFAULT_PAYMENT_CONFIG, ...JSON.parse(saved) };
  } catch {
    // Ignore
  }
  return DEFAULT_PAYMENT_CONFIG;
}

export async function savePaymentConfig(config: PlatformPaymentConfig): Promise<void> {
  try {
    localStorage.setItem(PAYMENT_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore
  }

  if (supabase) {
    try {
      await supabase.from('platform_settings').upsert({
        id: 'default',
        payment_mode: config.paymentMode,
        bank_name: config.bankName,
        account_name: config.accountName,
        account_number: config.accountNumber,
        support_phone: config.supportPhone,
      });
    } catch {
      // Ignore
    }
  }
}

// ============================================================================
// ORDERS (CREATE, FETCH, ADMIN VERIFY & DISPATCH)
// ============================================================================
export async function fetchOrders(): Promise<NovaOrder[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        const mapped: NovaOrder[] = data.map((row: Record<string, unknown>) => ({
          id: String(row.id),
          orderCode: String(row.order_code),
          serviceType: row.service_type as NovaOrder['serviceType'],
          status: row.status as NovaOrder['status'],
          paymentMethod: row.payment_method as NovaOrder['paymentMethod'],
          paymentVerified: Boolean(row.payment_verified),
          proofFileName: row.proof_file_name ? String(row.proof_file_name) : undefined,
          proofDataUrl: row.proof_data_url ? String(row.proof_data_url) : undefined,
          items: Array.isArray(row.items) ? (row.items as NovaOrder['items']) : [],
          subtotal: Number(row.subtotal),
          deliveryFee: Number(row.delivery_fee),
          total: Number(row.total),
          university: row.university ? String(row.university) : undefined,
          campusAddress: row.campus_address ? String(row.campus_address) : undefined,
          pickupAddress: row.pickup_address ? String(row.pickup_address) : undefined,
          dropoffAddress: row.dropoff_address ? String(row.dropoff_address) : undefined,
          customerPhone: String(row.customer_phone),
          secondaryPhone: row.secondary_phone ? String(row.secondary_phone) : undefined,
          timing: row.timing === 'Scheduled' ? 'Scheduled' : 'ASAP',
          scheduledTime: row.scheduled_time ? String(row.scheduled_time) : undefined,
          notes: Array.isArray(row.notes) ? (row.notes as string[]) : [],
          riderName: row.rider_name ? String(row.rider_name) : undefined,
          riderPhone: row.rider_phone ? String(row.rider_phone) : undefined,
          createdAt: String(row.created_at),
          updatedAt: String(row.updated_at),
        }));
        localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(mapped));
        return mapped;
      }
    } catch {
      // Fallback
    }
  }

  try {
    const saved = localStorage.getItem(ORDERS_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // Ignore
  }
  return [];
}

export async function createNovaOrder(order: NovaOrder): Promise<NovaOrder[]> {
  const existing = await fetchOrders();
  const next = [order, ...existing.filter((o) => o.id !== order.id)];
  try {
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Strip old proof dataUrls if storage gets tight
    try {
      const compact = next.map((o, i) => (i > 8 ? { ...o, proofDataUrl: undefined } : o));
      localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(compact));
    } catch {
      // Ignore
    }
  }

  if (supabase) {
    try {
      await supabase.from('orders').insert({
        id: order.id,
        order_code: order.orderCode,
        service_type: order.serviceType,
        status: order.status,
        payment_method: order.paymentMethod,
        payment_verified: order.paymentVerified,
        proof_file_name: order.proofFileName || null,
        proof_data_url: order.proofDataUrl || null,
        items: order.items,
        subtotal: order.subtotal,
        delivery_fee: order.deliveryFee,
        total: order.total,
        university: order.university || null,
        campus_address: order.campusAddress || null,
        pickup_address: order.pickupAddress || null,
        dropoff_address: order.dropoffAddress || null,
        customer_phone: order.customerPhone,
        secondary_phone: order.secondaryPhone || null,
        timing: order.timing,
        scheduled_time: order.scheduledTime || null,
        notes: order.notes,
        created_at: order.createdAt,
        updated_at: order.updatedAt,
      });
    } catch {
      // Saved locally
    }
  }
  return next;
}

export async function updateNovaOrder(
  orderId: string,
  patch: Partial<Pick<NovaOrder, 'status' | 'paymentVerified' | 'riderName' | 'riderPhone'>>
): Promise<NovaOrder[]> {
  const existing = await fetchOrders();
  const now = new Date().toISOString();
  const next = existing.map((o) =>
    o.id === orderId
      ? {
          ...o,
          ...patch,
          updatedAt: now,
        }
      : o
  );
  try {
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore
  }

  if (supabase) {
    try {
      const dbPatch: Record<string, unknown> = { updated_at: now };
      if (patch.status !== undefined) dbPatch.status = patch.status;
      if (patch.paymentVerified !== undefined) dbPatch.payment_verified = patch.paymentVerified;
      if (patch.riderName !== undefined) dbPatch.rider_name = patch.riderName;
      if (patch.riderPhone !== undefined) dbPatch.rider_phone = patch.riderPhone;
      await supabase.from('orders').update(dbPatch).eq('id', orderId);
    } catch {
      // Ignore
    }
  }
  return next;
}

export function formatOrderStatus(status: OrderStatus): string {
  switch (status) {
    case 'pending_verification':
      return 'Pending Verification';
    case 'confirmed':
      return 'Confirmed';
    case 'preparing':
      return 'Preparing / Picked Up';
    case 'out_for_delivery':
      return 'Out for Delivery';
    case 'delivered':
      return 'Delivered';
    case 'cancelled':
      return 'Cancelled';
  }
}
