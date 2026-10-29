import React from 'react';
import {
  BarChart3,
  Building2,
  CheckCircle2,
  Cloud,
  CloudOff,
  Eye,
  Lock,
  Package,
  Plus,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Truck,
  X,
} from 'lucide-react';
import { formatNaira } from '../data/defaultCatalog';
import { formatOrderStatus, isSupabaseConfigured } from '../lib/supabase';
import {
  CampusZone,
  LaundryServiceItem,
  NovaOrder,
  OrderStatus,
  PlatformPaymentConfig,
  Product,
  TokenMetrics,
} from '../types/nova';

interface AdminDashboardProps {
  products: Product[];
  laundryServices: LaundryServiceItem[];
  campusZones: CampusZone[];
  paymentConfig: PlatformPaymentConfig;
  orders: NovaOrder[];
  tokenMetrics: TokenMetrics;
  onUpdateProducts: (next: Product[]) => void;
  onUpdateLaundryServices: (next: LaundryServiceItem[]) => void;
  onUpdateCampusZones: (next: CampusZone[]) => void;
  onUpdatePaymentConfig: (next: PlatformPaymentConfig) => void;
  onUpdateOrder: (
    orderId: string,
    patch: Partial<Pick<NovaOrder, 'status' | 'paymentVerified' | 'riderName' | 'riderPhone'>>
  ) => void;
  onRefreshOrders: () => void;
  onExitAdmin: () => void;
}

const FOOD_SUBCATEGORIES = [
  'Ready-Made Dishes',
  'Fast Food',
  'Snacks & Pastries',
  'Smoothies & Drinks',
];

const GROCERY_SUBCATEGORIES = [
  'Foodstuffs',
  'Beverages',
  'Snacks',
  'Household Essentials',
  'Personal Care',
];

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  products,
  laundryServices,
  campusZones,
  paymentConfig,
  orders,
  tokenMetrics,
  onUpdateProducts,
  onUpdateLaundryServices,
  onUpdateCampusZones,
  onUpdatePaymentConfig,
  onUpdateOrder,
  onRefreshOrders,
  onExitAdmin,
}) => {
  const [unlocked, setUnlocked] = React.useState<boolean>(() => {
    return sessionStorage.getItem('nova.admin.unlocked') === '1';
  });
  const [pinInput, setPinInput] = React.useState('');
  const [pinError, setPinError] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<
    'overview' | 'orders' | 'catalog' | 'zones'
  >('overview');

  // Orders filter
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [previewProofOrder, setPreviewProofOrder] = React.useState<NovaOrder | null>(null);

  // New Product form
  const [showAddProduct, setShowAddProduct] = React.useState(false);
  const [newProd, setNewProd] = React.useState({
    name: '',
    desc: '',
    price: '2500',
    originalPrice: '',
    time: '20–30 min',
    category: 'Food' as 'Food' | 'Groceries',
    subcategory: 'Ready-Made Dishes',
    image:
      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=420&q=75',
  });

  // New Campus form
  const [newZoneName, setNewZoneName] = React.useState('');

  if (!unlocked) {
    return (
      <main className="admin-lock-screen">
        <form
          className="admin-lock-card"
          onSubmit={(e) => {
            e.preventDefault();
            if (pinInput.trim() === (paymentConfig.adminPin || '2026')) {
              sessionStorage.setItem('nova.admin.unlocked', '1');
              setUnlocked(true);
              setPinError('');
            } else {
              setPinError('Incorrect Admin PIN. (Default preview PIN: 2026)');
            }
          }}
        >
          <div className="lock-icon-circle">
            <Lock size={22} />
          </div>
          <h1>Nova Admin Portal</h1>
          <p>Enter your operator PIN to manage orders, verify receipts, and edit pricing.</p>
          <input
            type="password"
            placeholder="Enter Admin PIN (default: 2026)"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            autoFocus
          />
          {pinError && <small className="field-error">{pinError}</small>}
          <div className="lock-actions">
            <button type="button" className="laundry-back" onClick={onExitAdmin}>
              Back to Store
            </button>
            <button type="submit" className="primary">
              Unlock Dashboard →
            </button>
          </div>
        </form>
      </main>
    );
  }

  const validOrders = orders.filter((o) => o.status !== 'cancelled');
  const totalRevenue = validOrders.reduce((sum, o) => sum + o.total, 0);
  const pendingVerifications = orders.filter(
    (o) => o.status === 'pending_verification' && !o.paymentVerified
  ).length;
  const activeDeliveries = orders.filter((o) =>
    ['confirmed', 'preparing', 'out_for_delivery'].includes(o.status)
  ).length;

  const filteredOrders = orders.filter((o) => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        o.orderCode.toLowerCase().includes(q) ||
        o.customerPhone.toLowerCase().includes(q) ||
        (o.university || '').toLowerCase().includes(q) ||
        (o.campusAddress || '').toLowerCase().includes(q) ||
        o.serviceType.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleAddProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProd.name.trim() || !Number(newProd.price)) return;
    const id =
      newProd.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '') +
      '_' +
      Date.now().toString().slice(-3);

    const created: Product = {
      id,
      name: newProd.name.trim(),
      desc: newProd.desc.trim() || newProd.name.trim(),
      price: Math.max(0, Math.round(Number(newProd.price))),
      originalPrice: newProd.originalPrice ? Math.round(Number(newProd.originalPrice)) : undefined,
      time: newProd.time.trim() || '20–30 min',
      category: newProd.category,
      subcategory: newProd.subcategory,
      image: newProd.image.trim(),
      available: true,
      tags: newProd.name.toLowerCase().split(/\s+/),
    };
    onUpdateProducts([created, ...products]);
    setNewProd({ ...newProd, name: '', desc: '', originalPrice: '' });
    setShowAddProduct(false);
  };

  const handleAddZone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newZoneName.trim()) return;
    const zone: CampusZone = {
      id: 'zone_' + Date.now().toString(36),
      name: newZoneName.trim(),
      foodDeliveryFee: 800,
      laundryPickupFee: 1000,
      parcelBaseFee: 900,
      estimatedEta: '25–35 min',
      active: true,
    };
    onUpdateCampusZones([...campusZones, zone]);
    setNewZoneName('');
  };

  return (
    <main className="admin-dashboard">
      <div className="admin-topbar">
        <div>
          <h1>Nova Operations & Admin Dashboard</h1>
          <p className="admin-subtitle">
            {isSupabaseConfigured ? (
              <span className="sync-pill cloud">
                <Cloud size={13} /> Connected to Supabase Cloud
              </span>
            ) : (
              <span className="sync-pill local">
                <CloudOff size={13} /> Local Device Store (Ready for Supabase keys)
              </span>
            )}
            <span className="mode-pill">
              Payment Mode: <strong>{paymentConfig.paymentMode.toUpperCase()}</strong>
            </span>
          </p>
        </div>

        <div className="admin-topbar-actions">
          <button type="button" className="secondary-outline" onClick={onRefreshOrders}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            type="button"
            className="secondary-outline"
            onClick={() => {
              sessionStorage.removeItem('nova.admin.unlocked');
              setUnlocked(false);
            }}
          >
            <Lock size={14} /> Lock
          </button>
        </div>
      </div>

      <nav className="admin-nav-tabs" aria-label="Admin sections">
        <button
          type="button"
          className={activeTab === 'overview' ? 'active' : ''}
          onClick={() => setActiveTab('overview')}
        >
          <BarChart3 size={16} /> Overview
        </button>
        <button
          type="button"
          className={activeTab === 'orders' ? 'active' : ''}
          onClick={() => setActiveTab('orders')}
        >
          <Package size={16} /> Orders & Proofs ({orders.length})
        </button>
        <button
          type="button"
          className={activeTab === 'catalog' ? 'active' : ''}
          onClick={() => setActiveTab('catalog')}
        >
          <ShoppingBag size={16} /> Products & Laundry ({products.length})
        </button>
        <button
          type="button"
          className={activeTab === 'zones' ? 'active' : ''}
          onClick={() => setActiveTab('zones')}
        >
          <Building2 size={16} /> Campuses & Banking
        </button>
      </nav>

      {activeTab === 'overview' && (
        <section className="admin-section">
          <div className="admin-kpi-grid">
            <article className="kpi-card">
              <span>Gross Order Value</span>
              <strong>{formatNaira(totalRevenue)}</strong>
              <small>{validOrders.length} active/completed orders</small>
            </article>
            <article className="kpi-card warning">
              <span>Pending Proof Verification</span>
              <strong>{pendingVerifications}</strong>
              <small>Bank transfers awaiting review</small>
            </article>
            <article className="kpi-card">
              <span>Active Campus Dispatches</span>
              <strong>{activeDeliveries}</strong>
              <small>Preparing or out with riders</small>
            </article>
            <article className="kpi-card accent">
              <span>AI Tokens Saved (Hybrid NLP)</span>
              <strong>{tokenMetrics.estimatedTokensSaved.toLocaleString()}</strong>
              <small>
                {tokenMetrics.localNlpCount} local NLP · {tokenMetrics.geminiCallCount} Gemini
              </small>
            </article>
          </div>

          <div className="admin-overview-panels">
            <div className="admin-panel-card">
              <h3>Orders by Service</h3>
              <div className="service-breakdown-list">
                {(['Food', 'Groceries', 'Laundry', 'Parcel Pickup'] as const).map((svc) => {
                  const svcOrders = validOrders.filter((o) => o.serviceType === svc);
                  const svcTotal = svcOrders.reduce((s, o) => s + o.total, 0);
                  return (
                    <div className="breakdown-row" key={svc}>
                      <span>{svc}</span>
                      <span>{svcOrders.length} orders</span>
                      <strong>{formatNaira(svcTotal)}</strong>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="admin-panel-card">
              <h3>Recent Activity</h3>
              {!orders.length ? (
                <p className="muted-note">
                  No orders yet. Place a test order in the Customer view to verify payment &
                  dispatch flows here!
                </p>
              ) : (
                <div className="recent-orders-mini">
                  {orders.slice(0, 5).map((o) => (
                    <div className="breakdown-row" key={o.id}>
                      <span>
                        <strong>{o.orderCode}</strong> · {o.serviceType}
                      </span>
                      <span>{formatOrderStatus(o.status)}</span>
                      <strong>{formatNaira(o.total)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {activeTab === 'orders' && (
        <section className="admin-section">
          <div className="admin-filters-bar">
            <input
              type="search"
              placeholder="Search order code (#NV-...), phone, or university..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="pending_verification">Pending Verification</option>
              <option value="confirmed">Confirmed</option>
              <option value="preparing">Preparing / Picked Up</option>
              <option value="out_for_delivery">Out for Delivery</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {!filteredOrders.length ? (
            <div className="admin-panel-card">
              <p className="muted-note">No orders match the current filter.</p>
            </div>
          ) : (
            <div className="admin-orders-stack">
              {filteredOrders.map((order) => (
                <article className="admin-order-card" key={order.id}>
                  <div className="admin-order-header">
                    <div>
                      <strong className="order-code-badge">{order.orderCode}</strong>
                      <span className="order-service-tag">{order.serviceType}</span>
                      <small className="order-timestamp">
                        {new Date(order.createdAt).toLocaleString()}
                      </small>
                    </div>
                    <strong className="admin-order-amount">{formatNaira(order.total)}</strong>
                  </div>

                  <div className="admin-order-grid">
                    <div>
                      <small>Items / Description</small>
                      <ul className="admin-item-list">
                        {order.items.map((it, idx) => (
                          <li key={idx}>
                            {it.quantity} × {it.name} ({formatNaira(it.totalPrice)})
                          </li>
                        ))}
                      </ul>
                      {order.notes.length > 0 && (
                        <p className="admin-order-notes">
                          Notes: {order.notes.join(' | ')}
                        </p>
                      )}
                    </div>

                    <div>
                      <small>Customer & Destination</small>
                      <p>
                        {order.serviceType === 'Parcel Pickup' ? (
                          <>
                            <strong>From:</strong> {order.pickupAddress} ({order.customerPhone})
                            <br />
                            <strong>To:</strong> {order.dropoffAddress} ({order.secondaryPhone})
                          </>
                        ) : (
                          <>
                            <strong>{order.university}</strong>
                            <br />
                            {order.campusAddress}
                            <br />
                            Phone: {order.customerPhone}
                          </>
                        )}
                      </p>
                      <small>
                        Timing:{' '}
                        {order.timing === 'Scheduled'
                          ? order.scheduledTime?.replace('T', ' at ')
                          : 'ASAP'}
                      </small>
                    </div>

                    <div>
                      <small>Payment & Proof</small>
                      <p>
                        Method:{' '}
                        <strong>
                          {order.paymentMethod === 'pay_on_delivery'
                            ? 'Pay on Delivery'
                            : 'Bank Transfer'}
                        </strong>
                      </p>
                      {order.proofFileName && (
                        <div className="admin-proof-actions">
                          {order.proofDataUrl && (
                            <button
                              type="button"
                              className="mini-btn"
                              onClick={() => setPreviewProofOrder(order)}
                            >
                              <Eye size={13} /> View Receipt ({order.proofFileName})
                            </button>
                          )}
                        </div>
                      )}
                      {!order.paymentVerified ? (
                        <button
                          type="button"
                          className="verify-btn"
                          onClick={() =>
                            onUpdateOrder(order.id, {
                              paymentVerified: true,
                              status:
                                order.status === 'pending_verification'
                                  ? 'confirmed'
                                  : order.status,
                            })
                          }
                        >
                          <CheckCircle2 size={14} /> Verify Payment & Confirm
                        </button>
                      ) : (
                        <span className="verified-tag">
                          <CheckCircle2 size={14} /> Payment Verified
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="admin-dispatch-bar">
                    <label>
                      Order Status
                      <select
                        value={order.status}
                        onChange={(e) =>
                          onUpdateOrder(order.id, {
                            status: e.target.value as OrderStatus,
                          })
                        }
                      >
                        <option value="pending_verification">Pending Verification</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="preparing">Preparing / Picked Up</option>
                        <option value="out_for_delivery">Out for Delivery</option>
                        <option value="delivered">Delivered</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </label>

                    <label>
                      <Truck size={13} /> Rider Name
                      <input
                        type="text"
                        placeholder="Assign rider name"
                        defaultValue={order.riderName || ''}
                        onBlur={(e) =>
                          onUpdateOrder(order.id, { riderName: e.target.value.trim() })
                        }
                      />
                    </label>

                    <label>
                      Rider Phone
                      <input
                        type="tel"
                        placeholder="080..."
                        defaultValue={order.riderPhone || ''}
                        onBlur={(e) =>
                          onUpdateOrder(order.id, { riderPhone: e.target.value.trim() })
                        }
                      />
                    </label>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'catalog' && (
        <section className="admin-section">
          <div className="admin-section-header">
            <h3>Food & Groceries Products ({products.length})</h3>
            <button
              type="button"
              className="primary admin-add-btn"
              onClick={() => setShowAddProduct((v) => !v)}
            >
              <Plus size={16} /> {showAddProduct ? 'Cancel' : 'Add Product'}
            </button>
          </div>

          {showAddProduct && (
            <form className="admin-panel-card add-product-form" onSubmit={handleAddProduct}>
              <h4>Create New Product</h4>
              <div className="admin-form-grid">
                <label>
                  Product Name
                  <input
                    type="text"
                    required
                    placeholder="e.g. Grilled turkey & plantain"
                    value={newProd.name}
                    onChange={(e) => setNewProd({ ...newProd, name: e.target.value })}
                  />
                </label>
                <label>
                  Category
                  <select
                    value={newProd.category}
                    onChange={(e) => {
                      const cat = e.target.value as 'Food' | 'Groceries';
                      setNewProd({
                        ...newProd,
                        category: cat,
                        subcategory:
                          cat === 'Food' ? FOOD_SUBCATEGORIES[0] : GROCERY_SUBCATEGORIES[0],
                      });
                    }}
                  >
                    <option value="Food">Food</option>
                    <option value="Groceries">Groceries</option>
                  </select>
                </label>
                <label>
                  Subcategory
                  <select
                    value={newProd.subcategory}
                    onChange={(e) =>
                      setNewProd({ ...newProd, subcategory: e.target.value })
                    }
                  >
                    {(newProd.category === 'Food'
                      ? FOOD_SUBCATEGORIES
                      : GROCERY_SUBCATEGORIES
                    ).map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Price (₦)
                  <input
                    type="number"
                    min={100}
                    required
                    value={newProd.price}
                    onChange={(e) => setNewProd({ ...newProd, price: e.target.value })}
                  />
                </label>
                <label>
                  Original Price (₦, optional discount)
                  <input
                    type="number"
                    placeholder="e.g. 4000"
                    value={newProd.originalPrice}
                    onChange={(e) =>
                      setNewProd({ ...newProd, originalPrice: e.target.value })
                    }
                  />
                </label>
                <label>
                  Prep / Delivery Estimate
                  <input
                    type="text"
                    value={newProd.time}
                    onChange={(e) => setNewProd({ ...newProd, time: e.target.value })}
                  />
                </label>
                <label className="span-2">
                  Description / Serving Info
                  <input
                    type="text"
                    placeholder="Short serving description"
                    value={newProd.desc}
                    onChange={(e) => setNewProd({ ...newProd, desc: e.target.value })}
                  />
                </label>
                <label className="span-2">
                  Image URL
                  <input
                    type="url"
                    value={newProd.image}
                    onChange={(e) => setNewProd({ ...newProd, image: e.target.value })}
                  />
                </label>
              </div>
              <button type="submit" className="primary admin-save-btn">
                Save Product to Catalog
              </button>
            </form>
          )}

          <div className="admin-table-card">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th>Price (₦)</th>
                  <th>ETA</th>
                  <th>Stock</th>
                </tr>
              </thead>
              <tbody>
                {products.map((prod) => (
                  <tr key={prod.id}>
                    <td>
                      <strong>{prod.name}</strong>
                      <small>{prod.desc}</small>
                    </td>
                    <td>
                      {prod.category} › {prod.subcategory}
                    </td>
                    <td>
                      <input
                        type="number"
                        className="inline-price-input"
                        value={prod.price}
                        onChange={(e) => {
                          const val = Math.max(0, Number(e.target.value) || 0);
                          onUpdateProducts(
                            products.map((p) => (p.id === prod.id ? { ...p, price: val } : p))
                          );
                        }}
                      />
                    </td>
                    <td>{prod.time}</td>
                    <td>
                      <button
                        type="button"
                        className={
                          'stock-toggle ' + (prod.available ? 'in-stock' : 'out-stock')
                        }
                        onClick={() =>
                          onUpdateProducts(
                            products.map((p) =>
                              p.id === prod.id ? { ...p, available: !p.available } : p
                            )
                          )
                        }
                      >
                        {prod.available ? 'In Stock' : 'Sold Out'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="mt-section">Laundry Service Rates (₦ / item)</h3>
          <div className="admin-kpi-grid">
            {laundryServices.map((svc) => (
              <div className="admin-panel-card" key={svc.id}>
                <strong>{svc.name}</strong>
                <p className="muted-note">{svc.description}</p>
                <label className="setting-input-label">
                  Rate per item (₦)
                  <input
                    type="number"
                    min={100}
                    value={svc.price}
                    onChange={(e) => {
                      const val = Math.max(0, Number(e.target.value) || 0);
                      onUpdateLaundryServices(
                        laundryServices.map((s) =>
                          s.id === svc.id ? { ...s, price: val } : s
                        )
                      );
                    }}
                  />
                </label>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'zones' && (
        <section className="admin-section">
          <div className="admin-overview-panels">
            <div className="admin-panel-card">
              <h3>Bank Transfer & Payment Settings</h3>
              <label className="setting-input-label">
                Payment Mode
                <select
                  value={paymentConfig.paymentMode}
                  onChange={(e) =>
                    onUpdatePaymentConfig({
                      ...paymentConfig,
                      paymentMode: e.target.value === 'live' ? 'live' : 'demo',
                    })
                  }
                >
                  <option value="demo">Demo Mode (Shows Demo badge)</option>
                  <option value="live">Live Production Banking</option>
                </select>
              </label>

              <label className="setting-input-label">
                Bank Name
                <input
                  type="text"
                  value={paymentConfig.bankName}
                  onChange={(e) =>
                    onUpdatePaymentConfig({ ...paymentConfig, bankName: e.target.value })
                  }
                />
              </label>

              <label className="setting-input-label">
                Account Name
                <input
                  type="text"
                  value={paymentConfig.accountName}
                  onChange={(e) =>
                    onUpdatePaymentConfig({ ...paymentConfig, accountName: e.target.value })
                  }
                />
              </label>

              <label className="setting-input-label">
                Account Number
                <input
                  type="text"
                  value={paymentConfig.accountNumber}
                  onChange={(e) =>
                    onUpdatePaymentConfig({
                      ...paymentConfig,
                      accountNumber: e.target.value,
                    })
                  }
                />
              </label>

              <div className="setting-toggle-row">
                <div>
                  <strong>Allow Pay on Delivery / Pickup</strong>
                  <p>Let students choose cash/POS/transfer upon rider arrival.</p>
                </div>
                <input
                  type="checkbox"
                  checked={paymentConfig.allowPayOnDelivery}
                  onChange={(e) =>
                    onUpdatePaymentConfig({
                      ...paymentConfig,
                      allowPayOnDelivery: e.target.checked,
                    })
                  }
                />
              </div>

              <label className="setting-input-label">
                Admin Portal PIN
                <input
                  type="text"
                  value={paymentConfig.adminPin}
                  onChange={(e) =>
                    onUpdatePaymentConfig({ ...paymentConfig, adminPin: e.target.value })
                  }
                />
              </label>
            </div>

            <div className="admin-panel-card">
              <h3>Campus Delivery Zones & Service Fees</h3>
              <div className="zones-editor-list">
                {campusZones.map((zone) => (
                  <div className="zone-edit-box" key={zone.id}>
                    <div className="zone-edit-top">
                      <strong>{zone.name}</strong>
                      <label className="wake-check">
                        <input
                          type="checkbox"
                          checked={zone.active}
                          onChange={(e) =>
                            onUpdateCampusZones(
                              campusZones.map((z) =>
                                z.id === zone.id ? { ...z, active: e.target.checked } : z
                              )
                            )
                          }
                        />
                        <span>Active</span>
                      </label>
                    </div>
                    <div className="zone-fees-row">
                      <label>
                        Food Fee (₦)
                        <input
                          type="number"
                          value={zone.foodDeliveryFee}
                          onChange={(e) =>
                            onUpdateCampusZones(
                              campusZones.map((z) =>
                                z.id === zone.id
                                  ? { ...z, foodDeliveryFee: Number(e.target.value) || 0 }
                                  : z
                              )
                            )
                          }
                        />
                      </label>
                      <label>
                        Laundry Fee (₦)
                        <input
                          type="number"
                          value={zone.laundryPickupFee}
                          onChange={(e) =>
                            onUpdateCampusZones(
                              campusZones.map((z) =>
                                z.id === zone.id
                                  ? { ...z, laundryPickupFee: Number(e.target.value) || 0 }
                                  : z
                              )
                            )
                          }
                        />
                      </label>
                      <label>
                        Parcel Fee (₦)
                        <input
                          type="number"
                          value={zone.parcelBaseFee}
                          onChange={(e) =>
                            onUpdateCampusZones(
                              campusZones.map((z) =>
                                z.id === zone.id
                                  ? { ...z, parcelBaseFee: Number(e.target.value) || 0 }
                                  : z
                              )
                            )
                          }
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <form className="add-zone-inline" onSubmit={handleAddZone}>
                <input
                  type="text"
                  placeholder="Add new campus (e.g. Covenant University)"
                  value={newZoneName}
                  onChange={(e) => setNewZoneName(e.target.value)}
                />
                <button type="submit" className="secondary-solid">
                  <Plus size={15} /> Add Campus
                </button>
              </form>
            </div>
          </div>
        </section>
      )}

      {previewProofOrder && (
        <div
          className="nova-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewProofOrder(null);
          }}
        >
          <div className="nova-modal proof-lightbox">
            <div className="nova-modal-header">
              <div>
                <h2>Payment Proof — {previewProofOrder.orderCode}</h2>
                <p className="modal-subtitle">{previewProofOrder.proofFileName}</p>
              </div>
              <button
                type="button"
                className="round"
                onClick={() => setPreviewProofOrder(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="proof-lightbox-body">
              {previewProofOrder.proofDataUrl?.startsWith('data:application/pdf') ? (
                <iframe
                  src={previewProofOrder.proofDataUrl}
                  title="PDF Payment Receipt"
                  className="proof-pdf-frame"
                />
              ) : (
                <img
                  src={previewProofOrder.proofDataUrl}
                  alt="Payment receipt"
                  className="proof-full-img"
                />
              )}
            </div>
            <div className="camera-controls">
              <button
                type="button"
                className="primary"
                onClick={() => {
                  onUpdateOrder(previewProofOrder.id, {
                    paymentVerified: true,
                    status:
                      previewProofOrder.status === 'pending_verification'
                        ? 'confirmed'
                        : previewProofOrder.status,
                  });
                  setPreviewProofOrder(null);
                }}
              >
                <Sparkles size={16} /> Verify Payment & Confirm Order
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
