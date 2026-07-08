import { describe, it, expect } from 'vitest';
import { parseJsonWithFallback } from './taskOutcome';

describe('parseJsonWithFallback', () => {
  describe('given a JSON-stringified object', () => {
    it('should return the parsed object', () => {
      // Arrange
      const raw = JSON.stringify({ area: 42, unit: 'sqm' });

      // Act
      const parsed = parseJsonWithFallback(raw);

      // Assert
      expect(parsed).toEqual({ area: 42, unit: 'sqm' });
    });
  });

  describe('given a malformed JSON string', () => {
    it('should fall back to the raw string', () => {
      // Arrange
      const raw = 'not-json{';

      // Act
      const parsed = parseJsonWithFallback(raw);

      // Assert
      expect(parsed).toBe('not-json{');
    });
  });

  describe('given null', () => {
    it('should return null', () => {
      // Arrange
      const raw = null;

      // Act
      const parsed = parseJsonWithFallback(raw);

      // Assert
      expect(parsed).toBeNull();
    });
  });
});
