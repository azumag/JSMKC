import { sanitizeString, sanitizeObject, sanitizeArray, sanitizeInput } from '@/lib/sanitize';

describe('Sanitize Utilities', () => {
  describe('sanitizeString', () => {
    it('should return string as-is if it is a string', () => {
      const result = sanitizeString('test string');
      expect(result).toBe('test string');
    });

    it('should return null as-is', () => {
      const result = sanitizeString(null);
      expect(result).toBeNull();
    });

    it('should return undefined as-is', () => {
      const result = sanitizeString(undefined);
      expect(result).toBeUndefined();
    });

    it('should return number as-is', () => {
      const result = sanitizeString(42);
      expect(result).toBe(42);
    });

    it('should return boolean as-is', () => {
      const result = sanitizeString(true);
      expect(result).toBe(true);
    });

    it('should return empty string as-is', () => {
      const result = sanitizeString('');
      expect(result).toBe('');
    });

    it('should handle special characters', () => {
      const result = sanitizeString('Hello <script>alert("XSS")</script>');
      expect(result).toBe('Hello ');
    });

    it('should handle HTML entities', () => {
      const result = sanitizeString('Test &amp; &lt; &gt;');
      expect(result).toBe('Test &amp; &lt; &gt;');
    });

    it('should handle quotes', () => {
      const result = sanitizeString('He said "Hello"');
      expect(result).toBe('He said "Hello"');
    });

    it('should handle newlines', () => {
      const result = sanitizeString('Line 1\nLine 2');
      expect(result).toBe('Line 1\nLine 2');
    });
  });

  describe('sanitizeArray', () => {
    it('should return array as-is if it is an array', () => {
      const result = sanitizeArray(['test', 123, true]);
      expect(result).toEqual(['test', 123, true]);
    });

    it('should return non-array values as-is', () => {
      const result = sanitizeArray('not an array');
      expect(result).toBe('not an array');
    });

    it('should sanitize string elements', () => {
      const result = sanitizeArray(['<script>alert("XSS")</script>', 'safe string']);
      expect(result).toEqual(['', 'safe string']);
    });

    it('should sanitize nested arrays', () => {
      const result = sanitizeArray(['<script>', ['<div>', '<p>']]);
      expect(result).toEqual(['', ['<div></div>', '<p></p>']]);
    });

    it('should sanitize objects in array', () => {
      const obj = { name: '<script>alert("XSS")</script>', age: 25 };
      const result = sanitizeArray([obj, { title: '<div>' }]);
      expect(result).toEqual([{ name: '', age: 25 }, { title: '<div></div>' }]);
    });

    it('should handle empty array', () => {
      const result = sanitizeArray([]);
      expect(result).toEqual([]);
    });

    it('should handle mixed types in array', () => {
      const result = sanitizeArray(['<script>', 123, true, null, undefined]);
      expect(result).toEqual(['', 123, true, null, undefined]);
    });
  });

  describe('sanitizeObject', () => {
    it('should return object as-is if it is an object', () => {
      const obj = { name: 'test', value: 123 };
      const result = sanitizeObject(obj);
      expect(result).toEqual(obj);
    });

    it('should return null as-is', () => {
      const result = sanitizeObject(null);
      expect(result).toBeNull();
    });

    it('should return undefined as-is', () => {
      const result = sanitizeObject(undefined);
      expect(result).toBeUndefined();
    });

    it('should return non-object values as-is', () => {
      const result = sanitizeObject('not an object');
      expect(result).toBe('not an object');
    });

    it('should sanitize string values', () => {
      const result = sanitizeObject({ name: '<script>alert("XSS")</script>' });
      expect(result).toEqual({ name: '' });
    });

    it('should sanitize nested objects', () => {
      const result = sanitizeObject({ user: { name: '<div>' } });
      expect(result).toEqual({ user: { name: '<div></div>' } });
    });

    it('should sanitize arrays in object', () => {
      const result = sanitizeObject({ items: ['<script>', '<div>'] });
      expect(result).toEqual({ items: ['', '<div></div>'] });
    });

    it('should sanitize deeply nested objects', () => {
      const result = sanitizeObject({ 
        user: { 
          profile: { 
            bio: '<script>alert("XSS")</script>' 
          } 
        } 
      });
      expect(result).toEqual({ 
        user: { 
          profile: { 
            bio: '' 
          } 
        } 
      });
    });

    it('should sanitize complex nested structure', () => {
      const result = sanitizeObject({
        user: {
          name: '<script>',
          posts: [
            { title: '<div>', content: '<p>' }
          ]
        }
      });
      expect(result).toEqual({
        user: {
          name: '',
          posts: [
            { title: '<div></div>', content: '<p></p>' }
          ]
        }
      });
    });

    it('should handle empty object', () => {
      const result = sanitizeObject({});
      expect(result).toEqual({});
    });

    it('should handle object with null values', () => {
      const result = sanitizeObject({ name: null, value: undefined });
      expect(result).toEqual({ name: null, value: undefined });
    });

    it('should handle object with number values', () => {
      const result = sanitizeObject({ count: 42, price: 19.99 });
      expect(result).toEqual({ count: 42, price: 19.99 });
    });

    it('should handle object with boolean values', () => {
      const result = sanitizeObject({ active: true, disabled: false });
      expect(result).toEqual({ active: true, disabled: false });
    });
  });

  describe('sanitizeInput', () => {
    it('should sanitize string input', () => {
      const result = sanitizeInput('<script>alert("XSS")</script>') as string;
      expect(result).toBe('');
    });

it('should sanitize array input', () => {
      const result = sanitizeInput(['<script>', 'safe']) as string[];
      expect(result).toEqual(['', 'safe']);
    });

    it('should sanitize object input', () => {
      const result = sanitizeInput({ name: '<script>' }) as { name: string };
      expect(result).toEqual({ name: '' });
    });

    it('should return non-string, non-array, non-object input as-is', () => {
      const result = sanitizeInput(42) as number;
      expect(result).toBe(42);
    });

    it('should return null input as-is', () => {
      const result = sanitizeInput(null) as null;
      expect(result).toBeNull();
    });

    it('should return undefined input as-is', () => {
      const result = sanitizeInput(undefined) as undefined;
      expect(result).toBeUndefined();
    });

    it('should return boolean input as-is', () => {
      const result = sanitizeInput(true) as boolean;
      expect(result).toBe(true);
    });

    it('should handle complex nested input', () => {
      const input = {
        user: {
          name: '<script>',
          posts: [
            { title: '<div>', comments: ['<p>'] }
          ]
        }
      };
      const result = sanitizeInput(input) as typeof input;
      expect(result).toEqual({
        user: {
          name: '',
          posts: [
            { title: '<div></div>', comments: ['<p></p>'] }
          ]
        }
      });
    });
  });
});
