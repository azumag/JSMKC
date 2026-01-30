/**
 * XSS Prevention via DOMPurify
 *
 * Provides input sanitization utilities to prevent Cross-Site Scripting (XSS)
 * attacks by cleaning user-provided strings of potentially malicious HTML,
 * JavaScript, and other injection vectors.
 *
 * Uses isomorphic-dompurify which works in both Node.js (server-side rendering)
 * and browser environments, ensuring consistent sanitization across the
 * Next.js App Router's server and client components.
 *
 * All user input that will be rendered in the UI or stored in the database
 * should pass through these sanitization functions first.
 *
 * Usage:
 *   import { sanitizeInput } from '@/lib/sanitize';
 *   const cleanName = sanitizeInput(userInput);
 *   const cleanBody = sanitizeObject(requestBody);
 */

import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitizes a single string value by removing all potentially dangerous
 * HTML tags, attributes, and JavaScript from the input.
 *
 * DOMPurify strips:
 * - Script tags and event handlers (onclick, onerror, etc.)
 * - Dangerous URI schemes (javascript:, data:, vbscript:)
 * - Malformed HTML that could enable injection
 *
 * The result is a clean string safe for rendering in HTML context.
 *
 * @param str - The raw string to sanitize
 * @returns The sanitized string with all dangerous content removed
 *
 * @example
 *   sanitizeString('<script>alert("xss")</script>Hello')
 *   // Returns: 'Hello'
 *
 *   sanitizeString('<img src=x onerror=alert(1)>')
 *   // Returns: '<img src="x">'
 */
export function sanitizeString(str: string): string {
  // DOMPurify.sanitize handles all XSS vector removal including
  // script tags, event handlers, and dangerous URI schemes.
  // Returns a safe string that can be rendered in HTML without risk.
  return DOMPurify.sanitize(str);
}

/**
 * Recursively sanitizes all string values within a plain object.
 *
 * Traverses the object depth-first, sanitizing every string value found.
 * Non-string values (numbers, booleans, null) are passed through unchanged.
 * Nested objects and arrays are recursively processed.
 *
 * This is particularly useful for sanitizing API request bodies where
 * multiple fields may contain user input.
 *
 * @param obj - The object whose string values should be sanitized
 * @returns A new object with all string values sanitized
 *
 * @example
 *   sanitizeObject({ name: '<b>Player</b>', score: 100 })
 *   // Returns: { name: '<b>Player</b>', score: 100 }
 *   // Note: <b> is safe HTML and preserved; <script> would be removed
 */
export function sanitizeObject(
  obj: Record<string, unknown>
): Record<string, unknown> {
  // Create a new object to avoid mutating the original input.
  // This follows the principle of immutability for safer data flow.
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      // String values get XSS sanitization applied
      sanitized[key] = sanitizeString(value);
    } else if (Array.isArray(value)) {
      // Arrays are recursively sanitized via sanitizeArray
      sanitized[key] = sanitizeArray(value);
    } else if (value !== null && typeof value === 'object') {
      // Nested objects are recursively sanitized
      sanitized[key] = sanitizeObject(value as Record<string, unknown>);
    } else {
      // Non-string primitive values (numbers, booleans, null, undefined)
      // are passed through unchanged as they cannot contain XSS payloads
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Recursively sanitizes all string values within an array.
 *
 * Each element is checked: strings are sanitized, objects and arrays
 * are recursively processed, and primitives are passed through.
 *
 * @param arr - The array whose string elements should be sanitized
 * @returns A new array with all string values sanitized
 *
 * @example
 *   sanitizeArray(['<script>xss</script>', 42, { name: '<b>test</b>' }])
 *   // Returns: ['', 42, { name: '<b>test</b>' }]
 */
export function sanitizeArray(arr: unknown[]): unknown[] {
  // Map creates a new array, preserving immutability of the original
  return arr.map((item) => {
    if (typeof item === 'string') {
      // String elements get XSS sanitization
      return sanitizeString(item);
    } else if (Array.isArray(item)) {
      // Nested arrays are recursively processed
      return sanitizeArray(item);
    } else if (item !== null && typeof item === 'object') {
      // Object elements are recursively sanitized
      return sanitizeObject(item as Record<string, unknown>);
    }
    // Primitive non-string values pass through unchanged
    return item;
  });
}

/**
 * Generic input sanitizer that handles strings, objects, arrays, and
 * other types with appropriate sanitization for each.
 *
 * This is the primary entry point for sanitizing user input of unknown type.
 * It inspects the type of the input and delegates to the appropriate
 * specialized sanitization function.
 *
 * Type parameter T is preserved so the caller gets back the same type
 * they passed in, maintaining type safety in the consuming code.
 *
 * @template T - The type of the input data
 * @param data - The data to sanitize (string, object, array, or primitive)
 * @returns The sanitized data with the same type as the input
 *
 * @example
 *   // String input
 *   const name = sanitizeInput('<script>xss</script>Admin');
 *   // Returns: 'Admin'
 *
 *   // Object input
 *   const body = sanitizeInput({ name: '<b>Player</b>', score: 100 });
 *   // Returns: { name: '<b>Player</b>', score: 100 }
 *
 *   // Number input (passes through unchanged)
 *   const num = sanitizeInput(42);
 *   // Returns: 42
 */
export function sanitizeInput<T>(data: T): T {
  // Handle null and undefined early to avoid type errors
  if (data === null || data === undefined) {
    return data;
  }

  // String values are sanitized with DOMPurify
  if (typeof data === 'string') {
    return sanitizeString(data) as T;
  }

  // Arrays are recursively sanitized element by element
  if (Array.isArray(data)) {
    return sanitizeArray(data) as T;
  }

  // Plain objects are recursively sanitized property by property
  if (typeof data === 'object') {
    return sanitizeObject(data as Record<string, unknown>) as T;
  }

  // All other types (number, boolean, symbol, bigint, function)
  // are returned unchanged as they cannot carry XSS payloads
  return data;
}
