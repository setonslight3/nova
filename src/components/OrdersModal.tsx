import React from 'react';
import { CheckCircle2, Clock, Package, ShieldAlert, Truck, X } from 'lucide-react';
import { formatNaira } from '../data/defaultCatalog';
import { formatOrderStatus } from '../lib/supabase';
import { NovaOrder, OrderStatus } from '../types/nova';

interface OrdersModalProps {
  open: boolean;
  orders: NovaOrder[];
  onClose: () => void;
}

const PIPELINE: OrderStatus[] = [
  'pending_verification',
  'confirmed',
  'preparing',
  'out_for_delivery',
  'delivered',
];

export const OrdersModal: React.FC<OrdersModalProps> = ({ open, orders, onClose }) => {
  if (!open) return null;

  return (
    <div
      className="nova-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="My Orders"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="nova-modal orders-modal">
        <div className="nova-modal-header">
          <div>
            <h2>My Orders & Live Tracking</h2>
            <p className="modal-subtitle">
              Track payment verification and campus dispatch status
            </p>
          </div>
          <button type="button" className="round" onClick={onClose} aria-label="Close orders">
            <X size={18} />
          </button>
        </div>

        <div className="nova-modal-body">
          {!orders.length ? (
            <div className="empty-orders-box">
              <Package size={36} />
              <p>No orders submitted yet. Ask Nova for food, groceries, laundry, or parcel pickup!</p>
            </div>
          ) : (
            <div className="orders-list">
              {orders.map((order) => {
                const stepIdx = PIPELINE.indexOf(order.status);
                return (
                  <article className="order-track-card" key={order.id}>
                    <div className="order-track-top">
                      <div>
                        <span className="order-code-badge">{order.orderCode}</span>
                        <span className="order-service-tag">{order.serviceType}</span>
                      </div>
                      <span className={`order-status-pill status-${order.status}`}>
                        {order.status === 'delivered' ? (
                          <CheckCircle2 size={13} />
                        ) : order.status === 'out_for_delivery' ? (
                          <Truck size={13} />
                        ) : order.status === 'cancelled' ? (
                          <ShieldAlert size={13} />
                        ) : (
                          <Clock size={13} />
                        )}
                        {formatOrderStatus(order.status)}
                      </span>
                    </div>

                    {order.status !== 'cancelled' && (
                      <div className="order-progress-track" aria-hidden="true">
                        {PIPELINE.map((st, idx) => (
                          <div
                            key={st}
                            className={
                              'progress-dot' + (idx <= stepIdx ? ' completed' : '')
                            }
                            title={formatOrderStatus(st)}
                          />
                        ))}
                      </div>
                    )}

                    <div className="order-items-mini">
                      {order.items.map((item, i) => (
                        <span key={i}>
                          {item.quantity} × {item.name}
                        </span>
                      ))}
                    </div>

                    <div className="order-meta-grid">
                      <div>
                        <small>Location</small>
                        <p>
                          {order.serviceType === 'Parcel Pickup'
                            ? `${order.pickupAddress} → ${order.dropoffAddress}`
                            : `${order.university} · ${order.campusAddress}`}
                        </p>
                      </div>
                      <div>
                        <small>Total & Payment</small>
                        <p>
                          <strong>{formatNaira(order.total)}</strong> ·{' '}
                          {order.paymentMethod === 'pay_on_delivery'
                            ? 'Pay on Delivery'
                            : order.paymentVerified
                            ? 'Payment Verified ✓'
                            : 'Receipt Under Review'}
                        </p>
                      </div>
                    </div>

                    {order.riderName && (
                      <div className="order-rider-banner">
                        <Truck size={15} />
                        <span>
                          Assigned Rider: <strong>{order.riderName}</strong>
                          {order.riderPhone ? ` (${order.riderPhone})` : ''}
                        </span>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
