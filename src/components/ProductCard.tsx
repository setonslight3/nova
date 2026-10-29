import React from 'react';
import { Clock } from 'lucide-react';
import { formatNaira } from '../data/defaultCatalog';
import { Product } from '../types/nova';

interface ProductCardProps {
  product: Product;
  quantity: number;
  onChangeQuantity: (id: string, delta: number, e?: React.MouseEvent) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  quantity,
  onChangeQuantity,
}) => {
  const [imgVisible, setImgVisible] = React.useState(true);
  const hasSavings =
    Number.isFinite(product.originalPrice) && (product.originalPrice || 0) > product.price;

  return (
    <article
      className={
        'product' +
        (quantity > 0 ? ' is-selected' : '') +
        (!product.available ? ' is-unavailable' : '')
      }
    >
      <div className="product-image">
        {imgVisible && (
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            onError={() => setImgVisible(false)}
          />
        )}
        <div className="product-image-shade" aria-hidden="true" />
        {!product.available && <span className="product-soldout-tag">Out of Stock</span>}
      </div>

      <div className="product-info">
        <div className="product-price-row">
          <strong className="product-price">{formatNaira(product.price)}</strong>
          {hasSavings && (
            <>
              <span className="product-original-price">
                {formatNaira(product.originalPrice!)}
              </span>
              <span className="product-savings">
                SAVE {formatNaira(product.originalPrice! - product.price)}
              </span>
            </>
          )}
        </div>

        <p className="product-serving">{product.servingSize || product.desc}</p>
        <h3>{product.name}</h3>

        <div className="product-prep">
          <Clock size={12} aria-hidden="true" />
          <span>{product.time}</span>
        </div>
      </div>

      {product.available && (
        <div className="product-selection quantity">
          {quantity > 0 && (
            <>
              <button
                type="button"
                className="round"
                onClick={(e) => onChangeQuantity(product.id, -1, e)}
                aria-label={`Remove one ${product.name}`}
              >
                −
              </button>
              <span aria-label={`Quantity selected for ${product.name}`}>{quantity}</span>
            </>
          )}
          <button
            type="button"
            className="round add"
            onClick={(e) => onChangeQuantity(product.id, 1, e)}
            aria-label={`Add ${product.name}`}
          >
            +
          </button>
        </div>
      )}
    </article>
  );
};
