
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
