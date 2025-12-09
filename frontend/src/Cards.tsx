import { useState } from 'react'
import './App.css'
import { Header } from './components/Header'
import { LoginDialog } from './components/LoginDialog'
import { Card } from './components/Card'
import './Cards.css'

/**
 * Cards page component
 * 
 * Displays the entire 52-card deck plus a card back design
 * for iterating on card rendering design.
 */
function Cards() {
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false)

  // Generate all 52 cards
  const suits = ['hearts', 'diamonds', 'clubs', 'spades'] as const
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const
  
  const deck: Array<{ suit: typeof suits[number]; rank: typeof ranks[number] }> = []
  
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank })
    }
  }

  return (
    <div className="app">
      {/* Header */}
      <Header
        onLoginClick={() => setIsLoginDialogOpen(true)}
      />

      {/* Main Content */}
      <main className="cards-main">
        <div className="cards-container">
          <h1 className="cards-title">Card Design Preview</h1>
          
          {/* Card Back Section */}
          <section className="cards-section">
            <h2 className="cards-section-title">Card Back</h2>
            <div className="cards-grid">
              <Card isBack={true} />
            </div>
          </section>

          {/* Full Deck Section */}
          <section className="cards-section">
            <h2 className="cards-section-title">Full Deck (52 Cards)</h2>
            <div className="cards-grid">
              {deck.map((card, index) => (
                <Card
                  key={`${card.suit}-${card.rank}-${index}`}
                  suit={card.suit}
                  rank={card.rank}
                />
              ))}
            </div>
          </section>

          {/* Suits Section */}
          {suits.map((suit) => (
            <section key={suit} className="cards-section">
              <h2 className="cards-section-title">{suit.charAt(0).toUpperCase() + suit.slice(1)}</h2>
              <div className="cards-grid">
                {ranks.map((rank) => (
                  <Card
                    key={`${suit}-${rank}`}
                    suit={suit}
                    rank={rank}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>

      {/* Login Dialog */}
      <LoginDialog
        isOpen={isLoginDialogOpen}
        onClose={() => setIsLoginDialogOpen(false)}
        onLoginSuccess={() => setIsLoginDialogOpen(false)}
      />
    </div>
  )
}

export default Cards

