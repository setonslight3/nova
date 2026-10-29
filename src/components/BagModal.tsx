import React from 'react';
import { X } from 'lucide-react';
import { formatNaira } from '../data/defaultCatalog';
import { Product } from '../types/nova';

interface BagModalProps {
  open: boolean;
  products: Product[];
  bag: Record<string, number>;
  onClose: () => void;
  onChangeQuantity: (id: string, delta: number, e?: React.MouseEvent) => void;
  onRemoveItem: (id: string) => void;
  onCheckout: () => void;
  onGoStraightToPayment: () => void;
}

export const BagModal: React.FC<BagModalProps> = ({
  open,
  products,
  bag,
  onClose,
  onChangeQuantity,
  onRemoveItem,
  onCheckout,
  onGoStraightToPayment,
}) => {
  if (!open) return null;

  const lines = products.filter((p) => (bag[p.id] || 0) > 0);
  const subtotal = lines.reduce((sum, p) => sum + p.price * (bag[p.id] || 0), 0);

  return (
    <div
      className="nova-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Your shopping bag"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="nova-modal bag-modal-card">
        <div className="bag-inner">
          <div className="bag-title">
            <h2>Your bag</h2>
            <button
              type="button"
              className="round"
              onClick={onClose}
              aria-label="Close shopping bag"
            >
              <X size={18} />
            </button>
          </div>

          {!lines.length ? (
            <p className="empty">Your bag is empty. Tell Nova what you are craving!</p>
          ) : (
            <>
              <div className="bag-lines">
                {lines.map((p) => (
                  <article className="bag-line" key={p.id}>
                    <img
                      src={p.image}
                      alt={p.name}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                    <div className="bag-line-body">
                      <h3>{p.name}</h3>
                      <p>{formatNaira(p.price)} each</p>
                      <div className="quantity">
                        <button
                          type="button"
                          className="round"
                          onClick={() => onChangeQuantity(p.id, -1)}
                          aria-label={`Decrease ${p.name}`}
                        >
                          −
                        </button>
                        <span>{bag[p.id]}</span>
                        <button
                          type="button"
                          className="round"
                          onClick={(e) => onChangeQuantity(p.id, 1, e)}
                          aria-label={`Increase ${p.name}`}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          className="remove"
                          onClick={() => onRemoveItem(p.id)}
                          aria-label={`Remove ${p.name}`}
                        >
                          Remove
                        </button>
                      </div>
                      <strong>{formatNaira(p.price * bag[p.id])}</strong>
                    </div>
                  </article>
                ))}
              </div>

              <div className="bag-footer">
                <p>
                  <span>Subtotal</span>
                  <strong>{formatNaira(subtotal)}</strong>
                </p>
                <small>Campus delivery fee is calculated based on your selected university.</small>
                <div className="bag-footer-actions">
                  <button type="button" className="primary" onClick={onCheckout}>
                    Continue to Checkout →
                  </button>
                  <button
                    type="button"
                    className="secondary-solid"
                    onClick={onGoStraightToPayment}
                  >
                    Ready to Pay Now →
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
