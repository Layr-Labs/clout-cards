import './App.css'
import { useNavigate, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useWallet } from './contexts/WalletContext'
import { getPokerTables, getTablePlayers, type PokerTable, type TablePlayer } from './services/tables'
import { LoginDialog } from './components/LoginDialog'
import { Header } from './components/Header'
import { useTwitterUser } from './hooks/useTwitterUser'
import { getBackendUrl } from './config/env'
import { TableCard } from './components/TableCard'
import { AsyncState } from './components/AsyncState'
import { useEthBalance } from './hooks/useEthBalance'
import { useEscrowBalance } from './hooks/useEscrowBalance'
import { FaTimes } from 'react-icons/fa'

/**
 * Play page component for CloutCards
 *
 * Main gameplay page where users can access tables and play.
 * Features a header with Tables, Leaderboard and Profile navigation links.
 * Displays list of poker tables with Join/Log In buttons based on login status.
 */
function Play() {
  const { isLoggedIn, address, provider } = useWallet()
  const twitterUser = useTwitterUser()
  const navigate = useNavigate()
  const [tables, setTables] = useState<PokerTable[]>([])
  const [tablePlayers, setTablePlayers] = useState<Map<number, TablePlayer[]>>(new Map())
  const [isLoadingTables, setIsLoadingTables] = useState(false)
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false)
  const [isFullyLoggedIn, setIsFullyLoggedIn] = useState(false)
  
  // Balance hooks for notification banners
  const ethBalance = useEthBalance(address, provider)
  const escrowBalanceState = useEscrowBalance()
  
  // Dismissed notification state
  const [isFaucetBannerDismissed, setIsFaucetBannerDismissed] = useState(false)
  const [isDepositBannerDismissed, setIsDepositBannerDismissed] = useState(false)
  
  // Determine if we should show banners
  const hasLowWalletBalance = ethBalance !== null && parseFloat(ethBalance) < 0.1
  const hasZeroEscrowBalance = escrowBalanceState !== null && escrowBalanceState.balanceGwei === '0'
  const showFaucetBanner = isLoggedIn && hasLowWalletBalance && !isFaucetBannerDismissed
  const showDepositBanner = isLoggedIn && hasZeroEscrowBalance && !hasLowWalletBalance && !isDepositBannerDismissed

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
   * Loads poker tables from the API and players for each table
   */
  useEffect(() => {
    async function loadTables() {
      setIsLoadingTables(true)
      try {
        const fetchedTables = await getPokerTables()
        setTables(fetchedTables)
        
        // Fetch players for each table in parallel
        const playersMap = new Map<number, TablePlayer[]>()
        await Promise.all(
          fetchedTables.map(async (table) => {
            try {
              const players = await getTablePlayers(table.id)
              if (players.length > 0) {
                playersMap.set(table.id, players)
              }
            } catch (error) {
              // Silently fail if players can't be fetched
              console.error(`Failed to load players for table ${table.id}:`, error)
            }
          })
        )
        setTablePlayers(playersMap)
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

          {/* Notification Banners */}
          {showFaucetBanner && (
            <div className="play-notification-banner play-notification-faucet">
              <div className="play-notification-content">
                <span className="play-notification-text">
                  Your wallet balance is low. Get free testnet ETH to start playing!
                </span>
                <a
                  href="https://www.alchemy.com/faucets/base-sepolia"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="play-notification-button"
                >
                  Get Funds
                </a>
              </div>
              <button
                className="play-notification-dismiss"
                onClick={() => setIsFaucetBannerDismissed(true)}
                aria-label="Dismiss notification"
              >
                <FaTimes />
              </button>
            </div>
          )}

          {showDepositBanner && (
            <div className="play-notification-banner play-notification-deposit">
              <div className="play-notification-content">
                <span className="play-notification-text">
                  Your escrow balance is empty. Deposit funds to join a table!
                </span>
                <Link
                  to="/profile"
                  className="play-notification-button"
                >
                  Deposit Funds
                </Link>
              </div>
              <button
                className="play-notification-dismiss"
                onClick={() => setIsDepositBannerDismissed(true)}
                aria-label="Dismiss notification"
              >
                <FaTimes />
              </button>
            </div>
          )}

          {/* Tables List - only show active tables */}
          <AsyncState
            isLoading={isLoadingTables}
            error={null}
            isEmpty={tables.filter(t => t.isActive).length === 0}
            emptyMessage="No tables available. Check back later!"
            loadingMessage="Loading tables..."
            className="play-tables-state"
          >
            <div className="play-tables-list">
              {tables.filter(t => t.isActive).map((table) => (
                <TableCard
                  key={table.id}
                  table={table}
                  players={tablePlayers.get(table.id)}
                  className="play-table-card"
                  renderAction={() => (
                    isFullyLoggedIn ? (
                      <button
                        className="cta-button cta-primary play-table-join-button"
                        onClick={() => handleJoin(table)}
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

