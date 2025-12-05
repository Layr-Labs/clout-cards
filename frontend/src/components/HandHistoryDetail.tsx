/**
 * Hand History Detail Component
 *
 * Displays detailed information about a specific hand with TEE verification.
 * Shows:
 * - TEE signature verification for all events
 * - Deck commitment verification
 * - Hand summary (players, pots, community cards)
 */

import { useState, useEffect } from 'react';
import {
  FaArrowLeft,
  FaTimes,
  FaCheckCircle,
  FaTimesCircle,
  FaSpinner,
  FaChevronDown,
  FaChevronUp,
  FaShieldAlt,
  FaLock,
  FaCopy,
  FaEye,
} from 'react-icons/fa';
import { Card } from './Card';
import { Tooltip } from './Tooltip';
import {
  getHandEvents,
  type HandEventsResponse,
  type HandEvent,
} from '../services/handHistory';
import {
  verifyEventSignature,
  verifyDeckCommitment,
  verifyAllEvents,
  formatAddressShort,
  type SignatureVerificationResult,
  type DeckVerificationResult,
} from '../utils/verification';
import { formatEth } from '../utils/formatEth';
import './HandHistory.css';

/**
 * Copyable hash/address display with tooltip and copy button
 */
function CopyableHash({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="copyable-hash">
      <Tooltip content={value} position="top">
        <code className="copyable-hash-value">
          {formatAddressShort(value)}
        </code>
      </Tooltip>
      <button
        className="copyable-hash-button"
        onClick={handleCopy}
        aria-label={`Copy ${label || 'value'}`}
        title={copied ? 'Copied!' : 'Copy to clipboard'}
      >
        {copied ? <FaCheckCircle className="copied" /> : <FaCopy />}
      </button>
    </div>
  );
}

/**
 * Props for the HandHistoryDetail component
 */
interface HandHistoryDetailProps {
  /** Hand ID to display */
  handId: number;
  /** Callback to go back to the list view */
  onBack: () => void;
  /** Callback to close the entire panel */
  onClose: () => void;
}

/**
 * Maps event kind to human-readable name
 */
function formatEventKind(
  kind: string, 
  payloadJson?: string
): string {
  switch (kind) {
    case 'hand_start':
      return 'Hand Started';
    case 'hand_end':
      return 'Hand Ended';
    case 'bet':
    case 'hand_action':
      // Try to parse the payload to get action details
      if (payloadJson) {
        try {
          const payload = JSON.parse(payloadJson);
          const action = payload.action;
          if (action) {
            const actionType = action.type || 'ACTION';
            const seatNumber = action.seatNumber;
            const displayName = seatNumber !== undefined ? `Seat #${seatNumber}` : 'Player';
            const amount = action.amount ? ` (${formatEth(action.amount)})` : '';
            return `${displayName}: ${actionType}${amount}`;
          }
        } catch {
          // Fall through to default
        }
      }
      return 'Player Action';
    case 'community_cards':
      // Determine if it's Flop, Turn, or River based on the round in the payload
      if (payloadJson) {
        try {
          const payload = JSON.parse(payloadJson);
          const round = payload.hand?.round;
          if (round === 'FLOP') return 'Flop';
          if (round === 'TURN') return 'Turn';
          if (round === 'RIVER') return 'River';
        } catch {
          // Fall through to default
        }
      }
      return 'Community Cards';
    default:
      return kind;
  }
}

/**
 * Hand History Detail Component
 *
 * Shows detailed verification info for a specific hand:
 * - TEE signature verification section with expandable events
 * - Deck commitment verification section
 * - Hand summary (community cards, pots, players)
 *
 * @param handId - ID of the hand to display
 * @param onBack - Called when back button is clicked
 * @param onClose - Called when close button is clicked
 */
export function HandHistoryDetail({
  handId,
  onBack,
  onClose,
}: HandHistoryDetailProps) {
  const [data, setData] = useState<HandEventsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Verification results
  const [signatureResults, setSignatureResults] = useState<
    SignatureVerificationResult[]
  >([]);
  const [deckResult, setDeckResult] = useState<DeckVerificationResult | null>(
    null
  );
  const [isVerifying, setIsVerifying] = useState(false);

  // UI state
  const [isEventsExpanded, setIsEventsExpanded] = useState(false);
  const [isDeckExpanded, setIsDeckExpanded] = useState(false);
  const [viewingPayload, setViewingPayload] = useState<HandEvent | null>(null);

  /**
   * Fetch hand events and run verification
   */
  useEffect(() => {
    setIsLoading(true);
    setError(null);

    getHandEvents(handId)
      .then((response) => {
        setData(response);

        // Run verification
        setIsVerifying(true);

        // Verify all event signatures
        const sigResults = verifyAllEvents(
          response.events,
          response.eip712Domain
        );
        setSignatureResults(sigResults.results);

        // Verify deck commitment
        if (response.hand.deck && response.hand.shuffleSeedHash) {
          const deckVerification = verifyDeckCommitment(
            response.hand.shuffleSeedHash,
            response.hand.deck
          );
          setDeckResult(deckVerification);
        }

        setIsVerifying(false);
      })
      .catch((err) => {
        console.error('Failed to fetch hand events:', err);
        setError(err.message || 'Failed to load hand details');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [handId]);

  // Calculate summary stats
  const validSignatureCount = signatureResults.filter((r) => r.valid).length;
  const totalSignatureCount = signatureResults.length;
  const allSignaturesValid =
    totalSignatureCount > 0 && validSignatureCount === totalSignatureCount;

  if (isLoading) {
    return (
      <div className="hand-history-detail">
        <div className="hand-history-header">
          <button
            className="hand-history-back-button"
            onClick={onBack}
            aria-label="Back to list"
          >
            <FaArrowLeft />
          </button>
          <h3 className="hand-history-title">Hand #{handId}</h3>
          <button
            className="hand-history-close-button"
            onClick={onClose}
            aria-label="Close"
          >
            <FaTimes />
          </button>
        </div>
        <div className="hand-history-loading">
          <FaSpinner className="hand-history-spinner" />
          <p>Loading hand details...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="hand-history-detail">
        <div className="hand-history-header">
          <button
            className="hand-history-back-button"
            onClick={onBack}
            aria-label="Back to list"
          >
            <FaArrowLeft />
          </button>
          <h3 className="hand-history-title">Hand #{handId}</h3>
          <button
            className="hand-history-close-button"
            onClick={onClose}
            aria-label="Close"
          >
            <FaTimes />
          </button>
        </div>
        <div className="hand-history-error">
          <p>{error || 'Failed to load hand details'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="hand-history-detail">
      {/* Header */}
      <div className="hand-history-header">
        <button
          className="hand-history-back-button"
          onClick={onBack}
          aria-label="Back to list"
        >
          <FaArrowLeft />
        </button>
        <h3 className="hand-history-title">Hand #{handId}</h3>
        <button
          className="hand-history-close-button"
          onClick={onClose}
          aria-label="Close"
        >
          <FaTimes />
        </button>
      </div>

      {/* Content */}
      <div className="hand-history-detail-content">
        {/* TEE Signature Verification Section */}
        <div className="verification-section">
          <div className="verification-header">
            <div className="verification-header-top">
              <div className="verification-icon">
                <FaShieldAlt />
              </div>
              <div className="verification-info">
                <h4>TEE Signature Verification</h4>
              </div>
              <div
                className={`verification-badge ${
                  isVerifying
                    ? 'verifying'
                    : allSignaturesValid
                    ? 'valid'
                    : 'invalid'
                }`}
              >
                {isVerifying ? (
                  <FaSpinner className="spin" />
                ) : allSignaturesValid ? (
                  <FaCheckCircle />
                ) : (
                  <FaTimesCircle />
                )}
                <span>
                  {isVerifying
                    ? 'Verifying...'
                    : `${validSignatureCount}/${totalSignatureCount} Valid`}
                </span>
              </div>
            </div>
            <p className="verification-subtitle">
              All events signed by Trusted Execution Environment
            </p>
          </div>

          {/* TEE Address */}
          {data.events.length > 0 && (
            <div className="verification-detail">
              <span className="verification-label">TEE Address:</span>
              <CopyableHash value={data.events[0].teePubkey} label="TEE address" />
            </div>
          )}

          {/* Expandable events list */}
          <button
            className="verification-expand-button"
            onClick={() => setIsEventsExpanded(!isEventsExpanded)}
          >
            <span>{isEventsExpanded ? 'Hide' : 'Show'} Event Details</span>
            {isEventsExpanded ? <FaChevronUp /> : <FaChevronDown />}
          </button>

          {isEventsExpanded && (
            <div className="verification-events-list">
              {data.events.map((event, idx) => {
                const result = signatureResults[idx];
                return (
                  <div key={event.eventId} className="verification-event">
                    <div className="verification-event-header">
                      <span className="verification-event-kind">
                        {formatEventKind(event.kind, event.payloadJson)}
                      </span>
                      <div className="verification-event-right">
                        <button
                          className="verification-event-view-button"
                          onClick={() => setViewingPayload(event)}
                          title="View full event payload"
                          aria-label="View full event payload"
                        >
                          <FaEye />
                        </button>
                        <span
                          className={`verification-event-status ${
                            result?.valid ? 'valid' : 'invalid'
                          }`}
                        >
                          {result?.valid ? (
                            <FaCheckCircle />
                          ) : (
                            <FaTimesCircle />
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="verification-event-details">
                      <div className="verification-event-row">
                        <span>Event ID:</span>
                        <code>{event.eventId}</code>
                      </div>
                      <div className="verification-event-row">
                        <span>Digest:</span>
                        <CopyableHash value={event.digest} label="digest" />
                      </div>
                      <div className="verification-event-row">
                        <span>Recovered:</span>
                        {result?.recoveredAddress ? (
                          <CopyableHash value={result.recoveredAddress} label="recovered address" />
                        ) : (
                          <code>N/A</code>
                        )}
                      </div>
                      {result?.error && (
                        <div className="verification-event-error">
                          {result.error}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Deck Commitment Verification Section */}
        <div className="verification-section">
          <div className="verification-header">
            <div className="verification-header-top">
              <div className="verification-icon">
                <FaLock />
              </div>
              <div className="verification-info">
                <h4>Deck Commitment Verification</h4>
              </div>
              <div
                className={`verification-badge ${
                  isVerifying
                    ? 'verifying'
                    : deckResult?.valid
                    ? 'valid'
                    : 'invalid'
                }`}
              >
                {isVerifying ? (
                  <FaSpinner className="spin" />
                ) : deckResult?.valid ? (
                  <FaCheckCircle />
                ) : (
                  <FaTimesCircle />
                )}
                <span>
                  {isVerifying
                    ? 'Verifying...'
                    : deckResult?.valid
                    ? 'Verified'
                    : 'Invalid'}
                </span>
              </div>
            </div>
            <p className="verification-subtitle">
              Proves deck was not modified after deal
            </p>
          </div>

          {/* Hash details */}
          {deckResult && (
            <>
              <div className="verification-detail">
                <span className="verification-label">Committed Hash:</span>
                <CopyableHash value={deckResult.expectedHash} label="committed hash" />
              </div>
              <div className="verification-detail">
                <span className="verification-label">Computed Hash:</span>
                <CopyableHash value={deckResult.computedHash} label="computed hash" />
              </div>
              {deckResult.error && (
                <div className="verification-error">{deckResult.error}</div>
              )}
            </>
          )}

          {/* Expandable deck view */}
          <button
            className="verification-expand-button"
            onClick={() => setIsDeckExpanded(!isDeckExpanded)}
          >
            <span>{isDeckExpanded ? 'Hide' : 'Show'} Full Deck</span>
            {isDeckExpanded ? <FaChevronUp /> : <FaChevronDown />}
          </button>

          {isDeckExpanded && (
            <div className="verification-deck-grid">
              {data.hand.deck.map((card, idx) => (
                <div key={idx} className="verification-deck-card">
                  <span className="verification-deck-position">{idx + 1}</span>
                  <Card suit={card.suit} rank={card.rank} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Hand Summary Section */}
        <div className="hand-summary-section">
          <h4>Hand Summary</h4>

          {/* Community Cards */}
          <div className="hand-summary-row">
            <span className="hand-summary-label">Community Cards:</span>
            <div className="hand-summary-cards">
              {data.hand.communityCards.length > 0 ? (
                data.hand.communityCards.map((card, idx) => (
                  <div key={idx} className="hand-history-card-mini">
                    <Card suit={card.suit} rank={card.rank} />
                  </div>
                ))
              ) : (
                <span className="hand-summary-empty">None</span>
              )}
            </div>
          </div>

          {/* Pots */}
          <div className="hand-summary-row">
            <span className="hand-summary-label">Pots:</span>
            <div className="hand-summary-pots">
              {data.hand.pots.map((pot) => (
                <div key={pot.potNumber} className="hand-summary-pot">
                  <span className="pot-name">
                    {pot.potNumber === 0 ? 'Main Pot' : `Side Pot ${pot.potNumber}`}
                  </span>
                  <span className="pot-amount">{formatEth(pot.amount)}</span>
                  <span className="pot-winners">
                    → Seat{' '}
                    {pot.winnerSeatNumbers?.join(', ') || 'N/A'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Players */}
          <div className="hand-summary-row">
            <span className="hand-summary-label">Players:</span>
            <div className="hand-summary-players">
              {data.hand.players.map((player) => (
                <div key={player.seatNumber} className="hand-summary-player">
                  <span className="player-seat">Seat {player.seatNumber}</span>
                  <code className="player-address">
                    {formatAddressShort(player.walletAddress)}
                  </code>
                  <span className={`player-status ${player.status.toLowerCase()}`}>
                    {player.status}
                  </span>
                  {player.holeCards && (
                    <div className="player-cards">
                      {player.holeCards.map((card, idx) => (
                        <div key={idx} className="hand-history-card-tiny">
                          <Card suit={card.suit} rank={card.rank} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Event Payload Viewer Modal */}
      {viewingPayload && (
        <div className="payload-modal-overlay" onClick={() => setViewingPayload(null)}>
          <div className="payload-modal" onClick={(e) => e.stopPropagation()}>
            <div className="payload-modal-header">
              <h4>Event Payload</h4>
              <button
                className="payload-modal-close"
                onClick={() => setViewingPayload(null)}
                aria-label="Close"
              >
                <FaTimes />
              </button>
            </div>
            <div className="payload-modal-content">
              <div className="payload-modal-meta">
                <div className="payload-meta-row">
                  <span>Event ID:</span>
                  <code>{viewingPayload.eventId}</code>
                </div>
                <div className="payload-meta-row">
                  <span>Kind:</span>
                  <code>{viewingPayload.kind}</code>
                </div>
              </div>
              <div className="payload-json-container">
                <pre className="payload-json">
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(viewingPayload.payloadJson), null, 2);
                    } catch {
                      return viewingPayload.payloadJson;
                    }
                  })()}
                </pre>
              </div>
              <button
                className="payload-copy-button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(viewingPayload.payloadJson);
                    alert('Payload copied to clipboard');
                  } catch (err) {
                    console.error('Failed to copy:', err);
                  }
                }}
              >
                <FaCopy /> Copy to Clipboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

