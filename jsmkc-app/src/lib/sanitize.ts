import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitizes a string to prevent XSS attacks
 */
export function sanitizeString(str: string): string {
  if (typeof str !== 'string') {
    return str;
  }
  return DOMPurify.sanitize(str);
}

/**
 * Recursively sanitizes all string values in an object
 */
export function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const sanitized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = sanitizeArray(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Recursively sanitizes all string values in an array
 */
export function sanitizeArray(arr: unknown[]): unknown[] {
  if (!Array.isArray(arr)) {
    return arr;
  }

  return arr.map((item) => {
    if (typeof item === 'string') {
      return sanitizeString(item);
    } else if (Array.isArray(item)) {
      return sanitizeArray(item);
    } else if (typeof item === 'object' && item !== null) {
      return sanitizeObject(item as Record<string, unknown>);
    }
    return item;
  });
}

/**
 * Generic sanitizer that handles strings, objects, and arrays
 */
export function sanitizeInput<T>(data: T): T {
  if (typeof data === 'string') {
    return sanitizeString(data) as T;
  } else if (Array.isArray(data)) {
    return sanitizeArray(data) as T;
  } else if (typeof data === 'object' && data !== null) {
    return sanitizeObject(data as Record<string, unknown>) as T;
  }
  return data;
}