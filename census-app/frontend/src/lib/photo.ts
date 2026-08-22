/** House photograph capture and down-scaling.
 *
 * Photos sync over rural 2G, so a phone's 4 MB original is resized to a long
 * edge of 1024 px and re-encoded as JPEG — typically 60–120 KB, which stays
 * inside IndexedDB quotas even for a few hundred households on one device.
 */

import type { Photo } from './types';
import { nowIso, uuid } from './utils';

export const MAX_EDGE = 1024;
export const JPEG_QUALITY = 0.72;
/** Hard ceiling on the source file we will even attempt to decode. */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode image'));
    };
    image.src = url;
  });
}

export async function fileToPhoto(file: File, caption = ''): Promise<Photo> {
  if (file.size > MAX_SOURCE_BYTES) throw new Error('Image too large');

  const image = await loadImage(file);
  const { width, height } = image;
  if (!width || !height) throw new Error('Image has no dimensions');

  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas not available');

  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  if (!dataUrl.startsWith('data:image/jpeg')) throw new Error('Could not encode image');

  return {
    id: uuid(),
    dataUrl,
    caption,
    capturedAt: nowIso(),
  };
}

/** Approximate decoded size of a data URL, for storage reporting. */
export function dataUrlBytes(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1) return 0;
  const base64 = dataUrl.slice(commaIndex + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}
