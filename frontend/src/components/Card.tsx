import React from 'react'
import './Card.css'

/**
 * Card component props
 */
export interface CardProps {
  /**
   * Card suit (hearts, diamonds, clubs, spades)
   */
  suit?: 'hearts' | 'diamonds' | 'clubs' | 'spades'
  /**
   * Card rank (A, 2-10, J, Q, K)
   */
  rank?: 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'
  /**
   * Whether to show the card back instead of front
   */
  isBack?: boolean
  /**
   * Additional CSS class name
   */
  className?: string
}

/**
 * Card component
 * 
 * Renders a playing card with front (suit and rank) or back design.
 * Used for displaying cards in the poker game.
 */
export function Card({ suit, rank, isBack = false }: CardProps) {
  if (isBack) {
    return (
      <div className="card card-back">
        <div className="card-back-pattern">
          <div className="card-back-logo">CC</div>
        </div>
      </div>
    )
  }

  if (!suit || !rank) {
    return null
  }

  const isRed = suit === 'hearts' || suit === 'diamonds'
  const suitSymbol = getSuitSymbol(suit)

  return (
    <div className={`card card-front ${isRed ? 'card-red' : 'card-black'}`}>
      {/* Top corner - suit only */}
      <div className="card-corner card-corner-top">
        <div className="card-suit">{suitSymbol}</div>
      </div>

      {/* Center - rank */}
      <div className="card-center">
        {getCenterDesign(suit, rank)}
      </div>

      {/* Bottom corner - suit only (not rotated) */}
      <div className="card-corner card-corner-bottom">
        <div className="card-suit">{suitSymbol}</div>
      </div>
    </div>
  )
}

/**
 * Gets the Unicode symbol for a suit
 */
function getSuitSymbol(suit: CardProps['suit']): string {
  switch (suit) {
    case 'hearts':
      return '♥'
    case 'diamonds':
      return '♦'
    case 'clubs':
      return '♣'
    case 'spades':
      return '♠'
    default:
      return ''
  }
}

/**
 * Gets the center design for a card based on suit and rank
 * 
 * All cards show the rank in the center (like face cards)
 */
function getCenterDesign(suit: CardProps['suit'], rank: CardProps['rank']): React.ReactNode {
  if (!suit || !rank) return null

  // All cards show rank in center
  return (
    <div className="card-rank-center">
      {rank}
    </div>
  )
}


