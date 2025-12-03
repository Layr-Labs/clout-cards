/**
 * Animation utilities for table events
 *
 * Provides animation functions for player join/leave, card dealing, betting actions, etc.
 * Uses framer-motion for smooth, performant animations.
 */

/**
 * Delay utility for animation sequencing
 *
 * @param ms - Milliseconds to delay
 * @returns Promise that resolves after the delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Join table event payload structure
 */
export interface JoinTableEventPayload {
  kind: 'join_table';
  player: string;
  table: {
    id: number;
    name: string;
  };
  seatNumber: number;
  buyInAmountGwei: string;
  twitterHandle: string;
  twitterAvatarUrl: string | null;
}

/**
 * Leave table event payload structure
 */
export interface LeaveTableEventPayload {
  kind: 'leave_table';
  player: string;
  table: {
    id: number;
    name: string;
  };
  seatNumber: number;
  finalBalanceGwei: string;
  twitterHandle: string;
  twitterAvatarUrl: string | null;
}

/**
 * Animates a player leaving the table
 *
 * @param seatElement - The DOM element for the seat (table-seat-avatar)
 * @param _payload - The leave_table event payload (currently unused, kept for future enhancements)
 * @returns Promise that resolves when animation completes
 */
export async function animatePlayerLeave(
  seatElement: HTMLElement | null,
  _payload: LeaveTableEventPayload
): Promise<void> {
  if (!seatElement) {
    console.warn('[animatePlayerLeave] Seat element not found, skipping animation');
    return;
  }

  // TODO: Implement leave animation in Phase 7
  // For now, just a simple fade out
  seatElement.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out';
  seatElement.style.opacity = '0';
  seatElement.style.transform = 'translate(-50%, -50%) scale(0.8)';
  
  await delay(500);
  
  seatElement.style.transition = '';
  seatElement.style.opacity = '';
  seatElement.style.transform = '';
}

