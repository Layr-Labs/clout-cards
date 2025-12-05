/**
 * Hand History Component
 *
 * Slide-out panel displaying completed hands for a poker table.
 * Shows hand summaries with community cards, pot sizes, and winners.
 * Clicking a hand opens the detail view with TEE verification.
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaChevronRight, FaSpinner } from 'react-icons/fa';
import { Card } from './Card';
import { HandHistoryDetail } from './HandHistoryDetail';
import { getHandHistory, type HandSummary } from '../services/handHistory';
import { formatEth } from '../utils/formatEth';
import './HandHistory.css';

/**
 * Props for the HandHistory component
 */
interface HandHistoryProps {
  /** Whether the history panel is open */
  isOpen: boolean;
  /** Callback to close the panel */
  onClose: () => void;
  /** Table ID to fetch history for */
  tableId: number;
}

/**
 * Formats a timestamp into a short date/time string
 *
 * @param timestamp - ISO timestamp string
 * @returns Formatted string (e.g., "Dec 5, 2:30 PM")
 */
function formatDateTime(timestamp: string | null): string {
  if (!timestamp) return 'N/A';
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Formats a wallet address for display (shortened)
 *
 * @param address - Full Ethereum address
 * @returns Shortened address (e.g., "0x1234...5678")
 */
function formatAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Hand History Component
 *
 * Slide-in panel from the right side that displays completed hands.
 * Features:
 * - Animated slide-in/out
 * - Loading state while fetching
 * - Scrollable list of hands
 * - Each hand shows community cards, pot, and winner(s)
 * - Click to open detail view with TEE verification
 *
 * @param isOpen - Whether the panel is visible
 * @param onClose - Called when close button is clicked
 * @param tableId - Table to fetch history for
 */
export function HandHistory({ isOpen, onClose, tableId }: HandHistoryProps) {
  const [hands, setHands] = useState<HandSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedHandId, setSelectedHandId] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  /**
   * Fetch hand history when panel opens
   */
  useEffect(() => {
    if (isOpen && tableId) {
      setIsLoading(true);
      setError(null);

      getHandHistory(tableId, 50)
        .then((data) => {
          setHands(data);
        })
        .catch((err) => {
          console.error('Failed to fetch hand history:', err);
          setError(err.message || 'Failed to load hand history');
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen, tableId]);

  /**
   * Handle clicking on a hand to view details
   */
  function handleHandClick(handId: number) {
    setSelectedHandId(handId);
  }

  /**
   * Handle going back from detail view
   */
  function handleBackFromDetail() {
    setSelectedHandId(null);
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="hand-history-panel"
          initial={{ width: 0, minWidth: 0, opacity: 0 }}
          animate={{ width: 400, minWidth: 400, opacity: 1 }}
          exit={{ width: 0, minWidth: 0, opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        >
          {/* Show detail view if a hand is selected */}
          {selectedHandId !== null ? (
            <HandHistoryDetail
              handId={selectedHandId}
              onBack={handleBackFromDetail}
              onClose={onClose}
            />
          ) : (
            <>
              {/* Header */}
              <div className="hand-history-header">
                <h3 className="hand-history-title">Hand History</h3>
                <button
                  className="hand-history-close-button"
                  onClick={onClose}
                  aria-label="Close hand history"
                >
                  <FaTimes />
                </button>
              </div>

              {/* Content */}
              <div className="hand-history-content" ref={listRef}>
                {isLoading ? (
                  <div className="hand-history-loading">
                    <FaSpinner className="hand-history-spinner" />
                    <p>Loading hands...</p>
                  </div>
                ) : error ? (
                  <div className="hand-history-error">
                    <p>{error}</p>
                    <button
                      className="hand-history-retry-button"
                      onClick={() => {
                        setIsLoading(true);
                        setError(null);
                        getHandHistory(tableId, 50)
                          .then(setHands)
                          .catch((err) => setError(err.message))
                          .finally(() => setIsLoading(false));
                      }}
                    >
                      Retry
                    </button>
                  </div>
                ) : hands.length === 0 ? (
                  <div className="hand-history-empty">
                    <p>No completed hands yet</p>
                    <p className="hand-history-empty-hint">
                      Hands will appear here after they complete
                    </p>
                  </div>
                ) : (
                  <div className="hand-history-list">
                    {hands.map((hand) => (
                      <button
                        key={hand.id}
                        className="hand-history-item"
                        onClick={() => handleHandClick(hand.id)}
                      >
                        <div className="hand-history-item-header">
                          <span className="hand-history-item-id">
                            Hand #{hand.id}
                          </span>
                          <span className="hand-history-item-time">
                            {formatDateTime(hand.completedAt)}
                          </span>
                        </div>

                        {/* Community cards */}
                        <div className="hand-history-item-cards">
                          {hand.communityCards.length > 0 ? (
                            hand.communityCards.map((card, idx) => (
                              <div key={idx} className="hand-history-card-mini">
                                <Card suit={card.suit} rank={card.rank} />
                              </div>
                            ))
                          ) : (
                            <span className="hand-history-no-cards">
                              No community cards
                            </span>
                          )}
                        </div>

                        {/* Pot and winner info */}
                        <div className="hand-history-item-info">
                          <div className="hand-history-item-pot">
                            <span className="hand-history-label">Pot:</span>
                            <span className="hand-history-value">
                              {formatEth(hand.totalPot)}
                            </span>
                          </div>
                          <div className="hand-history-item-winners">
                            <span className="hand-history-label">Winner:</span>
                            <span className="hand-history-value">
                              {hand.winners.length > 0
                                ? hand.winners
                                    .map((w) => `Seat ${w.seatNumber}`)
                                    .join(', ')
                                : 'N/A'}
                            </span>
                          </div>
                        </div>

                        {/* Click indicator */}
                        <div className="hand-history-item-chevron">
                          <FaChevronRight />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

