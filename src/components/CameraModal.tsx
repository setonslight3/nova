import React from 'react';
import { Camera, RefreshCw, Upload, X } from 'lucide-react';
import { validateAndProcessFile } from '../lib/fileValidator';
import { ChatAttachment } from '../types/nova';

interface CameraModalProps {
  open: boolean;
  purposeLabel?: string;
  onClose: () => void;
  onCapture: (attachment: ChatAttachment) => void;
}

export const CameraModal: React.FC<CameraModalProps> = ({
  open,
  purposeLabel = 'Snap a photo (list, parcel, laundry item, or receipt)',
  onClose,
  onCapture,
}) => {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = React.useState<'environment' | 'user'>('environment');
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [cameraError, setCameraError] = React.useState<string>('');
  const [starting, setStarting] = React.useState(false);

  const stopStream = React.useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const startStream = React.useCallback(
    async (mode: 'environment' | 'user') => {
      stopStream();
      setCameraError('');
      setStarting(true);
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Live camera stream unavailable in this browser.');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        setCameraError(
          'Live webcam unavailable or permission declined. You can still take or pick a photo below.'
        );
      } finally {
        setStarting(false);
      }
    },
    [stopStream]
  );

  React.useEffect(() => {
    if (open) {
      setPreviewUrl(null);
      startStream(facingMode);
    } else {
      stopStream();
      setPreviewUrl(null);
    }
    return () => stopStream();
  }, [open, facingMode, startStream, stopStream]);

  if (!open) return null;

  const snapFrame = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const maxDim = 1280;
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
    setPreviewUrl(dataUrl);
    stopStream();
  };

  const confirmPhoto = () => {
    if (!previewUrl) return;
    const approxBytes = Math.round((previewUrl.length * 3) / 4);
    const att: ChatAttachment = {
      id: `cam-${Date.now()}`,
      name: `nova-photo-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.jpg`,
      mimeType: 'image/jpeg',
      size: approxBytes,
      kind: 'image',
      dataUrl: previewUrl,
      source: 'camera',
    };
    onCapture(att);
    onClose();
  };

  const handleFallbackCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const outcome = await validateAndProcessFile(file, { proofOnly: true, source: 'camera' });
    if (outcome.valid && outcome.attachment && outcome.attachment.kind === 'image') {
      onCapture(outcome.attachment);
      onClose();
    } else {
      setCameraError(outcome.error || 'Only JPG, PNG, or WebP photos are supported.');
    }
    e.target.value = '';
  };

  return (
    <div className="nova-modal-backdrop" role="dialog" aria-modal="true" aria-label="Camera">
      <div className="nova-modal camera-modal">
        <div className="nova-modal-header">
          <div>
            <h2>Take Photo</h2>
            <p className="modal-subtitle">{purposeLabel}</p>
          </div>
          <button type="button" className="round" onClick={onClose} aria-label="Close camera">
            <X size={18} />
          </button>
        </div>

        <div className="camera-viewport">
          {previewUrl ? (
            <img src={previewUrl} alt="Captured preview" className="camera-preview-img" />
          ) : cameraError ? (
            <div className="camera-fallback-box">
              <Camera size={36} />
              <p>{cameraError}</p>
              <label className="primary camera-fallback-label">
                <Upload size={16} />
                <span>Capture / Choose Photo (JPG, PNG, WebP)</span>
                <input
                  type="file"
                  hidden
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={handleFallbackCapture}
                />
              </label>
            </div>
          ) : (
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="camera-video"
            />
          )}
        </div>

        <div className="camera-controls">
          {previewUrl ? (
            <>
              <button
                type="button"
                className="laundry-back"
                onClick={() => {
                  setPreviewUrl(null);
                  startStream(facingMode);
                }}
              >
                Retake
              </button>
              <button type="button" className="primary" onClick={confirmPhoto}>
                Use Photo →
              </button>
            </>
          ) : !cameraError ? (
            <>
              <button
                type="button"
                className="laundry-back"
                onClick={() =>
                  setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))
                }
                disabled={starting}
              >
                <RefreshCw size={15} /> Flip
              </button>
              <button
                type="button"
                className="primary camera-shutter-btn"
                onClick={snapFrame}
                disabled={starting}
              >
                <Camera size={17} /> Capture Photo
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
