/**
 * Hand Settlement Modal Component
 *
 * Displays a comprehensive summary of hand results after a poker hand completes.
 * Shows winner(s), their hands, community cards, pot amounts won, and countdown
 * to the next hand - all in one focused modal overlay.
 *
 * Features:
 * - Single winner display with avatar, handle, hand rank, and winnings
 * - Multiple winner support for split pots and side pots
 * - Community cards display
 * - Winner's hole cards highlighted
 * - Integrated countdown timer for next hand
 * - Smooth entrance/exit animations
 *
 * @example
 * <HandSettlementModal
 *   winners={[{ seatNumber: 2, twitterHandle: '@player', ... }]}
 *   communityCards={[{ suit: 'hearts', rank: 'A' }, ...]}
 *   countdown={15}
 *   isVisible={true}
 * />
 */

import './HandSettlementModal.css'
import { Card } from './Card'
import type { Card as CardType } from '../services/tables'
import { AnimatePresence, motion } from 'framer-motion'

/**
 * Information about a winning player
 */
export interface WinnerInfo {
  /** Seat number of the winner (0-7) */
  seatNumber: number
  /** Twitter handle (e.g., "@cryptoking") */
  twitterHandle: string | null
  /** URL to player's Twitter avatar */
  twitterAvatarUrl: string | null
  /** Winner's two hole cards */
  holeCards: CardType[]
  /** Name of the winning hand (e.g., "Full House", "Two Pair") or null if won by fold */
  handRankName: string | null
  /** Amount won in formatted ETH (e.g., "0.25 ETH") */
  amountWon: string
  /** Pot number this win is from (0 = main pot, 1+ = side pots) */
  potNumber: number
}

/**
 * Props for the HandSettlementModal component
 */
export interface HandSettlementModalProps {
  /** Array of winner information for each pot */
  winners: WinnerInfo[]
  /** The 5 community cards on the board */
  communityCards: CardType[]
  /** Seconds until next hand starts (null if not counting down) */
  countdown: number | null
  /** Whether the modal is visible */
  isVisible: boolean
}

/**
 * Hand Settlement Modal
 *
 * Renders a centered modal overlay showing complete hand settlement information.
 * Uses framer-motion for smooth entrance/exit animations.
 *
 * @param props - Component props
 * @returns React element or null if not visible
 */
export function HandSettlementModal({
  winners,
  communityCards,
  countdown,
  isVisible,
}: HandSettlementModalProps) {
  // Group winners by pot number for display
  const mainPotWinners = winners.filter((w) => w.potNumber === 0)
  const sidePotWinners = winners.filter((w) => w.potNumber > 0)

  // Determine title based on winner count
  const getTitle = () => {
    if (winners.length === 0) return 'HAND COMPLETE'
    if (mainPotWinners.length > 1) return 'SPLIT POT'
    if (sidePotWinners.length > 0) return 'WINNERS'
    return 'WINNER'
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="hand-settlement-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            className="hand-settlement-modal"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            {/* Title */}
            <div className="hand-settlement-title">{getTitle()}</div>

            {/* Winners Section */}
            <div className="hand-settlement-winners">
              {/* Main Pot Winners */}
              {mainPotWinners.map((winner, index) => (
                <WinnerRow
                  key={`main-${winner.seatNumber}-${index}`}
                  winner={winner}
                  showPotLabel={sidePotWinners.length > 0}
                  potLabel="Main Pot"
                />
              ))}

              {/* Side Pot Winners */}
              {sidePotWinners.map((winner, index) => (
                <WinnerRow
                  key={`side-${winner.potNumber}-${winner.seatNumber}-${index}`}
                  winner={winner}
                  showPotLabel={true}
                  potLabel={`Side Pot ${winner.potNumber}`}
                />
              ))}
            </div>

            {/* Community Cards */}
            {communityCards.length > 0 && (
              <div className="hand-settlement-community">
                <div className="hand-settlement-community-label">Board</div>
                <div className="hand-settlement-community-cards">
                  {communityCards.map((card, index) => (
                    <Card key={index} suit={card.suit} rank={card.rank} />
                  ))}
                </div>
              </div>
            )}

            {/* Countdown */}
            {countdown !== null && countdown > 0 && (
              <div className="hand-settlement-countdown">
                Next hand in {countdown}s
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * Props for the WinnerRow component
 */
interface WinnerRowProps {
  /** Winner information */
  winner: WinnerInfo
  /** Whether to show the pot label (Main Pot, Side Pot 1, etc.) */
  showPotLabel: boolean
  /** Label for the pot */
  potLabel: string
}

/**
 * Individual winner row within the modal
 *
 * Displays a single winner with their avatar, handle, hand rank, hole cards, and winnings.
 *
 * @param props - Component props
 * @returns React element
 */
function WinnerRow({ winner, showPotLabel, potLabel }: WinnerRowProps) {
  return (
    <div className="hand-settlement-winner-row">
      {/* Pot Label (if showing multiple pots) */}
      {showPotLabel && (
        <div className="hand-settlement-pot-label">{potLabel}</div>
      )}

      <div className="hand-settlement-winner-content">
        {/* Avatar and Info */}
        <div className="hand-settlement-winner-info">
          {/* Avatar */}
          <div className="hand-settlement-winner-avatar">
            {winner.twitterAvatarUrl ? (
              <img
                src={winner.twitterAvatarUrl}
                alt={winner.twitterHandle || 'Winner'}
                className="hand-settlement-avatar-img"
              />
            ) : (
              <div className="hand-settlement-avatar-placeholder">
                {winner.twitterHandle?.charAt(1)?.toUpperCase() || '?'}
              </div>
            )}
          </div>

          {/* Handle and Hand Rank */}
          <div className="hand-settlement-winner-details">
            <div className="hand-settlement-winner-handle">
              {winner.twitterHandle || `Seat ${winner.seatNumber + 1}`}
            </div>
            <div className="hand-settlement-winner-hand-rank">
              {winner.handRankName || 'All opponents folded'}
            </div>
          </div>
        </div>

        {/* Hole Cards */}
        {winner.holeCards && winner.holeCards.length > 0 && (
          <div className="hand-settlement-winner-hole-cards">
            {winner.holeCards.map((card, index) => (
              <Card key={index} suit={card.suit} rank={card.rank} />
            ))}
          </div>
        )}

        {/* Amount Won */}
        <div className="hand-settlement-winner-amount">{winner.amountWon}</div>
      </div>
    </div>
  )
}

