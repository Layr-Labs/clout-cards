import './App.css'
import { Link } from 'react-router-dom'

/**
 * Play page component for CloutCards
 *
 * Main gameplay page where users can access tables and play.
 * Features a header with Leaderboard and Profile navigation links.
 */
function Play() {
  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <nav className="header-nav">
          <Link to="/" className="nav-link">Home</Link>
          <a href="#leaderboard" className="nav-link">Leaderboard</a>
          <a href="#profile" className="nav-link">Profile</a>
        </nav>
      </header>

      {/* Main Content */}
      <main className="play-main">
        <div className="play-container">
          <h1 className="play-title">Play CloutCards</h1>
          <p className="play-description">
            Join a table and start playing!
          </p>
        </div>
      </main>
    </div>
  )
}

export default Play

