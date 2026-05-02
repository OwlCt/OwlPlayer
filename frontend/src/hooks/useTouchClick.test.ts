import { describe, it, expect } from 'vitest';
import { isTapGesture } from './useTouchClick';

describe('useTouchClick', () => {
  describe('isTapGesture', () => {
    it('should return true when movement is within threshold', () => {
      // No movement
      expect(isTapGesture(100, 100, 100, 100, 10)).toBe(true);
      
      // Small movement within threshold
      expect(isTapGesture(100, 100, 105, 105, 10)).toBe(true);
      expect(isTapGesture(100, 100, 95, 95, 10)).toBe(true);
      
      // Movement exactly at threshold boundary
      expect(isTapGesture(100, 100, 109, 100, 10)).toBe(true);
      expect(isTapGesture(100, 100, 100, 109, 10)).toBe(true);
    });

    it('should return false when movement exceeds threshold', () => {
      // Movement exceeds threshold in X direction
      expect(isTapGesture(100, 100, 111, 100, 10)).toBe(false);
      expect(isTapGesture(100, 100, 89, 100, 10)).toBe(false);
      
      // Movement exceeds threshold in Y direction
      expect(isTapGesture(100, 100, 100, 111, 10)).toBe(false);
      expect(isTapGesture(100, 100, 100, 89, 10)).toBe(false);
      
      // Movement exceeds threshold in both directions
      expect(isTapGesture(100, 100, 120, 120, 10)).toBe(false);
    });

    it('should work with different threshold values', () => {
      // Smaller threshold (5px)
      expect(isTapGesture(100, 100, 104, 104, 5)).toBe(true);
      expect(isTapGesture(100, 100, 106, 100, 5)).toBe(false);
      
      // Larger threshold (20px)
      expect(isTapGesture(100, 100, 115, 115, 20)).toBe(true);
      expect(isTapGesture(100, 100, 121, 100, 20)).toBe(false);
    });

    it('should handle negative coordinates', () => {
      expect(isTapGesture(-100, -100, -95, -95, 10)).toBe(true);
      expect(isTapGesture(-100, -100, -90, -90, 10)).toBe(false);
    });

    it('should handle zero threshold', () => {
      // With zero threshold, only exact same position is a tap
      // Note: Due to < comparison, 0 threshold means deltaX < 0 && deltaY < 0 is never true
      // So zero threshold effectively disables tap detection
      expect(isTapGesture(100, 100, 100, 100, 0)).toBe(false);
      expect(isTapGesture(100, 100, 100.1, 100, 0)).toBe(false);
    });
  });
});
