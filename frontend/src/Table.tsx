import './App.css'
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getPokerTables, getTablePlayers, joinTable, standUp, type PokerTable, type TablePlayer } from './services/tables'
import { Header } from './components/Header'
import { LoginDialog } from './components/LoginDialog'
import { BuyInDialog } from './components/BuyInDialog'
import { ConfirmDialog } from './components/ConfirmDialog'
import { useWallet } from './contexts/WalletContext'
import { useTwitterUser } from './hooks/useTwitterUser'
import { useEscrowBalance } from './hooks/useEscrowBalance'

/**
 * Table page component for CloutCards
 *
 * Displays a specific poker table with its active players.
 * Features the same header as the Play page.
 */
function Table() {
  const { id } = useParams<{ id: string }>()
  const [table, setTable] = useState<PokerTable | null>(null)
  const [players, setPlayers] = useState<TablePlayer[]>([])
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false)
  const [isBuyInDialogOpen, setIsBuyInDialogOpen] = useState(false)
  const [selectedSeatNumber, setSelectedSeatNumber] = useState<number | null>(null)
  const [isJoining, setIsJoining] = useState(false)
  const [isStandUpConfirmOpen, setIsStandUpConfirmOpen] = useState(false)
  const [isStandingUp, setIsStandingUp] = useState(false)

  const { address, signature, isLoggedIn } = useWallet()
  const twitterUser = useTwitterUser()
  const escrowBalanceState = useEscrowBalance()

  const tableId = id ? parseInt(id, 10) : null
  const isFullyLoggedIn = isLoggedIn && !!twitterUser && !!address && !!signature
  const escrowBalanceGwei = escrowBalanceState?.balanceGwei || '0'

  /**
   * Calculates seat positions around an oval table
   * 
   * @param seatCount - Number of seats around the table
   * @returns Array of {x, y} positions as percentages (0-100)
   */
  function calculateSeatPositions(seatCount: number): Array<{ x: number; y: number }> {
    const positions: Array<{ x: number; y: number }> = []
    
    // Oval table dimensions (as percentages of container)
    // Using an ellipse with horizontal radius ~45% and vertical radius ~35%
    const radiusX = 45 // horizontal radius
    const radiusY = 35 // vertical radius
    const centerX = 50
    const centerY = 50
    
    // For corner positions (diagonal), extend radius further out
    const cornerRadiusMultiplier = 1.15 // 15% further out for corners
    
    for (let i = 0; i < seatCount; i++) {
      // Calculate angle for each seat (evenly distributed)
      const angle = (i / seatCount) * 2 * Math.PI - Math.PI / 2 // Start from top (-90 degrees)
      
      // For 8 seats, check if this is a corner position (diagonal seats)
      // With 8 seats evenly spaced, corners are at indices 1, 3, 5, 7 (45° offsets)
      const isCorner = seatCount === 8 && i % 2 === 1
      
      // Use extended radius for corners to position them over the railing
      const effectiveRadiusX = isCorner ? radiusX * cornerRadiusMultiplier : radiusX
      const effectiveRadiusY = isCorner ? radiusY * cornerRadiusMultiplier : radiusY
      
      // Calculate position on ellipse
      const x = centerX + effectiveRadiusX * Math.cos(angle)
      const y = centerY + effectiveRadiusY * Math.sin(angle)
      
      positions.push({ x, y })
    }
    
    return positions
  }

  /**
   * Loads table information from the API
   */
  useEffect(() => {
    if (!tableId || isNaN(tableId)) {
      return
    }

    async function loadTableData() {
      try {
        // Fetch table info to get the name
        const tables = await getPokerTables()
        const foundTable = tables.find(t => t.id === tableId)
        
        if (foundTable) {
        setTable(foundTable)
        }
      } catch (err) {
        console.error('Failed to load table data:', err)
      }
    }

    loadTableData()
  }, [tableId])

  /**
   * Loads players and their Twitter info for the table
   */
  useEffect(() => {
    if (!tableId || isNaN(tableId)) {
      return
    }

    async function loadPlayers() {
      try {
        const fetchedPlayers = await getTablePlayers(tableId!)
        setPlayers(fetchedPlayers)
      } catch (err) {
        console.error('Failed to load players:', err)
      }
    }

    loadPlayers()
    
    // Refresh players every 5 seconds
    const interval = setInterval(loadPlayers, 5000)
    return () => clearInterval(interval)
  }, [tableId])

  /**
   * Handles Buy In button click
   */
  function handleBuyInClick(seatNumber: number) {
    if (!isFullyLoggedIn) {
      setIsLoginDialogOpen(true)
      return
    }
    setSelectedSeatNumber(seatNumber)
    setIsBuyInDialogOpen(true)
  }

  /**
   * Handles buy-in confirmation
   */
  async function handleBuyInConfirm(buyInAmountGwei: string) {
    if (!tableId || selectedSeatNumber === null || !address || !signature || !twitterUser) {
      return
    }

    const twitterAccessToken = localStorage.getItem('twitterAccessToken')
    if (!twitterAccessToken) {
      alert('Twitter authentication required. Please log in again.')
      setIsLoginDialogOpen(true)
      return
    }

    setIsJoining(true)

    try {
      await joinTable(
        {
          tableId,
          seatNumber: selectedSeatNumber,
          buyInAmountGwei,
        },
        address,
        signature,
        twitterAccessToken
      )

      // Close dialog and refresh players
      setIsBuyInDialogOpen(false)
      setSelectedSeatNumber(null)
      
      // Refresh players list
      const fetchedPlayers = await getTablePlayers(tableId)
      setPlayers(fetchedPlayers)
    } catch (error) {
      console.error('Failed to join table:', error)
      alert(error instanceof Error ? error.message : 'Failed to join table. Please try again.')
    } finally {
      setIsJoining(false)
    }
  }

  /**
   * Checks if user can afford minimum buy-in for a seat
   */
  function canAffordSeat(): boolean {
    if (!table || !escrowBalanceState) {
      return false
    }
    const balanceGwei = BigInt(escrowBalanceGwei)
    const minBuyInGwei = BigInt(table.minimumBuyIn)
    return balanceGwei >= minBuyInGwei
  }

  /**
   * Checks if the current user is seated at this table
   */
  function isUserSeated(): boolean {
    if (!address || !players.length) {
      return false
    }
    const normalizedAddress = address.toLowerCase()
    return players.some(p => p.walletAddress.toLowerCase() === normalizedAddress)
  }

  /**
   * Gets the current user's player info if they're seated
   */
  function getUserPlayer(): TablePlayer | null {
    if (!address || !players.length) {
      return null
    }
    const normalizedAddress = address.toLowerCase()
    return players.find(p => p.walletAddress.toLowerCase() === normalizedAddress) || null
  }

  /**
   * Handles Stand Up button click - opens confirmation dialog
   */
  function handleStandUpClick() {
    setIsStandUpConfirmOpen(true)
  }

  /**
   * Handles stand up confirmation
   */
  async function handleStandUpConfirm() {
    if (!tableId || !address || !signature) {
      return
    }

    setIsStandingUp(true)

    try {
      await standUp(
        { tableId },
        address,
        signature
      )

      // Close dialog and refresh players
      setIsStandUpConfirmOpen(false)
      
      // Refresh players list
      const fetchedPlayers = await getTablePlayers(tableId)
      setPlayers(fetchedPlayers)

      // Note: Escrow balance will be refreshed automatically by the useEscrowBalance hook
      // when the user navigates to a page that displays it (like Profile)
    } catch (error) {
      console.error('Failed to stand up:', error)
      alert(error instanceof Error ? error.message : 'Failed to stand up. Please try again.')
    } finally {
      setIsStandingUp(false)
    }
  }

  return (
    <div className="app">
      {/* Header */}
      <Header
        onLoginClick={() => setIsLoginDialogOpen(true)}
      />

      {/* Main Content */}
      <main className="table-main">
        {/* Background Table Image */}
        <div className="table-image-container">
          <img 
            src="/table.jpeg" 
            alt="Poker Table" 
            className="table-image"
          />
          
          {/* Seat Avatars */}
          {table && table.maxSeatCount > 0 && (
            <div className="table-seats-container">
              {calculateSeatPositions(table.maxSeatCount).map((position, seatIndex) => {
                // Find player at this seat
                const player = players.find(p => p.seatNumber === seatIndex)
                const hasPlayer = !!player
                
                // Convert table balance from gwei to ETH
                const tableBalanceEth = player?.tableBalanceGwei
                  ? (Number(player.tableBalanceGwei) / 1e9).toFixed(4).replace(/\.?0+$/, '')
                  : null
                
                return (
                  <div
                    key={seatIndex}
                    className="table-seat-avatar"
                    style={{
                      left: `${position.x}%`,
                      top: `${position.y}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    {hasPlayer && player.twitterHandle ? (
                      <>
                        {/* Player Avatar */}
                        <div className="table-seat-avatar-circle table-seat-avatar-filled">
                          {player.twitterAvatarUrl ? (
                            <img
                              src={player.twitterAvatarUrl}
                              alt={player.twitterHandle || 'Player'}
                              className="table-seat-avatar-image"
                              onError={(e) => {
                                // Fallback to initial if image fails to load
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const parent = target.parentElement;
                                if (parent && player.twitterHandle) {
                                  const initialDiv = document.createElement('div');
                                  initialDiv.className = 'table-seat-avatar-initial';
                                  initialDiv.textContent = player.twitterHandle.charAt(1).toUpperCase();
                                  parent.appendChild(initialDiv);
                                }
                              }}
                            />
                          ) : (
                            <div className="table-seat-avatar-initial">
                              {player.twitterHandle ? player.twitterHandle.charAt(1).toUpperCase() : '?'}
            </div>
                          )}
            </div>
                        
                        {/* Player Info Box */}
                        <div className="table-seat-player-info">
                          <a
                            href={`https://twitter.com/${player.twitterHandle.replace('@', '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="table-seat-twitter-handle"
                          >
                            {player.twitterHandle}
                          </a>
                          {tableBalanceEth && (
                            <div className="table-seat-stack">
                              {tableBalanceEth} ETH
                            </div>
                        )}
                          {/* Stand Up Button - only show if this is the current user's seat */}
                          {isUserSeated() && getUserPlayer()?.seatNumber === seatIndex && (
                            <button
                              className="table-seat-stand-up-button"
                              onClick={handleStandUpClick}
                              disabled={isStandingUp}
                              title="Stand up from the table"
                            >
                              Stand Up
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="table-seat-avatar-circle" />
                        {isFullyLoggedIn && !isUserSeated() && (
                          <button
                            className="table-seat-buy-in-button"
                            onClick={() => handleBuyInClick(seatIndex)}
                            disabled={!canAffordSeat()}
                            title={
                              !canAffordSeat()
                                ? `Insufficient balance. Minimum buy-in: ${(Number(table.minimumBuyIn) / 1e9).toFixed(4)} ETH`
                                : `Buy in to seat ${seatIndex}`
                            }
                          >
                            Buy In
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Table Name - on top of background */}
        <h1 className="table-name">{table ? table.name : `Table ${tableId || '...'}`}</h1>
      </main>

      {/* Login Dialog */}
      <LoginDialog
        isOpen={isLoginDialogOpen}
        onClose={() => setIsLoginDialogOpen(false)}
        onLoginSuccess={() => setIsLoginDialogOpen(false)}
      />

      {/* Buy In Dialog */}
      {table && selectedSeatNumber !== null && (
        <BuyInDialog
          isOpen={isBuyInDialogOpen}
          onClose={() => {
            setIsBuyInDialogOpen(false)
            setSelectedSeatNumber(null)
          }}
          onConfirm={handleBuyInConfirm}
          minimumBuyInGwei={table.minimumBuyIn}
          maximumBuyInGwei={table.maximumBuyIn}
          escrowBalanceGwei={escrowBalanceGwei}
          isLoading={isJoining}
        />
      )}

      {/* Stand Up Confirmation Dialog */}
      {table && (
        <ConfirmDialog
          isOpen={isStandUpConfirmOpen}
          onClose={() => setIsStandUpConfirmOpen(false)}
          onConfirm={handleStandUpConfirm}
          title="Stand Up"
          message={`Are you sure you want to stand up from ${table.name}? Your table balance will be moved back to your escrow.`}
          confirmText="Stand Up"
          cancelText="Cancel"
          isLoading={isStandingUp}
        />
      )}
    </div>
  )
}

export default Table

