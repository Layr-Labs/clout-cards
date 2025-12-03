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
 * Animates a player joining the table
 *
 * This function orchestrates the multi-stage join animation:
 * 1. Spotlight reveal at the seat
 * 2. Circle glow (joinFlourish) and avatar image fade-in (simultaneous)
 * 3. Info box slide out like a drawer
 * 4. Balance count-up animation
 * 5. Stand up button fade-in
 *
 * @param seatElement - The DOM element for the seat (table-seat-avatar)
 * @param _payload - The join_table event payload (currently unused, kept for future enhancements)
 * @returns Promise that resolves when animation completes
 */
export async function animatePlayerJoin(
  seatElement: HTMLElement | null,
  _payload: JoinTableEventPayload
): Promise<void> {
  if (!seatElement) {
    console.warn('[animatePlayerJoin] Seat element not found, skipping animation');
    return;
  }

  const seatRect = seatElement.getBoundingClientRect();
  const seatCenterX = seatRect.left + seatRect.width / 2;
  const seatCenterY = seatRect.top + seatRect.height / 2;

  // Hide info box initially (they'll be animated in later)
  const infoBox = seatElement.querySelector('.table-seat-player-info') as HTMLElement;
  
  if (infoBox) {
    infoBox.style.opacity = '0';
    infoBox.style.width = '0';
    infoBox.style.overflow = 'hidden';
    // Check if info box has the right-side class to determine slide direction
    const isRightSide = infoBox.classList.contains('table-seat-player-info-right');
    infoBox.style.transform = isRightSide ? 'translateX(20px)' : 'translateX(-20px)';
  }

  // Create spotlight overlay
  const spotlight = document.createElement('div');
  spotlight.className = 'table-seat-spotlight';
  spotlight.style.cssText = `
    position: fixed;
    left: ${seatCenterX}px;
    top: ${seatCenterY}px;
    width: 120px;
    height: 120px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(212, 175, 55, 0.4) 0%, rgba(212, 175, 55, 0.1) 50%, transparent 70%);
    pointer-events: none;
    z-index: 1000;
    transform: translate(-50%, -50%);
    animation: spotlightPulse 0.2s ease-out;
  `;
  document.body.appendChild(spotlight);

  // Add spotlight pulse animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spotlightPulse {
      0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
      100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }
  `;
  document.head.appendChild(style);

  // Stage 0: Fade out buy-in button (if present) - happens immediately
  const buyInButton = seatElement.querySelector('.table-seat-buy-in-button') as HTMLElement;
  if (buyInButton) {
    buyInButton.style.transition = 'opacity 0.2s ease-in, transform 0.2s ease-in';
    buyInButton.style.opacity = '0';
    buyInButton.style.transform = 'scale(0.8)';
    // Remove button from DOM after fade completes
    setTimeout(() => {
      if (buyInButton.parentNode) {
        buyInButton.style.display = 'none';
      }
    }, 200);
  }

  // Small delay to let buy-in button fade
  await delay(100);

  // Stage 1: Spotlight reveal (100-300ms)
  await delay(200);

  // Stage 2: joinFlourish + Avatar image fade-in (ALL START SIMULTANEOUSLY)
  seatElement.setAttribute('data-animating-join', 'true');
  
  // Start joinFlourish animation on seat element (circle glow)
  const flourishStyle = document.createElement('style');
  flourishStyle.textContent = `
    @keyframes joinFlourish {
      0% { 
        filter: drop-shadow(0 0 0px rgba(212, 175, 55, 0));
        transform: translate(-50%, -50%) scale(1);
      }
      50% {
        filter: drop-shadow(0 0 20px rgba(212, 175, 55, 0.8));
        transform: translate(-50%, -50%) scale(1.05);
      }
      100% {
        filter: drop-shadow(0 0 0px rgba(212, 175, 55, 0));
        transform: translate(-50%, -50%) scale(1);
      }
    }
    @keyframes avatarImageFadeIn {
      0% {
        opacity: 0;
      }
      100% {
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(flourishStyle);
  
  seatElement.style.animation = 'joinFlourish 0.6s ease-out';
  
  // Fade in avatar IMAGE (not the circle - circle is already visible)
  const avatarImage = seatElement.querySelector('.table-seat-avatar-image') as HTMLElement;
  const avatarInitial = seatElement.querySelector('.table-seat-avatar-initial') as HTMLElement;
  if (avatarImage) {
    avatarImage.style.opacity = '0';
    avatarImage.style.animation = 'avatarImageFadeIn 0.6s ease-out forwards';
  } else if (avatarInitial) {
    avatarInitial.style.opacity = '0';
    avatarInitial.style.animation = 'avatarImageFadeIn 0.6s ease-out forwards';
  }
  await delay(600); // Wait for avatar image fade-in to complete

  // Stage 3: Info box slide out like a drawer (after avatar is visible)
  // Balance is already set to animate (starts at 0), so it will be visible at 0 when box slides out
  if (infoBox) {
    // Slide out animation
    infoBox.style.transition = 'opacity 0.3s ease-out 0.2s, width 0.4s ease-out, transform 0.4s ease-out';
    requestAnimationFrame(() => {
      infoBox.style.opacity = '1';
      infoBox.style.width = 'auto';
      infoBox.style.transform = 'translateX(0)';
    });
  }
  
  await delay(200); // Small delay before starting balance count-up (after box starts sliding)
  
  // Stage 4: Balance count-up starts (balance is already at 0, now animate to target)
  // Balance animation is handled by React state (BalanceDisplay component)
  // The animation will start automatically when isAnimating becomes true
  await delay(500); // Wait for balance animation to complete

  // Stage 5: Trigger fade-in animation on stand up button and fade out spotlight simultaneously
  const standUpButton = seatElement.querySelector('.table-seat-stand-up-button') as HTMLElement;
  if (standUpButton) {
    // Add animation class to trigger fade-in
    standUpButton.classList.add('animate-in');
  }

  // Fade out spotlight at the same time
  if (spotlight) {
    spotlight.style.transition = 'opacity 0.5s ease-out';
    spotlight.style.opacity = '0';
  }

  await delay(500); // Wait for both animations to complete

  // Cleanup
  spotlight.remove();
  style.remove();
  flourishStyle.remove();
  seatElement.removeAttribute('data-animating-join');
  seatElement.style.animation = '';
  
  // Clean up inline styles (let CSS take over)
  if (avatarImage) {
    avatarImage.style.animation = '';
    avatarImage.style.opacity = '';
  }
  if (avatarInitial) {
    avatarInitial.style.animation = '';
    avatarInitial.style.opacity = '';
  }
  if (infoBox) {
    infoBox.style.transition = '';
    infoBox.style.opacity = '';
    infoBox.style.width = '';
    infoBox.style.transform = '';
    infoBox.style.overflow = '';
  }
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

