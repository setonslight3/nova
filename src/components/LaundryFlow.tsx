import React from 'react';
import { Camera, CheckCircle2, Copy, Upload } from 'lucide-react';
import { formatNaira, isValidNigerianPhone } from '../data/defaultCatalog';
import { PROOF_ACCEPT_ATTRIBUTE, validateAndProcessFile } from '../lib/fileValidator';
import {
  CampusZone,
  ChatAttachment,
  LaundryServiceItem,
  LaundryState,
  PaymentMethod,
  PlatformPaymentConfig,
} from '../types/nova';

interface LaundryFlowProps {
  services: LaundryServiceItem[];
  campusZones: CampusZone[];
  paymentConfig: PlatformPaymentConfig;
  data: LaundryState;
  setData: React.Dispatch<React.SetStateAction<LaundryState>>;
  onOpenCameraForProof: () => void;
  onSubmitLaundryOrder: (params: {
    subtotal: number;
    pickupFee: number;
    total: number;
    paymentMethod: PaymentMethod;
    proof: ChatAttachment | null;
  }) => void;
}

export const LaundryFlow: React.FC<LaundryFlowProps> = ({
  services,
  campusZones,
  paymentConfig,
  data,
  setData,
  onOpenCameraForProof,
  onSubmitLaundryOrder,
}) => {
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const [proofError, setProofError] = React.useState('');
  const [copyMessage, setCopyMessage] = React.useState('');

  const activeServices = services.filter((s) => s.available);
  const activeZones = campusZones.filter((z) => z.active);
  const { quantities, pickup, notes, step, furthestStep, proof, paymentMethod } = data;

  const selected = activeServices.filter((s) => (quantities[s.id] || 0) > 0);
  const itemCount = selected.reduce((sum, s) => sum + (quantities[s.id] || 0), 0);
  const subtotal = selected.reduce((sum, s) => sum + s.price * (quantities[s.id] || 0), 0);

  const selectedZone = activeZones.find((z) => z.name === pickup.university);
  const pickupFee = selectedZone ? selectedZone.laundryPickupFee : 1000;
  const grandTotal = subtotal + pickupFee;

  const errors = {
    university: activeZones.some((z) => z.name === pickup.university)
      ? ''
      : 'Choose your university.',
    campusAddress: pickup.campusAddress.trim() ? '' : 'Add your campus location.',
    phone: isValidNigerianPhone(pickup.phone) ? '' : 'Enter a valid Nigerian mobile number.',
    time:
      pickup.timing !== 'Scheduled' || (pickup.time && new Date(pickup.time) > new Date())
        ? ''
        : 'Choose a future pickup time.',
  };

  const pickupValid = selected.length > 0 && !Object.values(errors).some(Boolean);

  const goTo = (next: 1 | 2 | 3) => {
    setData((curr) => ({
      ...curr,
      step: next,
      furthestStep: Math.max(curr.furthestStep, next) as 1 | 2 | 3,
    }));
  };

  const changeQty = (id: string, delta: number, e?: React.MouseEvent) => {
    if (e && e.detail > 1) return;
    setData((curr) => ({
      ...curr,
      submittedOrderId: null,
      quantities: {
        ...curr.quantities,
        [id]: Math.max(0, (curr.quantities[id] || 0) + delta),
      },
    }));
  };

  const updatePickup = (key: keyof typeof pickup, value: string) => {
    setData((curr) => ({
      ...curr,
      submittedOrderId: null,
      pickup: { ...curr.pickup, [key]: value },
    }));
  };

  const copyAccount = async () => {
    try {
      await navigator.clipboard.writeText(paymentConfig.accountNumber);
      setCopyMessage('Copied!');
    } catch {
      setCopyMessage('Select account number to copy.');
    }
    window.setTimeout(() => setCopyMessage(''), 2500);
  };

  const handleProofSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setProofError('');
    if (!file) return;
    const outcome = await validateAndProcessFile(file, { proofOnly: true });
    if (!outcome.valid || !outcome.attachment) {
      setProofError(outcome.error || 'Choose a JPG, PNG, WebP or PDF file under 10 MB.');
      e.target.value = '';
      return;
    }
    setData((curr) => ({ ...curr, proof: outcome.attachment!, submittedOrderId: null }));
    e.target.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) {
      if (itemCount > 0) goTo(2);
      return;
    }
    if (step === 2) {
      setTouched({ university: true, campusAddress: true, phone: true, time: true });
      if (pickupValid) goTo(3);
      return;
    }
    if (!pickupValid) return;
    if (paymentMethod === 'bank_transfer' && !proof) return;

    onSubmitLaundryOrder({
      subtotal,
      pickupFee,
      total: grandTotal,
      paymentMethod,
      proof,
    });
  };

  const renderIllustration = (path: string) => (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );

  const renderHistory = (
    num: 1 | 2,
    question: string,
    answer: string,
    onEdit: () => void
  ) => (
    <article className="laundry-chat-history" data-completed-step={num} key={`completed-${num}`}>
      <div className="laundry-history-question">
        <span className="nova-avatar" aria-hidden="true">
          <img src="/logo.png" alt="" />
        </span>
        <small>Nova</small>
        <p>{question}</p>
      </div>
      <div className="laundry-history-answer">
        <p>{answer}</p>
        <button type="button" className="text-action" onClick={onEdit}>
          Edit
        </button>
      </div>
    </article>
  );

  return (
    <div className="laundry-thread">
      {step > 1 &&
        renderHistory(
          1,
          'Laundry piling up? What would you like cleaned?',
          `${selected.map((s) => `${s.name} × ${quantities[s.id]}`).join(' · ')} — ${formatNaira(
            subtotal
          )} subtotal`,
          () => goTo(1)
        )}

      {step > 2 &&
        renderHistory(
          2,
          'Where should we pick up your laundry?',
          `${pickup.university} · ${pickup.campusAddress} · ${pickup.phone} · ${
            pickup.timing === 'Scheduled' ? pickup.time.replace('T', ' at ') : 'ASAP'
          }`,
          () => goTo(2)
        )}

      <article className="message nova nova-chat-message laundry-active-message">
        <span className="nova-avatar" aria-hidden="true">
          <img src="/logo.png" alt="" />
        </span>
        <div className="nova-message-content">
          <small className="nova-sender">Nova</small>
          <div className="nova-message-bubble">
            <p className="service-question">
              {step === 1
                ? 'Laundry piling up? What would you like cleaned?'
                : step === 2
                ? 'Where should we pick up your laundry?'
                : "Here's your laundry summary & payment."}
            </p>

            <form
              className="laundry-form"
              data-laundry-step={step}
              aria-label="Laundry order"
              noValidate
              onSubmit={handleSubmit}
            >
              {step === 1 && (
                <section>
                  <p className="laundry-pricing-note">
                    Select garment counts below · campus pickup & return delivery included in Step 3.
                  </p>
                  <div className="laundry-services">
                    {activeServices.map((service) => (
                      <article className="laundry-service" key={service.id}>
                        <div className="laundry-illustration">
                          {renderIllustration(service.path)}
                        </div>
                        <div className="laundry-service-info">
                          <h3>{service.name}</h3>
                        </div>
                        <strong className="laundry-service-price">
                          {formatNaira(service.price)}
                          <span> / item</span>
                        </strong>
                        <div className="laundry-quantity">
                          <button
                            type="button"
                            disabled={!(quantities[service.id] > 0)}
                            onClick={(e) => changeQty(service.id, -1, e)}
                            aria-label={`Decrease ${service.name}`}
                          >
                            −
                          </button>
                          <output aria-live="polite">{quantities[service.id] || 0}</output>
                          <button
                            type="button"
                            onClick={(e) => changeQty(service.id, 1, e)}
                            aria-label={`Increase ${service.name}`}
                          >
                            +
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}

              {step === 2 && (
                <section className="laundry-pickup">
                  <p className="laundry-selection-summary">
                    {itemCount} {itemCount === 1 ? 'item' : 'items'} selected ·{' '}
                    {formatNaira(subtotal)} subtotal
                  </p>

                  <div className="laundry-row laundry-destination">
                    <label>
                      University
                      <select
                        value={pickup.university}
                        onChange={(e) => updatePickup('university', e.target.value)}
                        onBlur={() => setTouched((t) => ({ ...t, university: true }))}
                        aria-invalid={Boolean(touched.university && errors.university)}
                      >
                        <option value="" disabled>
                          Select university
                        </option>
                        {activeZones.map((z) => (
                          <option key={z.id} value={z.name}>
                            {z.name} ({formatNaira(z.laundryPickupFee)} pickup)
                          </option>
                        ))}
                      </select>
                      {touched.university && errors.university && (
                        <small className="field-error">{errors.university}</small>
                      )}
                    </label>

                    <label>
                      Specific address on campus
                      <input
                        type="text"
                        placeholder="Hostel, block, room or landmark"
                        value={pickup.campusAddress}
                        onChange={(e) => updatePickup('campusAddress', e.target.value)}
                        onBlur={() => setTouched((t) => ({ ...t, campusAddress: true }))}
                        aria-invalid={Boolean(touched.campusAddress && errors.campusAddress)}
                      />
                      {touched.campusAddress && errors.campusAddress && (
                        <small className="field-error">{errors.campusAddress}</small>
                      )}
                    </label>
                  </div>

                  <div className="laundry-row laundry-contact">
                    <label>
                      Phone number
                      <input
                        type="tel"
                        placeholder="080 0000 0000"
                        value={pickup.phone}
                        onChange={(e) => updatePickup('phone', e.target.value)}
                        onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                        aria-invalid={Boolean(touched.phone && errors.phone)}
                      />
                      {touched.phone && errors.phone && (
                        <small className="field-error">{errors.phone}</small>
                      )}
                    </label>

                    <fieldset>
                      <legend>Pickup time</legend>
                      <div className="laundry-timing">
                        {(['ASAP', 'Scheduled'] as const).map((val) => (
                          <button
                            key={val}
                            type="button"
                            className={pickup.timing === val ? 'active' : ''}
                            aria-pressed={pickup.timing === val}
                            onClick={() => updatePickup('timing', val)}
                          >
                            {val === 'Scheduled' ? 'Schedule' : 'ASAP'}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  </div>

                  {pickup.timing === 'Scheduled' && (
                    <label>
                      Preferred pickup time
                      <input
                        type="datetime-local"
                        value={pickup.time}
                        onChange={(e) => updatePickup('time', e.target.value)}
                        onBlur={() => setTouched((t) => ({ ...t, time: true }))}
                        aria-invalid={Boolean(touched.time && errors.time)}
                      />
                      {touched.time && errors.time && (
                        <small className="field-error">{errors.time}</small>
                      )}
                    </label>
                  )}
                </section>
              )}

              {step === 3 && (
                <section className="laundry-summary laundry-payment">
                  <div className="laundry-payment-heading">
                    <h2>Review & Pay</h2>
                    <span>Step 3 of 3</span>
                  </div>

                  <details className="laundry-review-disclosure">
                    <summary>
                      <span>
                        <strong>Order: </strong>
                        {itemCount} {itemCount === 1 ? 'item' : 'items'} · {formatNaira(subtotal)}
                      </span>
                      <span className="laundry-disclosure-action">View items</span>
                    </summary>
                    <div className="laundry-summary-lines">
                      {selected.map((s) => (
                        <p key={s.id}>
                          <span>
                            {s.name} × {quantities[s.id]} · {formatNaira(s.price)} each
                          </span>
                          <strong>{formatNaira(s.price * quantities[s.id])}</strong>
                        </p>
                      ))}
                    </div>
                  </details>

                  <div className="laundry-pickup-review">
                    <details className="laundry-review-disclosure">
                      <summary>
                        <span>
                          <strong>Pickup: </strong>
                          {pickup.university} · {pickup.campusAddress} ·{' '}
                          {pickup.timing === 'Scheduled'
                            ? pickup.time.replace('T', ' at ')
                            : 'ASAP'}
                        </span>
                      </summary>
                      <p className="laundry-expanded-phone">Phone: {pickup.phone}</p>
                    </details>
                    <button type="button" className="text-action" onClick={() => goTo(2)}>
                      Edit
                    </button>
                  </div>

                  <div className="laundry-payment-total">
                    <span>Total to pay</span>
                    <strong>
                      {formatNaira(grandTotal)}
                      {paymentConfig.paymentMode === 'demo' ? ' (Demo)' : ''}
                    </strong>
                  </div>
                  <p className="laundry-fee-note">
                    {formatNaira(subtotal)} laundry + {formatNaira(pickupFee)} campus pickup &
                    return fee
                  </p>

                  <fieldset className="payment-method-tabs">
                    <legend>Payment method</legend>
                    <div className="laundry-timing">
                      <button
                        type="button"
                        className={paymentMethod === 'bank_transfer' ? 'active' : ''}
                        onClick={() =>
                          setData((c) => ({ ...c, paymentMethod: 'bank_transfer' }))
                        }
                      >
                        Bank Transfer
                      </button>
                      {paymentConfig.allowPayOnDelivery && (
                        <button
                          type="button"
                          className={paymentMethod === 'pay_on_delivery' ? 'active' : ''}
                          onClick={() =>
                            setData((c) => ({ ...c, paymentMethod: 'pay_on_delivery' }))
                          }
                        >
                          Pay at Pickup
                        </button>
                      )}
                    </div>
                  </fieldset>

                  {paymentMethod === 'bank_transfer' ? (
                    <>
                      <div className="laundry-bank">
                        <h3>Bank Transfer</h3>
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
                          <button type="button" className="copy-chip" onClick={copyAccount}>
                            <Copy size={12} /> Copy
                          </button>
                        </div>
                        {copyMessage && (
                          <small className="laundry-copy-feedback" role="status">
                            {copyMessage}
                          </small>
                        )}
                      </div>

                      <div className="proof-upload-area">
                        <span className="proof-title">Upload payment proof</span>
                        <div className="proof-buttons-row">
                          <label className="proof-upload-btn">
                            <Upload size={14} />
                            <span>{proof ? 'Change File' : 'Select Receipt'}</span>
                            <input
                              type="file"
                              hidden
                              accept={PROOF_ACCEPT_ATTRIBUTE}
                              onChange={handleProofSelect}
                            />
                          </label>
                          <button
                            type="button"
                            className="proof-camera-btn"
                            onClick={onOpenCameraForProof}
                          >
                            <Camera size={14} />
                            <span>Snap Receipt</span>
                          </button>
                        </div>

                        {proof ? (
                          <div className="proof-selected-pill">
                            <CheckCircle2 size={14} />
                            <span>{proof.name}</span>
                            <button
                              type="button"
                              className="text-action"
                              onClick={() => setData((c) => ({ ...c, proof: null }))}
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <small className="laundry-proof-help">
                            JPG, PNG, WebP or PDF · up to 10 MB.
                          </small>
                        )}
                        {proofError && <p className="field-error">{proofError}</p>}
                      </div>
                    </>
                  ) : (
                    <div className="pod-notice-box">
                      <p>Pay {formatNaira(grandTotal)} to our rider upon garment pickup.</p>
                    </div>
                  )}

                  {notes.length > 0 && (
                    <details className="laundry-review-disclosure">
                      <summary>Special handling notes ({notes.length})</summary>
                      {notes.map((n, idx) => (
                        <p key={idx}>• {n}</p>
                      ))}
                    </details>
                  )}
                </section>
              )}

              <div className="laundry-step-actions">
                {step === 1 && (
                  <p className="laundry-total" role="status">
                    {itemCount} {itemCount === 1 ? 'item' : 'items'} selected ·{' '}
                    {formatNaira(subtotal)}
                  </p>
                )}
                {step > 1 && (
                  <button
                    type="button"
                    className="laundry-back"
                    onClick={() => goTo((step - 1) as 1 | 2)}
                  >
                    Back
                  </button>
                )}
                <button
                  type="submit"
                  className="primary laundry-submit"
                  disabled={
                    step === 1
                      ? itemCount === 0
                      : step === 2
                      ? !pickupValid
                      : !pickupValid || (paymentMethod === 'bank_transfer' && !proof)
                  }
                >
                  {step === 3 ? "I've made payment — Book Pickup →" : 'Continue →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </article>

      {step === 1 &&
        furthestStep >= 2 &&
        pickup.university &&
        renderHistory(
          2,
          'Your saved pickup details',
          `${pickup.university} · ${pickup.campusAddress} · ${pickup.phone}`,
          () => goTo(2)
        )}
    </div>
  );
};
