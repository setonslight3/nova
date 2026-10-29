import React from 'react';
import { Camera, CheckCircle2, Copy, Upload } from 'lucide-react';
import { formatNaira, isValidNigerianPhone } from '../data/defaultCatalog';
import { PROOF_ACCEPT_ATTRIBUTE, validateAndProcessFile } from '../lib/fileValidator';
import {
  CampusZone,
  ChatAttachment,
  ParcelState,
  PaymentMethod,
  PlatformPaymentConfig,
} from '../types/nova';

interface ParcelFlowProps {
  campusZones: CampusZone[];
  paymentConfig: PlatformPaymentConfig;
  data: ParcelState;
  setData: React.Dispatch<React.SetStateAction<ParcelState>>;
  onOpenCameraForItem: () => void;
  onOpenCameraForProof: () => void;
  onSubmitParcelOrder: (params: {
    fee: number;
    paymentMethod: PaymentMethod;
    proof: ChatAttachment | null;
  }) => void;
}

const QUESTIONS = [
  "What's being picked up, and what are the pickup & drop-off addresses?",
  'Now enter the pickup and drop-off phone numbers.',
  "Here's your parcel summary & confirmed dispatch fee.",
];

export const ParcelFlow: React.FC<ParcelFlowProps> = ({
  campusZones,
  paymentConfig,
  data,
  setData,
  onOpenCameraForItem,
  onOpenCameraForProof,
  onSubmitParcelOrder,
}) => {
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const [fileError, setFileError] = React.useState('');
  const [copyMsg, setCopyMsg] = React.useState('');

  const activeZones = campusZones.filter((z) => z.active);
  const selectedZone =
    activeZones.find((z) => z.name === data.university) || activeZones[0];
  const parcelFee = selectedZone ? selectedZone.parcelBaseFee : 800;

  const step = data.step || 1;
  const reached = Math.max(data.furthestStep || 1, step);

  const addressesValid = Boolean(
    data.university &&
      data.itemDescription.trim() &&
      data.pickupAddress.trim() &&
      data.dropoffAddress.trim()
  );
  const contactsValid =
    isValidNigerianPhone(data.pickupPhone) && isValidNigerianPhone(data.dropoffPhone);
  const timeValid =
    data.timing === 'ASAP' || Boolean(data.time && new Date(data.time) > new Date());

  const update = <K extends keyof ParcelState>(key: K, value: ParcelState[K]) => {
    setData((curr) => ({ ...curr, [key]: value, submittedOrderId: null }));
  };

  const go = (next: 1 | 2 | 3) => {
    setData((curr) => ({
      ...curr,
      step: next,
      furthestStep: Math.max(curr.furthestStep || 1, next) as 1 | 2 | 3,
    }));
  };

  const handleItemPhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError('');
    if (!file) return;
    const res = await validateAndProcessFile(file, { proofOnly: true });
    if (!res.valid || !res.attachment || res.attachment.kind !== 'image') {
      setFileError('Choose a JPG, PNG, or WebP photo under 10 MB.');
      e.target.value = '';
      return;
    }
    update('itemPhoto', res.attachment);
    e.target.value = '';
  };

  const handleProofFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError('');
    if (!file) return;
    const res = await validateAndProcessFile(file, { proofOnly: true });
    if (!res.valid || !res.attachment) {
      setFileError(res.error || 'Choose a JPG, PNG, WebP or PDF file.');
      e.target.value = '';
      return;
    }
    update('proof', res.attachment);
    e.target.value = '';
  };

  const copyAccount = async () => {
    try {
      await navigator.clipboard.writeText(paymentConfig.accountNumber);
      setCopyMsg('Copied!');
    } catch {
      setCopyMsg('Select number to copy.');
    }
    window.setTimeout(() => setCopyMsg(''), 2400);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) {
      setTouched({
        university: true,
        itemDescription: true,
        pickupAddress: true,
        dropoffAddress: true,
      });
      if (addressesValid) go(2);
      return;
    }
    if (step === 2) {
      setTouched((t) => ({ ...t, pickupPhone: true, dropoffPhone: true }));
      if (contactsValid) go(3);
      return;
    }
    if (!addressesValid || !contactsValid || !timeValid) return;
    if (data.paymentMethod === 'bank_transfer' && !data.proof) return;

    onSubmitParcelOrder({
      fee: parcelFee,
      paymentMethod: data.paymentMethod,
      proof: data.proof,
    });
  };

  const renderSummary = (num: number) =>
    num === 1
      ? `${data.itemDescription} · ${data.pickupAddress} → ${data.dropoffAddress} (${data.university})`
      : num === 2
      ? `Pickup: ${data.pickupPhone} · Drop-off: ${data.dropoffPhone}`
      : 'Review updated.';

  return (
    <div className="parcel-thread">
      {[1, 2, 3]
        .filter((num) => num <= reached)
        .map((num) => (
          <article
            key={num}
            className="message nova nova-chat-message parcel-message"
            data-parcel-step={num}
          >
            <span className="nova-avatar" aria-hidden="true">
              <img src="/logo.png" alt="" />
            </span>
            <div className="nova-message-content">
              <small className="nova-sender">Nova</small>
              <div className="nova-message-bubble">
                <p>{QUESTIONS[num - 1]}</p>

                {num === step ? (
                  <form
                    className="parcel-form"
                    aria-label={`Parcel pickup step ${step}`}
                    noValidate
                    onSubmit={handleSubmit}
                  >
                    {step === 1 && (
                      <>
                        <label>
                          Campus / Delivery Zone
                          <select
                            value={data.university}
                            onChange={(e) => update('university', e.target.value)}
                            onBlur={() => setTouched((t) => ({ ...t, university: true }))}
                          >
                            <option value="" disabled>
                              Select campus zone
                            </option>
                            {activeZones.map((z) => (
                              <option key={z.id} value={z.name}>
                                {z.name} ({formatNaira(z.parcelBaseFee)} dispatch)
                              </option>
                            ))}
                          </select>
                          {touched.university && !data.university && (
                            <small className="field-error">Select a campus zone.</small>
                          )}
                        </label>

                        <label>
                          What item is being sent?
                          <input
                            type="text"
                            placeholder="e.g. Textbooks, laptop charger, food flask"
                            value={data.itemDescription}
                            onChange={(e) => update('itemDescription', e.target.value)}
                            onBlur={() =>
                              setTouched((t) => ({ ...t, itemDescription: true }))
                            }
                            aria-invalid={Boolean(
                              touched.itemDescription && !data.itemDescription.trim()
                            )}
                          />
                          {touched.itemDescription && !data.itemDescription.trim() && (
                            <small className="field-error">
                              Briefly describe the parcel item.
                            </small>
                          )}
                        </label>

                        <label>
                          Pickup address
                          <input
                            type="text"
                            placeholder="Hostel, room, gate or landmark"
                            value={data.pickupAddress}
                            onChange={(e) => update('pickupAddress', e.target.value)}
                            onBlur={() =>
                              setTouched((t) => ({ ...t, pickupAddress: true }))
                            }
                            aria-invalid={Boolean(
                              touched.pickupAddress && !data.pickupAddress.trim()
                            )}
                          />
                          {touched.pickupAddress && !data.pickupAddress.trim() && (
                            <small className="field-error">Please add pickup address.</small>
                          )}
                        </label>

                        <label>
                          Drop-off address
                          <input
                            type="text"
                            placeholder="Recipient hostel, block or office"
                            value={data.dropoffAddress}
                            onChange={(e) => update('dropoffAddress', e.target.value)}
                            onBlur={() =>
                              setTouched((t) => ({ ...t, dropoffAddress: true }))
                            }
                            aria-invalid={Boolean(
                              touched.dropoffAddress && !data.dropoffAddress.trim()
                            )}
                          />
                          {touched.dropoffAddress && !data.dropoffAddress.trim() && (
                            <small className="field-error">Please add drop-off address.</small>
                          )}
                        </label>

                        <div className="parcel-photo-optional">
                          <span>Optional parcel photo</span>
                          <div className="proof-buttons-row">
                            <label className="proof-upload-btn">
                              <Upload size={14} />
                              <span>{data.itemPhoto ? 'Change Photo' : 'Attach Photo'}</span>
                              <input
                                type="file"
                                hidden
                                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                                onChange={handleItemPhotoFile}
                              />
                            </label>
                            <button
                              type="button"
                              className="proof-camera-btn"
                              onClick={onOpenCameraForItem}
                            >
                              <Camera size={14} />
                              <span>Take Photo</span>
                            </button>
                          </div>
                          {data.itemPhoto && (
                            <div className="proof-selected-pill">
                              <CheckCircle2 size={14} />
                              <span>{data.itemPhoto.name}</span>
                              <button
                                type="button"
                                className="text-action"
                                onClick={() => update('itemPhoto', null)}
                              >
                                Remove
                              </button>
                            </div>
                          )}
                          {fileError && <small className="field-error">{fileError}</small>}
                        </div>
                      </>
                    )}

                    {step === 2 && (
                      <>
                        <label>
                          Pickup phone number
                          <input
                            type="tel"
                            placeholder="080 0000 0000"
                            value={data.pickupPhone}
                            onChange={(e) => update('pickupPhone', e.target.value)}
                            onBlur={() => setTouched((t) => ({ ...t, pickupPhone: true }))}
                            aria-invalid={Boolean(
                              touched.pickupPhone && !isValidNigerianPhone(data.pickupPhone)
                            )}
                          />
                          {touched.pickupPhone && !isValidNigerianPhone(data.pickupPhone) && (
                            <small className="field-error">
                              Enter a valid Nigerian phone number.
                            </small>
                          )}
                        </label>

                        <label>
                          Drop-off phone number
                          <input
                            type="tel"
                            placeholder="080 0000 0000"
                            value={data.dropoffPhone}
                            onChange={(e) => update('dropoffPhone', e.target.value)}
                            onBlur={() => setTouched((t) => ({ ...t, dropoffPhone: true }))}
                            aria-invalid={Boolean(
                              touched.dropoffPhone && !isValidNigerianPhone(data.dropoffPhone)
                            )}
                          />
                          {touched.dropoffPhone &&
                            !isValidNigerianPhone(data.dropoffPhone) && (
                              <small className="field-error">
                                Enter a valid Nigerian phone number.
                              </small>
                            )}
                        </label>
                      </>
                    )}

                    {step === 3 && (
                      <>
                        <dl className="parcel-review">
                          <div>
                            <dt>Parcel & Zone</dt>
                            <dd>
                              <strong>{data.itemDescription}</strong> ({data.university})
                            </dd>
                            <button
                              type="button"
                              className="text-action"
                              onClick={() => go(1)}
                            >
                              Edit
                            </button>
                          </div>
                          <div>
                            <dt>Pickup</dt>
                            <dd>
                              {data.pickupAddress}
                              <br />
                              {data.pickupPhone}
                            </dd>
                            <button
                              type="button"
                              className="text-action"
                              onClick={() => go(1)}
                            >
                              Edit
                            </button>
                          </div>
                          <div>
                            <dt>Drop-off</dt>
                            <dd>
                              {data.dropoffAddress}
                              <br />
                              {data.dropoffPhone}
                            </dd>
                            <button
                              type="button"
                              className="text-action"
                              onClick={() => go(2)}
                            >
                              Edit
                            </button>
                          </div>
                        </dl>

                        <fieldset>
                          <legend>Dispatch Timing</legend>
                          <div className="parcel-timing">
                            {(['ASAP', 'Scheduled'] as const).map((val) => (
                              <button
                                key={val}
                                type="button"
                                className={data.timing === val ? 'active' : ''}
                                aria-pressed={data.timing === val}
                                onClick={() => update('timing', val)}
                              >
                                {val === 'Scheduled' ? 'Schedule' : 'ASAP'}
                              </button>
                            ))}
                          </div>
                        </fieldset>

                        {data.timing === 'Scheduled' && (
                          <label>
                            Preferred pickup time
                            <input
                              type="datetime-local"
                              value={data.time}
                              onChange={(e) => update('time', e.target.value)}
                            />
                            {!timeValid && (
                              <small className="field-error">
                                Choose a future pickup time.
                              </small>
                            )}
                          </label>
                        )}

                        <p className="parcel-fee">
                          Estimated ETA: {selectedZone?.estimatedEta || '20–35 min'}
                        </p>
                        <p className="parcel-total">
                          <span>Total to Pay</span>
                          <strong>
                            {formatNaira(parcelFee)}
                            {paymentConfig.paymentMode === 'demo' ? ' (Demo)' : ''}
                          </strong>
                        </p>

                        <fieldset>
                          <legend>Payment Method</legend>
                          <div className="parcel-timing">
                            <button
                              type="button"
                              className={
                                data.paymentMethod === 'bank_transfer' ? 'active' : ''
                              }
                              onClick={() => update('paymentMethod', 'bank_transfer')}
                            >
                              Bank Transfer
                            </button>
                            {paymentConfig.allowPayOnDelivery && (
                              <button
                                type="button"
                                className={
                                  data.paymentMethod === 'pay_on_delivery' ? 'active' : ''
                                }
                                onClick={() => update('paymentMethod', 'pay_on_delivery')}
                              >
                                Pay Rider
                              </button>
                            )}
                          </div>
                        </fieldset>

                        {data.paymentMethod === 'bank_transfer' ? (
                          <div className="payment-transfer-box">
                            <div className="laundry-bank">
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
                                  onClick={copyAccount}
                                >
                                  <Copy size={12} /> Copy
                                </button>
                              </div>
                              {copyMsg && (
                                <small className="laundry-copy-feedback">{copyMsg}</small>
                              )}
                            </div>

                            <div className="proof-upload-area">
                              <span className="proof-title">Attach payment proof</span>
                              <div className="proof-buttons-row">
                                <label className="proof-upload-btn">
                                  <Upload size={14} />
                                  <span>{data.proof ? 'Change File' : 'Upload Receipt'}</span>
                                  <input
                                    type="file"
                                    hidden
                                    accept={PROOF_ACCEPT_ATTRIBUTE}
                                    onChange={handleProofFile}
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
                              {data.proof && (
                                <div className="proof-selected-pill">
                                  <CheckCircle2 size={14} />
                                  <span>{data.proof.name}</span>
                                  <button
                                    type="button"
                                    className="text-action"
                                    onClick={() => update('proof', null)}
                                  >
                                    Remove
                                  </button>
                                </div>
                              )}
                              {fileError && <small className="field-error">{fileError}</small>}
                            </div>
                          </div>
                        ) : (
                          <div className="pod-notice-box">
                            <p>Pay {formatNaira(parcelFee)} to the dispatch rider on pickup.</p>
                          </div>
                        )}
                      </>
                    )}

                    <div className="checkout-step-buttons">
                      {step > 1 && (
                        <button
                          type="button"
                          className="laundry-back"
                          onClick={() => go((step - 1) as 1 | 2)}
                        >
                          Back
                        </button>
                      )}
                      <button
                        type="submit"
                        className="primary"
                        disabled={
                          step === 1
                            ? !addressesValid
                            : step === 2
                            ? !contactsValid
                            : !addressesValid ||
                              !contactsValid ||
                              !timeValid ||
                              (data.paymentMethod === 'bank_transfer' && !data.proof)
                        }
                      >
                        {step === 3 ? 'Confirm & Dispatch Parcel →' : 'Continue →'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="parcel-completed">
                    <p>{renderSummary(num)}</p>
                    <button
                      type="button"
                      className="text-action"
                      onClick={() => go(num as 1 | 2 | 3)}
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>
            </div>
          </article>
        ))}
    </div>
  );
};
