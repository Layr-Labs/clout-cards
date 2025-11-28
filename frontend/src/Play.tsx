import './App.css'
import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useWallet } from './contexts/WalletContext'
import { getPokerTables, type PokerTable } from './services/tables'
import { LoginDialog } from './components/LoginDialog'
import { Header } from './components/Header'
import { useTwitterUser } from './hooks/useTwitterUser'
import { getBackendUrl } from './config/env'
import { TableCard } from './components/TableCard'
import { AsyncState } from './components/AsyncState'

/**
 * Play page component for CloutCards
 *
 * Main gameplay page where users can access tables and play.
 * Features a header with Tables, Leaderboard and Profile navigation links.
 * Displays list of poker tables with Join/Log In buttons based on login status.
 */
function Play() {
  const { isLoggedIn } = useWallet()
  const twitterUser = useTwitterUser()
  const navigate = useNavigate()
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

        // Store user info in cache to avoid immediate API call
        if (data.userInfo) {
          const cacheKey = `twitter_user_${data.accessToken.substring(0, 20)}`;
          localStorage.setItem(cacheKey, JSON.stringify({
            userInfo: data.userInfo,
            expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour
          }));
        }

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
    // Navigate to the table page
    navigate(`/table/${table.id}`)
  }

  return (
    <div className="app">
      {/* Header */}
      <Header
        onLoginClick={() => setIsLoginDialogOpen(true)}
      />

      {/* Main Content */}
      <main className="play-main">
        <div className="play-container">
          <h1 className="play-title">Play CloutCards</h1>
          <p className="play-description">
            Join a table and start playing!
          </p>

          {/* Tables List */}
          <AsyncState
            isLoading={isLoadingTables}
            error={null}
            isEmpty={tables.length === 0}
            emptyMessage="No tables available. Check back later!"
            loadingMessage="Loading tables..."
            className="play-tables-state"
          >
            <div className="play-tables-list">
              {tables.map((table) => (
                <TableCard
                  key={table.id}
                  table={table}
                  className="play-table-card"
                  renderAction={() => (
                    isFullyLoggedIn ? (
                      <button
                        className="cta-button cta-primary play-table-join-button"
                        onClick={() => handleJoin(table)}
                        disabled={!table.isActive}
                      >
                        Join
                      </button>
                    ) : (
                      <button
                        className="cta-button cta-secondary play-table-signin-button"
                        onClick={() => setIsLoginDialogOpen(true)}
                      >
                        Log In
                      </button>
                    )
                  )}
                />
              ))}
            </div>
          </AsyncState>
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

