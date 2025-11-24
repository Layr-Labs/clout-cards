import './App.css'
import { Link } from 'react-router-dom'

/**
 * Admin page component for CloutCards
 *
 * Admin interface for managing the platform. Currently empty, ready for future features.
 */
function Admin() {
  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <nav className="header-nav">
          <Link to="/" className="nav-link">Home</Link>
          <a href="#leaderboard" className="nav-link">Leaderboard</a>
          <a href="#docs" className="nav-link">Docs</a>
          <button className="header-play-button">Play Now</button>
        </nav>
      </header>

      {/* Admin Content */}
      <main className="admin-main">
        <div className="admin-container">
          <h1 className="admin-title">Admin</h1>
          {/* Empty for now - ready for future admin features */}
        </div>
      </main>
    </div>
  )
}

export default Admin

