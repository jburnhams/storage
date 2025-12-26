
export const SUPPORTED_TYPES = [
  'text/plain',
  'application/json',
  'application/octet-stream',
  'image/png',
  'image/jpeg',
  'boolean',
  'integer',
  'float',
  'date',
  'timestamp'
];

export const SIMPLE_TYPES = [
  'boolean',
  'integer',
  'float',
  'date',
  'timestamp'
];

export function validateEntryValue(type: string, value: string | null): string | null {
  // If value is null, it's valid (unless required by other logic, but type-wise it's okay for optional fields)
  // However, usually specific types imply content. If value is null, we can skip validation or assume it's valid (empty).
  if (value === null) return null;

  switch (type) {
    case 'application/json':
      try {
        JSON.parse(value);
      } catch (e) {
        return 'Invalid JSON format';
      }
      break;

    case 'boolean':
      if (value !== 'true' && value !== 'false') {
        return 'Value must be "true" or "false"';
      }
      break;

    case 'integer': {
      const num = Number(value);
      if (!Number.isInteger(num)) {
        return 'Value must be an integer';
      }
      // Check if the string actually looks like an integer (no decimals)
      // "123.0" is an integer in JS, but usually "integer" type implies no decimal point in string.
      // Let's be strict.
      if (!/^-?\d+$/.test(value)) {
         return 'Value must be an integer string';
      }
      break;
    }

    case 'float': {
      const num = Number(value);
      if (isNaN(num)) {
        return 'Value must be a number';
      }
      break;
    }

    case 'date':
      // YYYY-MM-DD
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return 'Value must be in YYYY-MM-DD format';
      }
      if (isNaN(Date.parse(value))) {
        return 'Invalid date';
      }
      break;

    case 'timestamp':
      // ISO 8601
      if (isNaN(Date.parse(value))) {
        return 'Invalid timestamp';
      }
      break;
  }

  return null;
}

export function deriveType(jsonValue: any, blobValue: ArrayBuffer | null, stringValue: string | null): string {
  if (jsonValue !== undefined && jsonValue !== null) {
    if (typeof jsonValue === 'boolean') {
      return 'boolean';
    }
    if (typeof jsonValue === 'number') {
      if (Number.isInteger(jsonValue)) {
        return 'integer';
      }
      return 'float';
    }
    if (typeof jsonValue === 'string') {
      // Check for date/timestamp
      // Date: YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(jsonValue) && !isNaN(Date.parse(jsonValue))) {
        return 'date';
      }
      // Timestamp: ISO 8601
      // Simple check: if it parses as date and looks like ISO
      if (!isNaN(Date.parse(jsonValue)) && jsonValue.includes('T')) {
          return 'timestamp';
      }
      return 'text/plain';
    }
    if (typeof jsonValue === 'object') {
      return 'application/json';
    }
  }

  if (blobValue) {
    const bytes = new Uint8Array(blobValue.slice(0, 4));
    // PNG: 89 50 4E 47
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
      return 'image/png';
    }
    // JPEG: FF D8 FF
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
      return 'image/jpeg';
    }
    // GIF: 47 49 46 38
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
      return 'image/gif';
    }
    // WebP: 52 49 46 46 ... 57 45 42 50 (RIFF...WEBP)
    // Need more bytes for full check but simplistic:
    // RIFF at 0, WEBP at 8
    if (blobValue.byteLength >= 12) {
       const riff = new Uint8Array(blobValue.slice(0, 4));
       const webp = new Uint8Array(blobValue.slice(8, 12));
       if (riff[0] === 0x52 && riff[1] === 0x49 && riff[2] === 0x46 && riff[3] === 0x46 &&
           webp[0] === 0x57 && webp[1] === 0x45 && webp[2] === 0x42 && webp[3] === 0x50) {
             return 'image/webp';
           }
    }

    return 'application/octet-stream';
  }

  if (stringValue !== null) {
    return 'text/plain';
  }

  return 'application/octet-stream'; // Default fallback
}
