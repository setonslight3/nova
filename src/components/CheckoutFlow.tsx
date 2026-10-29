import React from 'react';
import { Camera, CheckCircle2, ChevronDown, Copy, Upload } from 'lucide-react';
import { formatNaira, isValidNigerianPhone } from '../data/defaultCatalog';
import { PROOF_ACCEPT_ATTRIBUTE, validateAndProcessFile } from '../lib/fileValidator';
import {
  CampusZone,
  ChatAttachment,
  CheckoutStage,
  DeliveryDetails,
  PaymentMethod,
  PlatformPaymentConfig,
  Product,
} from '../types/nova';

interface CheckoutFlowProps {
  stage: CheckoutStage;
  setStage: React.Dispatch<React.SetStateAction<CheckoutStage>>;
  products: Product[];
  bag: Record<string, number>;
  details: DeliveryDetails;
  setDetails: React.Dispatch<React.SetStateAction<DeliveryDetails>>;
  remember: boolean;
  setRemember: (val: boolean) => void;
  onClearSavedDetails: () => void;
  onChangeQuantity: (id: string, delta: number, e?: React.MouseEvent) => void;
  onRemoveItem: (id: string) => void;
  onAddMoreItems: () => void;
  campusZones: CampusZone[];
  paymentConfig: PlatformPaymentConfig;
  externalProof: ChatAttachment | null;
  onSetExternalProof: (att: ChatAttachment | null) => void;
  onOpenCameraForProof: () => void;
  onSubmitOrder: (params: {
    paymentMethod: PaymentMethod;
    proof: ChatAttachment | null;
    deliveryFee: number;
  }) => void;
}

export const CheckoutFlow: React.FC<CheckoutFlowProps> = ({
  stage,
  setStage,
  products,
  bag,
  details,
  setDetails,
  remember,
  setRemember,
  onClearSavedDetails,
  onChangeQuantity,
  onRemoveItem,
  onAddMoreItems,
  campusZones,
  paymentConfig,
  externalProof,
  onSetExternalProof,
  onOpenCameraForProof,
  onSubmitOrder,
}) => {
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>('bank_transfer');
  const [proofError, setProofError] = React.useState('');
  const [copyFeedback, setCopyFeedback] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const activeZones = campusZones.filter((z) => z.active);
  const selectedZone = activeZones.find((z) => z.name === details.university);
  const deliveryFee = selectedZone ? selectedZone.foodDeliveryFee : 700;

  const lines = products.filter((p) => (bag[p.id] || 0) > 0);
  const count = lines.reduce((sum, p) => sum + (bag[p.id] || 0), 0);
  const subtotal = lines.reduce((sum, p) => sum + p.price * (bag[p.id] || 0), 0);
  const finalTotal = subtotal + deliveryFee;

  const errors = {
    university: activeZones.some((z) => z.name === details.university)
      ? ''
      : 'Choose your university.',
    campusAddress: details.campusAddress.trim() ? '' : 'Add your campus location.',
    phone: isValidNigerianPhone(details.phone)
      ? ''
      : 'Enter a valid Nigerian mobile number (e.g. 0803 123 4567).',
    time:
      details.timing !== 'Scheduled' || (details.time && new Date(details.time) > new Date())
        ? ''
        : 'Choose a future date and time.',
  };

  const deliveryValid = count > 0 && !Object.values(errors).some(Boolean);

  const updateField = (key: keyof DeliveryDetails, value: string) => {
    setDetails((prev) => ({ ...prev, [key]: value }));
  };

  const markTouched = (key: string) => setTouched((prev) => ({ ...prev, [key]: true }));

  const copyAccountNumber = async () => {
    try {
      await navigator.clipboard.writeText(paymentConfig.accountNumber);
      setCopyFeedback('Account number copied!');
    } catch {
      setCopyFeedback('Select the account number to copy manually.');
    }
    window.setTimeout(() => setCopyFeedback(''), 2500);
  };

  const handleProofFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setProofError('');
    if (!file) return;
    const result = await validateAndProcessFile(file, { proofOnly: true });
    if (!result.valid || !result.attachment) {
      setProofError(result.error || 'Choose a valid JPG, PNG, WebP or PDF file.');
      e.target.value = '';
      return;
    }
    onSetExternalProof(result.attachment);
    e.target.value = '';
  };

  const canConfirmOrder =
    deliveryValid &&
    !submitting &&
    (paymentMethod === 'pay_on_delivery' || Boolean(externalProof));

  const handleConfirmPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canConfirmOrder) return;
    setSubmitting(true);
    try {
      onSubmitOrder({
        paymentMethod,
        proof: externalProof,
        deliveryFee,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="checkout-session" data-checkout-stage={stage}>
      <article className="message nova nova-chat-message">
        <span className="nova-avatar" aria-hidden="true">
          <img src="/logo.png" alt="" />
        </span>
        <div className="nova-message-content">
          <small className="nova-sender">Nova</small>
          <div className="nova-message-bubble">
            <p>
              {stage === 'delivery'
                ? 'Where should we deliver your order?'
                : stage === 'review'
                ? 'Take a quick look at your order summary & campus delivery fee.'
                : 'Complete your payment below to dispatch your order.'}
            </p>
          </div>
        </div>
      </article>

      {stage === 'delivery' && (
        <form
          className="checkout"
          aria-label="Delivery details"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!deliveryValid) {
              setTouched({ university: true, campusAddress: true, phone: true, time: true });
              return;
            }
            setStage('review');
          }}
        >
          <details className="checkout-bag">
            <summary>
              <span>
                {count} {count === 1 ? 'item' : 'items'} in your bag — {formatNaira(subtotal)}
              </span>
              <ChevronDown size={16} aria-hidden="true" />
            </summary>
            <div className="checkout-items">
              {lines.map((p) => (
                <div className="checkout-item" key={p.id}>
                  <div>
                    <span>{p.name}</span>
                    <small>{formatNaira(p.price)} each</small>
                  </div>
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
                      onClick={(ev) => onChangeQuantity(p.id, 1, ev)}
                      aria-label={`Increase ${p.name}`}
                    >
                      +
                    </button>
                  </div>
                  <strong>{formatNaira(p.price * bag[p.id])}</strong>
                  <button
                    type="button"
                    className="text-action"
                    onClick={() => onRemoveItem(p.id)}
                    aria-label={`Remove ${p.name}`}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </details>

          <div className="delivery-row destination-row">
            <label>
              University
              <select
                name="university"
                required
                value={details.university}
                onChange={(e) => updateField('university', e.target.value)}
                onBlur={() => markTouched('university')}
                aria-invalid={Boolean(touched.university && errors.university)}
              >
                <option value="" disabled>
                  Select university
                </option>
                {activeZones.map((zone) => (
                  <option key={zone.id} value={zone.name}>
                    {zone.name} ({formatNaira(zone.foodDeliveryFee)} delivery)
                  </option>
                ))}
              </select>
              {touched.university && errors.university && (
                <small className="field-error" role="status">
                  {errors.university}
                </small>
              )}
            </label>

            <label>
              Specific address on campus
              <input
                name="campusAddress"
                type="text"
                required
                value={details.campusAddress}
                placeholder="Hostel, block, room or landmark"
                onChange={(e) => updateField('campusAddress', e.target.value)}
                onBlur={() => markTouched('campusAddress')}
                aria-invalid={Boolean(touched.campusAddress && errors.campusAddress)}
              />
              {touched.campusAddress && errors.campusAddress && (
                <small className="field-error" role="status">
                  {errors.campusAddress}
                </small>
              )}
            </label>
          </div>

          <div className="delivery-row contact-row">
            <label>
              Phone number
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                required
                value={details.phone}
                placeholder="080 0000 0000"
                onChange={(e) => updateField('phone', e.target.value)}
                onBlur={() => markTouched('phone')}
                aria-invalid={Boolean(touched.phone && errors.phone)}
              />
              {touched.phone && errors.phone && (
                <small className="field-error" role="status">
                  {errors.phone}
                </small>
              )}
            </label>

            <fieldset className="timing-options">
              <legend>Delivery time</legend>
              <div className="timing-buttons">
                {(['ASAP', 'Scheduled'] as const).map((val) => (
                  <button
                    key={val}
                    type="button"
                    className={'timing-button' + (details.timing === val ? ' active' : '')}
                    aria-pressed={details.timing === val}
                    onClick={() => updateField('timing', val)}
                  >
                    {val === 'Scheduled' ? 'Schedule' : 'ASAP'}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          {details.timing === 'Scheduled' && (
            <label className="scheduled-input-label">
              Preferred delivery time
              <input
                name="time"
                type="datetime-local"
                required
                value={details.time}
                onChange={(e) => updateField('time', e.target.value)}
                onBlur={() => markTouched('time')}
                aria-invalid={Boolean(touched.time && errors.time)}
              />
              {touched.time && errors.time && (
                <small className="field-error" role="status">
                  {errors.time}
                </small>
              )}
            </label>
          )}

          <div className="remember-row">
            <label>
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Remember on this device
            </label>
            <button type="button" className="text-action" onClick={onClearSavedDetails}>
              Clear details
            </button>
          </div>

          <div className="checkout-dual-actions">
            <button type="submit" className="primary" disabled={!deliveryValid}>
              Review Order →
            </button>
            <button
              type="button"
              className="secondary-solid"
              disabled={!deliveryValid}
              onClick={() => {
                if (deliveryValid) setStage('payment');
              }}
            >
              Skip to Payment →
            </button>
          </div>
        </form>
      )}

      {stage === 'review' && (
        <section className="checkout" aria-label="Review order">
          <div className="review-heading">
            <h2>Review your order</h2>
            <button
              type="button"
              className="text-action"
              onClick={() => setStage('delivery')}
              aria-label="Edit delivery details"
            >
              Edit details
            </button>
          </div>

          <div className="review-products">
            {lines.map((p) => (
              <p key={p.id}>
                <span>
                  {p.name} × {bag[p.id]}
                </span>
                <strong>{formatNaira(p.price * bag[p.id])}</strong>
              </p>
            ))}
          </div>

          <p className="delivery-destination">
            <strong>{details.university}</strong>
            <br />
            {details.campusAddress.trim()}
          </p>
          <p className="delivery-contact-line">
            {details.phone} ·{' '}
            {details.timing === 'Scheduled'
              ? details.time.replace('T', ' at ')
              : `ASAP (${selectedZone?.estimatedEta || '20–35 min'})`}
          </p>

          <dl className="review-totals">
            <div>
              <dt>Product subtotal</dt>
              <dd>{formatNaira(subtotal)}</dd>
            </div>
            <div>
              <dt>Campus delivery fee</dt>
              <dd>{formatNaira(deliveryFee)}</dd>
            </div>
            <div className="review-grand-total">
              <dt>Total to pay</dt>
              <dd>{formatNaira(finalTotal)}</dd>
            </div>
          </dl>

          <div className="checkout-step-buttons">
            <button type="button" className="laundry-back" onClick={() => setStage('delivery')}>
              Back
            </button>
            <button
              type="button"
              className="primary"
              disabled={!deliveryValid}
              onClick={() => setStage('payment')}
            >
              Continue to payment →
            </button>
          </div>
        </section>
      )}

      {stage === 'payment' && (
        <form className="checkout payment-card" aria-label="Payment" onSubmit={handleConfirmPayment}>
          <div className="review-heading">
            <h2>Checkout & Payment</h2>
            <button type="button" className="text-action" onClick={() => setStage('review')}>
              Back to review
            </button>
          </div>

          <div className="laundry-payment-total">
            <span>Total due ({count} items + delivery)</span>
            <strong>
              {formatNaira(finalTotal)}
              {paymentConfig.paymentMode === 'demo' ? ' (Demo)' : ''}
            </strong>
          </div>
          <p className="laundry-fee-note">
            Delivering to {details.university} · {details.campusAddress}
          </p>

          <fieldset className="payment-method-tabs">
            <legend>Select payment method</legend>
            <div className="timing-buttons">
              <button
                type="button"
                className={
                  'timing-button' + (paymentMethod === 'bank_transfer' ? ' active' : '')
                }
                onClick={() => setPaymentMethod('bank_transfer')}
              >
                Bank Transfer
              </button>
              {paymentConfig.allowPayOnDelivery && (
                <button
                  type="button"
                  className={
                    'timing-button' + (paymentMethod === 'pay_on_delivery' ? ' active' : '')
                  }
                  onClick={() => setPaymentMethod('pay_on_delivery')}
                >
                  Pay on Delivery
                </button>
              )}
            </div>
          </fieldset>

          {paymentMethod === 'bank_transfer' ? (
            <div className="payment-transfer-box">
              <div className="laundry-bank">
                <h3>Transfer exact total to:</h3>
                <p>
                  <span>Bank</span>
                  <strong>{paymentConfig.bankName}</strong>
                </p>
                <p>
                  <span>Account name</span>
                  <strong>{paymentConfig.accountName}</strong>
                </p>
                <div className="laundry-bank-account">
                  <span>Account number</span>
                  <code>{paymentConfig.accountNumber}</code>
                  <button
                    type="button"
                    className="copy-chip"
                    onClick={copyAccountNumber}
                    aria-label="Copy account number"
                  >
                    <Copy size={13} /> Copy
                  </button>
                </div>
                {copyFeedback && (
                  <small className="laundry-copy-feedback" role="status">
                    {copyFeedback}
                  </small>
                )}
                {paymentConfig.paymentMode === 'demo' && (
                  <p className="laundry-demo-notice">
                    Demo Mode Active — Switch to Live Banking anytime in Admin Dashboard
                  </p>
                )}
              </div>

              <div className="proof-upload-area">
                <span className="proof-title">Attach payment receipt (JPG, PNG, WebP or PDF)</span>
                <div className="proof-buttons-row">
                  <label className="proof-upload-btn">
                    <Upload size={15} />
                    <span>{externalProof ? 'Change File' : 'Upload Receipt'}</span>
                    <input
                      type="file"
                      hidden
                      accept={PROOF_ACCEPT_ATTRIBUTE}
                      onChange={handleProofFileChange}
                    />
                  </label>
                  <button
                    type="button"
                    className="proof-camera-btn"
                    onClick={onOpenCameraForProof}
                  >
                    <Camera size={15} />
                    <span>Snap Receipt</span>
                  </button>
                </div>

                {externalProof ? (
                  <div className="proof-selected-pill">
                    <CheckCircle2 size={15} />
                    <span>Attached: {externalProof.name}</span>
                    <button
                      type="button"
                      className="text-action"
                      onClick={() => onSetExternalProof(null)}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <small className="laundry-proof-help">
                    Required: JPG, PNG, WebP or PDF up to 10 MB.
                  </small>
                )}

                {proofError && (
                  <p className="field-error" role="alert">
                    {proofError}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="pod-notice-box">
              <p>
                <strong>Pay on Campus Delivery:</strong> Have {formatNaira(finalTotal)} ready via
                instant transfer or POS when your Nova rider arrives at {details.campusAddress}.
              </p>
            </div>
          )}

          <button type="submit" className="primary" disabled={!canConfirmOrder}>
            {paymentMethod === 'bank_transfer'
              ? "I've made payment — Place Order →"
              : 'Confirm Order (Pay on Delivery) →'}
          </button>
        </form>
      )}

      <button type="button" className="suggestion-chip" onClick={onAddMoreItems}>
        + Add more items
      </button>
    </div>
  );
};
