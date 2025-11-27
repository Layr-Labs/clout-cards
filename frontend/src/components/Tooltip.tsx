import { useState, useRef, useEffect } from 'react';
import './Tooltip.css';

/**
 * Tooltip component
 *
 * Displays a tooltip on hover with customizable positioning.
 *
 * @param children - The element that triggers the tooltip
 * @param content - The tooltip content to display
 * @param position - Preferred position ('top' | 'bottom' | 'left' | 'right'), defaults to 'top'
 */
export function Tooltip({
  children,
  content,
  position = 'top',
}: {
  children: React.ReactNode;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number; actualPosition: 'top' | 'bottom' }>({ top: 0, left: 0, actualPosition: 'top' });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isVisible || !triggerRef.current || !tooltipRef.current) return;

    const updatePosition = () => {
      if (!triggerRef.current || !tooltipRef.current) return;

      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const spacing = 8;
      let top = 0;
      let left = 0;
      let actualPosition: 'top' | 'bottom' = position === 'top' ? 'top' : 'bottom';

      // Calculate horizontal position (center of trigger)
      left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;

      // Calculate vertical position based on preferred position
      if (position === 'top' || position === 'bottom') {
        if (position === 'top') {
          top = triggerRect.top - tooltipRect.height - spacing;
          actualPosition = 'top';
        } else {
          top = triggerRect.bottom + spacing;
          actualPosition = 'bottom';
        }

        // Adjust if tooltip would go off screen vertically
        if (top < 10) {
          top = triggerRect.bottom + spacing;
          actualPosition = 'bottom';
        }
        if (top + tooltipRect.height > window.innerHeight - 10) {
          top = triggerRect.top - tooltipRect.height - spacing;
          actualPosition = 'top';
        }
      } else {
        // Left/right positioning
        if (position === 'left') {
          left = triggerRect.left - tooltipRect.width - spacing;
        } else {
          left = triggerRect.right + spacing;
        }
        top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;

        // Adjust if tooltip would go off screen horizontally
        if (left < 10) {
          left = triggerRect.right + spacing;
        }
        if (left + tooltipRect.width > window.innerWidth - 10) {
          left = triggerRect.left - tooltipRect.width - spacing;
        }
      }

      // Adjust if tooltip would go off screen horizontally
      if (left < 10) {
        left = 10;
      }
      if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10;
      }

      setTooltipPosition({ top, left, actualPosition });
    };

    // Initial position calculation
    requestAnimationFrame(updatePosition);

    // Update on scroll/resize
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isVisible, position]);

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        style={{ display: 'inline-block' }}
      >
        {children}
      </div>
      {isVisible && content && (
        <div
          ref={tooltipRef}
          className={`tooltip ${tooltipPosition.actualPosition}`}
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
          }}
        >
          {content}
        </div>
      )}
    </>
  );
}

