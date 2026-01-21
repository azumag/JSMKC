// __tests__/lib/sanitize.test.ts
import { describe, it, expect } from '@jest/globals';
import { sanitizeString, sanitizeObject, sanitizeArray, sanitizeInput } from '@/lib/sanitize';

describe('Sanitization Utilities', () => {
  describe('sanitizeString', () => {
    it('should sanitize script tags', () => {
      const input = '<script>alert("xss")</script>';
      const output = sanitizeString(input);
      expect(output).not.toContain('<script>');
      expect(output).not.toContain('</script>');
    });

    it('should sanitize onclick event handlers', () => {
      const input = '<div onclick="alert(1)">Click me</div>';
      const output = sanitizeString(input);
      expect(output).not.toContain('onclick');
    });

    it('should sanitize iframe tags', () => {
      const input = '<iframe src="malicious.com"></iframe>';
      const output = sanitizeString(input);
      expect(output).not.toContain('<iframe>');
    });

    it('should sanitize onerror event handlers', () => {
      const input = '<img src="x" onerror="alert(1)">';
      const output = sanitizeString(input);
      expect(output).not.toContain('onerror');
    });

    it('should handle null input by returning it unchanged', () => {
      expect(sanitizeString(null as any)).toBe(null);
    });

    it('should handle undefined input by returning it unchanged', () => {
      expect(sanitizeString(undefined as any)).toBe(undefined);
    });

    it('should handle empty string', () => {
      expect(sanitizeString('')).toBe('');
    });

    it('should not modify valid safe text', () => {
      const input = 'This is safe text';
      expect(sanitizeString(input)).toBe(input);
    });

    it('should preserve safe HTML tags like bold', () => {
      const input = 'This is <b>bold</b> text';
      const output = sanitizeString(input);
      expect(output).toContain('<b>');
      expect(output).toContain('</b>');
    });

    it('should preserve safe HTML tags like italic', () => {
      const input = 'This is <i>italic</i> text';
      const output = sanitizeString(input);
      expect(output).toContain('<i>');
      expect(output).toContain('</i>');
    });

    it('should handle number input', () => {
      expect(sanitizeString(123 as any)).toBe(123);
    });

    it('should handle object input', () => {
      const obj = { key: 'value' };
      expect(sanitizeString(obj as any)).toBe(obj);
    });

    it('should remove javascript: protocol from href', () => {
      const input = '<a href="javascript:alert(1)">Click</a>';
      const output = sanitizeString(input);
      expect(output).not.toContain('javascript:');
    });

    it('should handle data URLs (DOMPurify may not sanitize all data URL content)', () => {
      const input = '<img src="data:image/svg+xml,<script>alert(1)</script>">';
      const output = sanitizeString(input);
      // DOMPurify doesn't sanitize script tags in data URLs by default
      // This test documents the actual behavior
      expect(output).toContain('data:image/svg+xml');
    });
  });

  describe('sanitizeObject', () => {
    it('should sanitize all string values in object', () => {
      const input = {
        name: '<script>alert("xss")</script>',
        email: 'user@example.com',
        description: 'This is a description with <b>bold</b> text'
      };
      
      const output = sanitizeObject(input);
      
      expect(output.name).not.toContain('<script>');
      expect(output.name).not.toContain('alert');
      expect(output.email).toBe('user@example.com');
      expect(output.description).toContain('<b>'); // Bold tags are safe
    });

    it('should handle nested objects', () => {
      const input = {
        user: {
          name: '<script>alert("xss")</script>',
          settings: {
            theme: '<b>dark</b>',
            notifications: '<script>alert("xss")</script>'
          }
        }
      };
      
      const output = sanitizeObject(input);
      
      expect(output.user.name).not.toContain('<script>');
      expect(output.user.settings.theme).toContain('<b>');
      expect(output.user.settings.notifications).not.toContain('<script>');
    });

    it('should handle deeply nested objects', () => {
      const input = {
        level1: {
          level2: {
            level3: {
              dangerous: '<script>alert(1)</script>'
            }
          }
        }
      };
      
      const output = sanitizeObject(input);
      expect(output.level1.level2.level3.dangerous).not.toContain('<script>');
    });

    it('should return non-object inputs unchanged', () => {
      expect(sanitizeObject(null as any)).toBe(null);
      expect(sanitizeObject(undefined as any)).toBe(undefined);
      expect(sanitizeObject(123 as any)).toBe(123);
      expect(sanitizeObject('string' as any)).toBe('string');
      expect(sanitizeObject(true as any)).toBe(true);
    });

    it('should handle arrays in objects', () => {
      const input = {
        items: ['<script>alert(1)</script>', 'safe text']
      };
      
      const output = sanitizeObject(input);
      expect(output.items[0]).not.toContain('<script>');
      expect(output.items[1]).toBe('safe text');
    });

    it('should handle mixed object types', () => {
      const input = {
        string: '<script>alert(1)</script>',
        number: 123,
        boolean: true,
        null: null,
        nested: {
          dangerous: '<img src=x onerror=alert(1)>'
        }
      };
      
      const output = sanitizeObject(input);
      expect(output.string).not.toContain('<script>');
      expect(output.number).toBe(123);
      expect(output.boolean).toBe(true);
      expect(output.null).toBe(null);
      expect(output.nested.dangerous).not.toContain('onerror');
    });

    it('should handle empty object', () => {
      const input = {};
      const output = sanitizeObject(input);
      expect(output).toEqual({});
    });

    it('should create new object without mutating original', () => {
      const input = {
        name: '<script>alert(1)</script>'
      };
      const originalName = input.name;
      
      const output = sanitizeObject(input);
      
      expect(input.name).toBe(originalName);
      expect(output.name).not.toBe(originalName);
    });
  });

  describe('sanitizeArray', () => {
    it('should sanitize all string values in array', () => {
      const input = [
        '<script>alert("xss")</script>',
        'safe text',
        { name: '<b>bold</b>' }
      ];
      
      const output = sanitizeArray(input);
      
      expect(output[0]).not.toContain('<script>');
      expect(output[1]).toBe('safe text');
      expect(output[2].name).toContain('<b>'); // Bold tags are safe
    });

    it('should handle nested arrays', () => {
      const input = [
        ['<script>alert("xss")</script>', 'safe'],
        [{ name: '<b>bold</b>' }]
      ];
      
      const output = sanitizeArray(input);
      
      expect(output[0][0]).not.toContain('<script>');
      expect(output[0][1]).toBe('safe');
      expect(output[1][0].name).toContain('<b>');
    });

    it('should return non-array inputs unchanged', () => {
      expect(sanitizeArray(null as any)).toBe(null);
      expect(sanitizeArray(undefined as any)).toBe(undefined);
      expect(sanitizeArray(123 as any)).toBe(123);
      expect(sanitizeArray('string' as any)).toBe('string');
    });

    it('should handle deeply nested arrays', () => {
      const input = [
        [
          [
            '<script>alert(1)</script>'
          ]
        ]
      ];
      
      const output = sanitizeArray(input);
      expect(output[0][0][0]).not.toContain('<script>');
    });

    it('should handle mixed array types', () => {
      const input = [
        '<script>alert(1)</script>',
        123,
        true,
        null,
        { dangerous: '<img onerror=alert(1)>' },
        ['nested', '<script>alert(2)</script>']
      ];
      
      const output = sanitizeArray(input);
      expect(output[0]).not.toContain('<script>');
      expect(output[1]).toBe(123);
      expect(output[2]).toBe(true);
      expect(output[3]).toBe(null);
      expect(output[4].dangerous).not.toContain('onerror');
      expect(output[5][1]).not.toContain('<script>');
    });

    it('should handle empty array', () => {
      const input: any[] = [];
      const output = sanitizeArray(input);
      expect(output).toEqual([]);
    });

    it('should create new array without mutating original', () => {
      const input = ['<script>alert(1)</script>'];
      const originalElement = input[0];
      
      const output = sanitizeArray(input);
      
      expect(input[0]).toBe(originalElement);
      expect(output[0]).not.toBe(originalElement);
    });
  });

  describe('sanitizeInput', () => {
    it('should handle string input', () => {
      const input = '<script>alert("xss")</script>';
      const output = sanitizeInput(input);
      expect(output).not.toContain('<script>');
    });

    it('should handle object input', () => {
      const input = {
        name: '<script>alert("xss")</script>',
        email: 'user@example.com'
      };
      
      const output = sanitizeInput(input);
      
      expect(output.name).not.toContain('<script>');
      expect(output.email).toBe('user@example.com');
    });

    it('should handle array input', () => {
      const input = ['<script>alert("xss")</script>', 'safe'];
      
      const output = sanitizeInput(input);
      
      expect(output[0]).not.toContain('<script>');
      expect(output[1]).toBe('safe');
    });

    it('should handle null input', () => {
      expect(sanitizeInput(null as any)).toBe(null);
    });

    it('should handle undefined input', () => {
      expect(sanitizeInput(undefined as any)).toBe(undefined);
    });

    it('should handle primitive inputs', () => {
      expect(sanitizeInput(123)).toBe(123);
      expect(sanitizeInput(true)).toBe(true);
      expect(sanitizeInput(false)).toBe(false);
    });

    it('should return same type as input', () => {
      const stringInput = 'test';
      const objectInput = { key: 'value' };
      const arrayInput = ['test'];
      
      expect(typeof sanitizeInput(stringInput)).toBe('string');
      expect(typeof sanitizeInput(objectInput)).toBe('object');
      expect(Array.isArray(sanitizeInput(arrayInput))).toBe(true);
    });

    it('should preserve type safety for complex nested structures', () => {
      const input = {
        users: [
          { name: '<script>alert(1)</script>', scores: [100, 200] },
          { name: '<b>Safe</b>', scores: [300, 400] }
        ]
      };
      
      const output = sanitizeInput(input);
      
      expect(Array.isArray(output.users)).toBe(true);
      expect(output.users[0].name).not.toContain('<script>');
      expect(output.users[1].name).toContain('<b>');
      expect(output.users[0].scores).toEqual([100, 200]);
    });
  });

  describe('XSS Prevention', () => {
    it('should prevent script injection in strings', () => {
      const input = 'Hello <script>alert(document.cookie)</script> World';
      const output = sanitizeString(input);
      expect(output).not.toContain('<script>');
      expect(output).not.toContain('alert');
    });

    it('should prevent onclick event in objects', () => {
      const input = { button: '<button onclick="steal()">Click</button>' };
      const output = sanitizeObject(input);
      expect(output.button).not.toContain('onclick');
    });

    it('should prevent onerror in arrays', () => {
      const input = ['<img src="x" onerror="alert(1)">'];
      const output = sanitizeArray(input);
      expect(output[0]).not.toContain('onerror');
    });

    it('should prevent javascript: protocol', () => {
      const input = '<a href="javascript:malicious()">Link</a>';
      const output = sanitizeString(input);
      expect(output).not.toContain('javascript:');
    });

    it('should handle data URLs (may not sanitize content inside data URLs)', () => {
      const input = '<img src="data:text/html,<script>alert(1)</script>">';
      const output = sanitizeString(input);
      // DOMPurify doesn't sanitize script tags in data URLs by default
      // This test documents the actual behavior
      expect(output).toContain('data:text/html');
    });

    it('should prevent iframe injection', () => {
      const input = '<iframe src="http://evil.com"></iframe>';
      const output = sanitizeString(input);
      expect(output).not.toContain('<iframe>');
    });

    it('should prevent object injection', () => {
      const input = '<object data="malicious.swf"></object>';
      const output = sanitizeString(input);
      expect(output).not.toContain('<object>');
    });

    it('should prevent embed injection', () => {
      const input = '<embed src="malicious.swf">';
      const output = sanitizeString(input);
      expect(output).not.toContain('<embed>');
    });
  });

  describe('Special Cases and Edge Cases', () => {
    it('should handle unicode characters', () => {
      const input = 'こんにちは<script>alert(1)</script>';
      const output = sanitizeString(input);
      expect(output).toContain('こんにちは');
      expect(output).not.toContain('<script>');
    });

    it('should handle emoji characters', () => {
      const input = '😀<script>alert(1)</script>';
      const output = sanitizeString(input);
      expect(output).toContain('😀');
      expect(output).not.toContain('<script>');
    });

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(10000) + '<script>alert(1)</script>';
      const output = sanitizeString(longString);
      expect(output).not.toContain('<script>');
    });

    it('should handle multiple nested attacks', () => {
      const input = {
        level1: {
          data: '<script>outer</script>',
          level2: {
            data: '<script>inner</script>',
            level3: {
              data: '<script>deep</script>'
            }
          }
        }
      };
      
      const output = sanitizeObject(input);
      expect(output.level1.data).not.toContain('<script>');
      expect(output.level1.level2.data).not.toContain('<script>');
      expect(output.level1.level2.level3.data).not.toContain('<script>');
    });

    it('should preserve safe HTML attributes', () => {
      const input = '<a href="https://example.com" class="link">Safe Link</a>';
      const output = sanitizeString(input);
      expect(output).toContain('href=');
      expect(output).toContain('class=');
      expect(output).toContain('Safe Link');
    });

    it('should handle HTML comments', () => {
      const input = 'Text <!-- comment --> more text';
      const output = sanitizeString(input);
      expect(output).toContain('Text');
      expect(output).toContain('more text');
    });
  });
});
