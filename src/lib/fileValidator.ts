import { ChatAttachment } from '../types/nova';

/**
 * Strictly necessary file types for Nova Delivery Platform:
 * - Photos (JPG, PNG, WebP): payment transfer screenshots, handwritten shopping lists, parcel items, laundry stain/garment photos
 * - PDF: official bank transfer receipts, parcel invoices/waybills
 * - Plain Text / CSV: typed grocery or errand lists (parsed locally for 0 tokens!)
 */
export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.txt', '.csv'] as const;

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.ms-excel', // Some Windows browsers tag .csv with this MIME
] as const;

export const ACCEPT_ATTRIBUTE =
  '.jpg,.jpeg,.png,.webp,.pdf,.txt,.csv,image/jpeg,image/png,image/webp,application/pdf,text/plain,text/csv';

export const PROOF_ACCEPT_ATTRIBUTE =
  '.jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf';

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_ATTACHMENTS_PER_MESSAGE = 4;

export interface FileValidationOutcome {
  valid: boolean;
  error?: string;
  attachment?: ChatAttachment;
}

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx).toLowerCase() : '';
}

/**
 * Downscales & compresses large images on device to save localStorage space and Gemini vision tokens.
 */
async function compressImageFile(file: File, maxDim = 1280, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.onload = () => {
      const rawUrl = reader.result as string;
      const img = new Image();
      img.onerror = () => resolve(rawUrl);
      img.onload = () => {
        const { width, height } = img;
        if (width <= maxDim && height <= maxDim && file.size <= 350 * 1024) {
          resolve(rawUrl);
          return;
        }
        const scale = Math.min(1, maxDim / Math.max(width, height));
        const targetW = Math.max(1, Math.round(width * scale));
        const targetH = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const outMime = file.type === 'image/png' && file.size < 600 * 1024 ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(outMime, quality));
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read text file.'));
    reader.onload = () => resolve(String(reader.result || '').slice(0, 12000));
    reader.readAsText(file);
  });
}

export async function validateAndProcessFile(
  file: File,
  options: { proofOnly?: boolean; source?: 'file' | 'camera' } = {}
): Promise<FileValidationOutcome> {
  const ext = getExtension(file.name);
  const mime = (file.type || '').toLowerCase();

  const allowedExts = options.proofOnly
    ? ['.jpg', '.jpeg', '.png', '.webp', '.pdf']
    : (ALLOWED_EXTENSIONS as readonly string[]);

  const extOk = allowedExts.includes(ext);
  const mimeOk =
    !mime ||
    (options.proofOnly
      ? ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(mime)
      : (ALLOWED_MIME_TYPES as readonly string[]).includes(mime));

  if (!extOk || !mimeOk) {
    const allowedLabel = options.proofOnly
      ? 'JPG, PNG, WebP photos or PDF receipts'
      : 'Photos (JPG, PNG, WebP), PDF receipts, or TXT/CSV lists';
    return {
      valid: false,
      error: `"${file.name}" is not supported. Only ${allowedLabel} are allowed.`,
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `"${file.name}" exceeds the 10 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`,
    };
  }

  if (file.size === 0) {
    return {
      valid: false,
      error: `"${file.name}" is empty.`,
    };
  }

  try {
    const isImage = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) || mime.startsWith('image/');
    const isPdf = ext === '.pdf' || mime === 'application/pdf';

    if (isImage) {
      const dataUrl = await compressImageFile(file);
      return {
        valid: true,
        attachment: {
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          mimeType: dataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg',
          size: file.size,
          kind: 'image',
          dataUrl,
          source: options.source || 'file',
        },
      };
    }

    if (isPdf) {
      const dataUrl = await readAsDataUrl(file);
      return {
        valid: true,
        attachment: {
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          mimeType: 'application/pdf',
          size: file.size,
          kind: 'pdf',
          dataUrl,
          source: 'file',
        },
      };
    }

    // TXT or CSV shopping list
    const textContent = await readAsText(file);
    return {
      valid: true,
      attachment: {
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        mimeType: ext === '.csv' ? 'text/csv' : 'text/plain',
        size: file.size,
        kind: 'text',
        textContent,
        source: 'file',
      },
    };
  } catch {
    return {
      valid: false,
      error: `Could not read "${file.name}". Please try another file.`,
    };
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
