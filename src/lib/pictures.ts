/** Pictures the user sends with a question: picked (paste / drop / 📎) → shrunk in the browser → uploaded on Send.
 *  Nothing leaves the browser before Send. */
import { authFetch } from '@/api/client';
import { ApiError } from '@/api/errors';
import { apiUrl } from '@/config';

export const MAX_PICTURES = 4;
export const MAX_SIDE = 1600;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export type Picked = { key: string; blob: Blob; url: string; name: string };

/** Pure: which of the new files we take (pictures only, at most MAX_PICTURES in total) + a message for the rest. */
export function acceptPictures(currentCount: number, files: { type: string; name: string }[]):
  { take: number[]; note: string | null } {
  const take: number[] = [];
  let skippedType = 0;
  let skippedCount = 0;
  files.forEach((f, i) => {
    if (!f.type.startsWith('image/')) skippedType++;
    else if (currentCount + take.length >= MAX_PICTURES) skippedCount++;
    else take.push(i);
  });
  const note = skippedCount ? `At most ${MAX_PICTURES} pictures per message`
    : skippedType ? 'Only pictures can be sent' : null;
  return { take, note };
}

/** Pure: the size to draw at so the longer side is ≤ max (never enlarges). */
export function fitWithin(width: number, height: number, max = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Shrink to ≤ 1600 px and re-encode as JPEG (~300 KB): fast upload, fewer tokens, no hidden metadata (GPS…).
 *  Small JPEG/WebP files that already fit are sent as they are. */
export async function shrinkPicture(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    if (width === bitmap.width && file.size < 400_000 && TYPES.includes(file.type) && file.type !== 'image/png') return file;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; // transparent PNG → white, not black
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not read this picture'))), 'image/jpeg', 0.85));
  } finally {
    bitmap.close();
  }
}

export async function pick(files: File[]): Promise<Picked[]> {
  return Promise.all(files.map(async f => {
    const blob = await shrinkPicture(f);
    return { key: crypto.randomUUID(), blob, url: URL.createObjectURL(blob), name: f.name || 'pasted picture' };
  }));
}

/** Upload one picture (on Send) → its id for POST /chat `image_ids`. */
export async function uploadPicture(blob: Blob, sessionId: string, signal?: AbortSignal): Promise<string> {
  const res = await authFetch(new Request(`${apiUrl}/api/v1/uploads?session_id=${encodeURIComponent(sessionId)}`, {
    method: 'POST', headers: { 'content-type': blob.type || 'image/jpeg' }, body: blob, signal,
  }));
  if (!res.ok) throw await ApiError.from(res);
  return (await res.json()).id as string;
}

/** A sent picture from the history (only its owner may load it → fetched with the token, shown as a blob URL). */
export async function loadPrivatePicture(path: string, signal?: AbortSignal): Promise<string> {
  const res = await authFetch(new Request(`${apiUrl}${path}`, { signal }));
  if (!res.ok) throw await ApiError.from(res);
  return URL.createObjectURL(await res.blob());
}
