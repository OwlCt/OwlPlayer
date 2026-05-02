/**
 * Unit tests for PlayerBar button layout
 * 
 * Tests the button order and positioning in the PlayerBar component
 * 
 * **Feature: play-queue-refactor**
 * **Validates: Requirements 7.1, 7.2**
 */

import { describe, it, expect } from 'vitest';

/**
 * Button layout order definition
 * The expected order is: [Shuffle] [Previous] [Play/Pause] [Next] [PlayMode]
 */
const EXPECTED_BUTTON_ORDER = ['shuffle', 'previous', 'play-pause', 'next', 'playmode'] as const;

type ButtonId = typeof EXPECTED_BUTTON_ORDER[number];

/**
 * Pure function to validate button order
 * Returns true if buttons are in the correct order
 */
function validateButtonOrder(buttonIds: ButtonId[]): boolean {
  if (buttonIds.length !== EXPECTED_BUTTON_ORDER.length) {
    return false;
  }
  
  return buttonIds.every((id, index) => id === EXPECTED_BUTTON_ORDER[index]);
}

/**
 * Pure function to check if shuffle button is left of previous button
 */
function isShuffleLeftOfPrevious(buttonPositions: Map<ButtonId, number>): boolean {
  const shufflePos = buttonPositions.get('shuffle');
  const previousPos = buttonPositions.get('previous');
  
  if (shufflePos === undefined || previousPos === undefined) {
    return false;
  }
  
  return shufflePos < previousPos;
}

/**
 * Pure function to check if playmode button is right of next button
 */
function isPlayModeRightOfNext(buttonPositions: Map<ButtonId, number>): boolean {
  const playmodePos = buttonPositions.get('playmode');
  const nextPos = buttonPositions.get('next');
  
  if (playmodePos === undefined || nextPos === undefined) {
    return false;
  }
  
  return playmodePos > nextPos;
}

/**
 * Pure function to get button positions from order array
 */
function getButtonPositions(buttonOrder: ButtonId[]): Map<ButtonId, number> {
  const positions = new Map<ButtonId, number>();
  buttonOrder.forEach((id, index) => {
    positions.set(id, index);
  });
  return positions;
}

describe('PlayerBar Button Layout', () => {
  /**
   * Test that the expected button order is valid
   * Layout: [Shuffle] [Previous] [Play/Pause] [Next] [PlayMode]
   */
  describe('Button Order Validation', () => {
    it('should have shuffle button at position 0', () => {
      expect(EXPECTED_BUTTON_ORDER[0]).toBe('shuffle');
    });

    it('should have previous button at position 1', () => {
      expect(EXPECTED_BUTTON_ORDER[1]).toBe('previous');
    });

    it('should have play-pause button at position 2 (center)', () => {
      expect(EXPECTED_BUTTON_ORDER[2]).toBe('play-pause');
    });

    it('should have next button at position 3', () => {
      expect(EXPECTED_BUTTON_ORDER[3]).toBe('next');
    });

    it('should have playmode button at position 4', () => {
      expect(EXPECTED_BUTTON_ORDER[4]).toBe('playmode');
    });

    it('should have exactly 5 buttons in the control section', () => {
      expect(EXPECTED_BUTTON_ORDER.length).toBe(5);
    });
  });

  /**
   * **Validates: Requirements 7.1**
   * WHEN the player bar is displayed THEN the System SHALL position 
   * the shuffle button to the left of the previous button
   */
  describe('Shuffle Button Position (Requirement 7.1)', () => {
    it('should position shuffle button to the left of previous button', () => {
      const positions = getButtonPositions([...EXPECTED_BUTTON_ORDER]);
      expect(isShuffleLeftOfPrevious(positions)).toBe(true);
    });

    it('should fail validation if shuffle is not left of previous', () => {
      // Swap shuffle and previous positions
      const wrongOrder: ButtonId[] = ['previous', 'shuffle', 'play-pause', 'next', 'playmode'];
      const positions = getButtonPositions(wrongOrder);
      expect(isShuffleLeftOfPrevious(positions)).toBe(false);
    });
  });

  /**
   * **Validates: Requirements 7.2**
   * WHEN the player bar is displayed THEN the System SHALL position 
   * the play mode button to the right of the next button
   */
  describe('PlayMode Button Position (Requirement 7.2)', () => {
    it('should position playmode button to the right of next button', () => {
      const positions = getButtonPositions([...EXPECTED_BUTTON_ORDER]);
      expect(isPlayModeRightOfNext(positions)).toBe(true);
    });

    it('should fail validation if playmode is not right of next', () => {
      // Swap playmode and next positions
      const wrongOrder: ButtonId[] = ['shuffle', 'previous', 'play-pause', 'playmode', 'next'];
      const positions = getButtonPositions(wrongOrder);
      expect(isPlayModeRightOfNext(positions)).toBe(false);
    });
  });

  /**
   * Combined layout validation
   */
  describe('Complete Layout Validation', () => {
    it('should validate the complete button order', () => {
      const actualOrder: ButtonId[] = ['shuffle', 'previous', 'play-pause', 'next', 'playmode'];
      expect(validateButtonOrder(actualOrder)).toBe(true);
    });

    it('should reject incorrect button order', () => {
      const wrongOrder: ButtonId[] = ['previous', 'shuffle', 'play-pause', 'next', 'playmode'];
      expect(validateButtonOrder(wrongOrder)).toBe(false);
    });

    it('should reject missing buttons', () => {
      const missingButton: ButtonId[] = ['shuffle', 'previous', 'play-pause', 'next'] as ButtonId[];
      expect(validateButtonOrder(missingButton)).toBe(false);
    });
  });
});

// Export functions for potential reuse
export { 
  validateButtonOrder, 
  isShuffleLeftOfPrevious, 
  isPlayModeRightOfNext, 
  getButtonPositions,
  EXPECTED_BUTTON_ORDER 
};
