import './App.css'
import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useWallet } from './contexts/WalletContext'
import { getPokerTables, type PokerTable } from './services/tables'
import { formatGwei } from './utils/formatGwei'
import { LoginDialog } from './components/LoginDialog'
import { UserProfileDropdown } from './components/UserProfileDropdown'
import { useTwitterUser } from './hooks/useTwitterUser'
import { getBackendUrl } from './config/env'

/**
 * Play page component for CloutCards
 *
 * Main gameplay page where users can access tables and play.
 * Features a header with Tables, Leaderboard and Profile navigation links.
 * Displays list of poker tables with Join/Log In buttons based on login status.
 */
function Play() {
  const { address, isLoggedIn } = useWallet()
  const twitterUser = useTwitterUser()
  const [tables, setTables] = useState<PokerTable[]>([])
  const [isLoadingTables, setIsLoadingTables] = useState(false)
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false)
  const [isFullyLoggedIn, setIsFullyLoggedIn] = useState(false)

  /**
   * Updates fully logged in status when wallet or Twitter status changes
   */
  useEffect(() => {
    setIsFullyLoggedIn(isLoggedIn && !!twitterUser)
  }, [isLoggedIn, twitterUser])

  /**
   * Handles Twitter OAuth callback from URL params
   * Checks for session_id or error in query params and retrieves tokens
   */
  useEffect(() => {
    async function handleTwitterCallback() {
      const params = new URLSearchParams(window.location.search)
      const sessionId = params.get('twitter_session_id')
      const errorParam = params.get('twitter_error')

      if (errorParam) {
        console.error('Twitter auth error:', errorParam)
        // Clean up URL
        window.history.replaceState({}, '', window.location.pathname)
        return
      }

      if (!sessionId) {
        return
      }

      try {
        // Retrieve tokens from backend using session ID
        const backendUrl = getBackendUrl()
        const response = await fetch(`${backendUrl}/twitter/tokens?session_id=${encodeURIComponent(sessionId)}`)

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.message || 'Failed to retrieve tokens')
        }

        const data = await response.json()
        
        // Store tokens
        localStorage.setItem('twitterAccessToken', data.accessToken)
        if (data.refreshToken) {
          localStorage.setItem('twitterRefreshToken', data.refreshToken)
        }

        // Store user info temporarily - useTwitterUser hook will pick it up
        // Clean up URL
        window.history.replaceState({}, '', window.location.pathname)

        // Reload page to trigger useTwitterUser hook to refresh
        window.location.reload()
      } catch (err) {
        console.error('Error retrieving Twitter tokens:', err)
        // Clean up URL
        window.history.replaceState({}, '', window.location.pathname)
      }
    }

    handleTwitterCallback()
  }, [isLoggedIn])

  /**
   * Loads poker tables from the API
   */
  useEffect(() => {
    async function loadTables() {
      setIsLoadingTables(true)
      try {
        const fetchedTables = await getPokerTables()
        setTables(fetchedTables)
      } catch (error) {
        console.error('Failed to load tables:', error)
      } finally {
        setIsLoadingTables(false)
      }
    }

    loadTables()
  }, [])

  /**
   * Handles login success
   */
  function handleLoginSuccess() {
    setIsLoginDialogOpen(false)
    // useTwitterUser hook will automatically pick up the new token
  }

  /**
   * Handles join button click
   */
  function handleJoin(table: PokerTable) {
    if (!isFullyLoggedIn) {
      setIsLoginDialogOpen(true)
      return
    }
    // TODO: Implement join table logic
    console.log('Joining table:', table.id)
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <nav className="header-nav">
          <Link to="/" className="nav-link">Home</Link>
          <Link to="/play" className="nav-link">Tables</Link>
          <a href="#leaderboard" className="nav-link">Leaderboard</a>
          {isFullyLoggedIn && twitterUser && address ? (
            <UserProfileDropdown twitterUser={twitterUser} address={address} />
          ) : (
            <button
              className="header-login-button"
              onClick={() => setIsLoginDialogOpen(true)}
            >
              Log In
            </button>
          )}
        </nav>
      </header>

      {/* Main Content */}
      <main className="play-main">
        <div className="play-container">
          <h1 className="play-title">Play CloutCards</h1>
          <p className="play-description">
            Join a table and start playing!
          </p>

          {/* Tables List */}
          {isLoadingTables ? (
            <div className="play-tables-loading">
              <p>Loading tables...</p>
            </div>
          ) : tables.length === 0 ? (
            <div className="play-tables-empty">
              <p>No tables available. Check back later!</p>
            </div>
          ) : (
            <div className="play-tables-list">
              {tables.map((table) => (
                <div key={table.id} className="play-table-card">
                  <div className="play-table-header">
                    <h3 className="play-table-name">{table.name}</h3>
                    <span className={`play-table-status ${table.isActive ? 'active' : 'inactive'}`}>
                      {table.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="play-table-details">
                    <div className="play-table-detail">
                      <span className="play-table-label">Buy-In:</span>
                      <span className="play-table-value">
                        {formatGwei(table.minimumBuyIn)} - {formatGwei(table.maximumBuyIn)} gwei
                      </span>
                    </div>
                    <div className="play-table-detail">
                      <span className="play-table-label">Blinds:</span>
                      <span className="play-table-value">
                        {formatGwei(table.smallBlind)} / {formatGwei(table.bigBlind)} gwei
                      </span>
                    </div>
                    <div className="play-table-detail">
                      <span className="play-table-label">Rake:</span>
                      <span className="play-table-value">{table.perHandRake} bps</span>
                    </div>
                    <div className="play-table-detail">
                      <span className="play-table-label">Seats:</span>
                      <span className="play-table-value">{table.maxSeatCount}</span>
                    </div>
                  </div>
                  <div className="play-table-actions">
                    {isFullyLoggedIn ? (
                      <button
                        className="play-table-join-button"
                        onClick={() => handleJoin(table)}
                        disabled={!table.isActive}
                      >
                        Join
                      </button>
                    ) : (
                      <button
                        className="play-table-signin-button"
                        onClick={() => setIsLoginDialogOpen(true)}
                      >
                        Log In
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Login Dialog */}
      <LoginDialog
        isOpen={isLoginDialogOpen}
        onClose={() => setIsLoginDialogOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />
    </div>
  )
}

export default Play

