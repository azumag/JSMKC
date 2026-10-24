import { DecodeUTF8, strFromU8 } from 'fflate';

const HAS_NATIVE_DECODER = typeof TextDecoder !== 'undefined';
const CHUNK_BYTES = 1024;

/** Keep fflate's UTF-8 semantics while bounding its fallback string concatenation. */
export function decodeWorkbookXml(bytes: Uint8Array): string {
  if (HAS_NATIVE_DECODER) return strFromU8(bytes);

  const chunks: string[] = [];
  const decoder = new DecodeUTF8((chunk) => chunks.push(chunk));
  if (bytes.length === 0) decoder.push(bytes, true);
  for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
    decoder.push(bytes.subarray(offset, offset + CHUNK_BYTES), offset + CHUNK_BYTES >= bytes.length);
  }
  return chunks.join('');
}
