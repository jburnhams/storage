
// Helper to handle D1 blob quirks in test environments (Miniflare/Vitest)
// where blobs might be stored/returned as CSV strings or number arrays.
export function parseD1Blob(blob: any): ArrayBuffer | null {
  if (!blob) return null;

  let buffer: ArrayBuffer;

  // 1. Handle array of numbers (common in D1 shims)
  if (Array.isArray(blob)) {
    buffer = new Uint8Array(blob).buffer;
  } else if (blob instanceof ArrayBuffer) {
    buffer = blob;
  } else {
    // Unknown type, maybe already stringified?
    return null;
  }

  // 2. Check for "CSV string" quirk (Miniflare sometimes stores bytes as "1,2,3...")
  try {
    const text = new TextDecoder().decode(buffer);
    if (text.includes(',') && /^[\d\s,]+$/.test(text)) {
      const bytes = text.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
      return new Uint8Array(bytes).buffer;
    }
  } catch (e) {
    // Not a string, treat as binary
  }

  return buffer;
}
