/**
 * @module __tests__/lib/utils.test.ts
 * @description Test suite for the `cn` className utility function from `@/lib/utils`.
 *
 * This suite validates the behavior of `cn`, which combines `clsx` for conditional
 * class name merging with `tailwind-merge` for deduplicating and resolving conflicting
 * Tailwind CSS utility classes. Tests cover:
 *
 * - Basic class name concatenation and conditional class inclusion
 * - Tailwind CSS utility conflict resolution (e.g., `px-4` vs `px-2`)
 * - Handling of responsive, dark mode, hover/focus, and arbitrary value prefixes
 * - Edge cases: null, undefined, empty inputs, arrays, objects, template literals
 * - Preservation of non-conflicting and non-Tailwind class names
 */
// __tests__/lib/utils.test.ts
// Test for utility functions
import { describe, it, expect } from '@jest/globals';
import { cn } from '@/lib/utils';

describe('Utility Functions', () => {
  describe('cn - className utility', () => {
    it('should merge class names with clsx', () => {
      const result = cn('class1', 'class2');
      expect(result).toBe('class1 class2');
    });

    it('should handle conditional classes with clsx', () => {
      const result = cn('class1', true && 'class2', false && 'class3');
      expect(result).toBe('class1 class2');
    });

    it('should merge and deduplicate class names with tailwind-merge', () => {
      const result = cn('px-4', 'px-2');
      expect(result).toBe('px-2');
    });

    it('should handle empty inputs', () => {
      const result = cn();
      expect(result).toBe('');
    });

    it('should handle null and undefined inputs', () => {
      const result = cn(null, undefined);
      expect(result).toBe('');
    });

    it('should handle array of class names', () => {
      const result = cn(['class1', 'class2']);
      expect(result).toBe('class1 class2');
    });

    it('should handle object with conditional classes', () => {
      const result = cn({ class1: true, class2: false, class3: true });
      expect(result).toBe('class1 class3');
    });

    it('should handle mixed input types', () => {
      const result = cn('class1', ['class2', 'class3'], { class4: true, class5: false });
      expect(result).toBe('class1 class2 class3 class4');
    });

    it('should prioritize conflicting Tailwind utility classes', () => {
      // tailwind-merge ensures later classes override earlier ones
      const result = cn('p-4', 'p-2');
      expect(result).toBe('p-2');
    });

    it('should handle multiple conflicting utility classes', () => {
      const result = cn('px-4 py-4', 'px-2 py-2');
      expect(result).toBe('px-2 py-2');
    });

    it('should handle spacing utility conflicts', () => {
      const result = cn('m-4', 'mt-2');
      expect(result).toBe('m-4 mt-2');
    });

    it('should handle color utility conflicts', () => {
      const result = cn('bg-red-500', 'bg-blue-500');
      expect(result).toBe('bg-blue-500');
    });

    it('should handle text size utility conflicts', () => {
      const result = cn('text-lg', 'text-sm');
      expect(result).toBe('text-sm');
    });

    it('should combine responsive prefixes correctly', () => {
      const result = cn('p-4', 'md:p-2');
      expect(result).toBe('p-4 md:p-2');
    });

    it('should handle dark mode prefixes', () => {
      const result = cn('bg-white', 'dark:bg-black');
      expect(result).toBe('bg-white dark:bg-black');
    });

    it('should handle arbitrary values correctly', () => {
      const result = cn('p-[10px]', 'p-[20px]');
      expect(result).toBe('p-[20px]');
    });

    it('should preserve non-conflicting utility classes', () => {
      const result = cn('flex', 'items-center', 'justify-center');
      expect(result).toBe('flex items-center justify-center');
    });

    it('should handle empty strings', () => {
      const result = cn('class1', '', 'class2');
      expect(result).toBe('class1 class2');
    });

    it('should trim whitespace from class names', () => {
      const result = cn('  class1  ', '  class2  ');
      expect(result).toBe('class1 class2');
    });

    it('should handle complex conditional expressions', () => {
      const isActive = true;
      const isDisabled = false;
      const result = cn('base-class', isActive && 'active-class', isDisabled && 'disabled-class');
      expect(result).toBe('base-class active-class');
    });

    it('should handle template literal inputs', () => {
      const prefix = 'prefix';
      const suffix = 'suffix';
      const result = cn(`${prefix}-class`, `${suffix}-class`);
      expect(result).toBe('prefix-class suffix-class');
    });

    it('should handle deeply nested conditional objects', () => {
      const result = cn({
        'class1': true,
        'class2': false,
        'class3': true,
        'class4': true,
      });
      expect(result).toBe('class1 class3 class4');
    });

    it('should preserve duplicate non-Tailwind class names', () => {
      const result = cn('class1', 'class2', 'class1');
      expect(result).toBe('class1 class2 class1');
    });

    it('should handle variant-like patterns', () => {
      const variants = {
        primary: 'bg-blue-500 text-white',
        secondary: 'bg-gray-500 text-white',
      };
      const result = cn('base-class', variants.primary);
      expect(result).toBe('base-class bg-blue-500 text-white');
    });

    it('should handle complex responsive and dark mode combinations', () => {
      const result = cn('p-4 md:p-2 lg:p-1', 'dark:bg-white dark:md:bg-black');
      expect(result).toBe('p-4 md:p-2 lg:p-1 dark:bg-white dark:md:bg-black');
    });

    it('should handle state variants like hover and focus', () => {
      const result = cn('bg-blue-500', 'hover:bg-blue-600', 'focus:bg-blue-700');
      expect(result).toBe('bg-blue-500 hover:bg-blue-600 focus:bg-blue-700');
    });

    it('should handle ring and shadow utilities', () => {
      const result = cn('shadow-lg', 'ring-2', 'ring-blue-500');
      expect(result).toBe('shadow-lg ring-2 ring-blue-500');
    });
  });
});
