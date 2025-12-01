import './App.css'
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getPokerTables, getTablePlayers, joinTable, standUp, getCurrentHand, playerAction, type PokerTable, type TablePlayer, type CurrentHand } from './services/tables'
import { Header } from './components/Header'
import { LoginDialog } from './components/LoginDialog'
import { BuyInDialog } from './components/BuyInDialog'
import { ConfirmDialog } from './components/ConfirmDialog'
import { Card } from './components/Card'
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
  const [currentHand, setCurrentHand] = useState<CurrentHand | null>(null)
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false)
  const [isBuyInDialogOpen, setIsBuyInDialogOpen] = useState(false)
  const [selectedSeatNumber, setSelectedSeatNumber] = useState<number | null>(null)
  const [isJoining, setIsJoining] = useState(false)
  const [isStandUpConfirmOpen, setIsStandUpConfirmOpen] = useState(false)
  const [isStandingUp, setIsStandingUp] = useState(false)
  const [isProcessingAction, setIsProcessingAction] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

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
   * Loads current hand state
   * Only polls if there are at least 2 players at the table
   */
  useEffect(() => {
    if (!tableId || !isFullyLoggedIn || !address || !signature) {
      setCurrentHand(null)
      return
    }

    // Only poll for hands if there are at least 2 players
    if (players.length < 2) {
      setCurrentHand(null)
      return
    }

    async function loadHand() {
      if (!signature || !address) return
      try {
        const hand = await getCurrentHand(tableId!, address, signature)
        setCurrentHand(hand)
      } catch (err: any) {
        // 404 is expected when no hand is active
        if (err?.status !== 404) {
          console.error('Failed to load hand:', err)
        }
        setCurrentHand(null)
      }
    }

    loadHand()
    
    // Refresh hand every 2 seconds
    const interval = setInterval(loadHand, 2000)
    return () => clearInterval(interval)
  }, [tableId, isFullyLoggedIn, address, signature, players.length])

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
   * Gets the hand player for the current user
   */
  function getUserHandPlayer() {
    if (!currentHand || !address) return null
    const normalizedAddress = address.toLowerCase()
    return currentHand.players.find(p => p.walletAddress.toLowerCase() === normalizedAddress) || null
  }

  /**
   * Checks if it's the current user's turn to act
   */
  function isUserTurn(): boolean {
    const userHandPlayer = getUserHandPlayer()
    if (!currentHand || !userHandPlayer) return false
    return currentHand.currentActionSeat === userHandPlayer.seatNumber && userHandPlayer.status === 'ACTIVE'
  }

  /**
   * Checks if it's a specific seat's turn to act
   */
  function isSeatTurn(seatNumber: number): boolean {
    if (!currentHand) return false
    const handPlayer = getHandPlayerBySeat(seatNumber)
    return currentHand.currentActionSeat === seatNumber && handPlayer?.status === 'ACTIVE'
  }

  /**
   * Gets hand player by seat number
   */
  function getHandPlayerBySeat(seatNumber: number) {
    if (!currentHand) return null
    return currentHand.players.find(p => p.seatNumber === seatNumber) || null
  }

  /**
   * Handles Stand Up button click - opens confirmation dialog
   */
  function handleStandUpClick() {
    setIsStandUpConfirmOpen(true)
  }

  /**
   * Handles Fold button click
   */
  async function handleFoldClick() {
    if (!tableId || !address || !signature || isProcessingAction) {
      return
    }

    setIsProcessingAction(true)
    setActionError(null)

    try {
      const result = await playerAction(tableId, 'FOLD', address, signature)
      
      if (result.handEnded) {
        // Hand ended, polling will pick up the new state
        console.log('Hand ended after fold')
      }
      
      // Clear any previous errors on success
      setActionError(null)
      
      // Polling will automatically pick up the state change
    } catch (err: any) {
      console.error('Failed to fold:', err)
      setActionError(err.message || 'Failed to fold')
    } finally {
      setIsProcessingAction(false)
    }
  }

  /**
   * Handles Check/Call button click
   */
  async function handleCheckCallClick() {
    if (!tableId || !address || !signature || isProcessingAction || !currentHand) {
      return
    }

    setIsProcessingAction(true)
    setActionError(null)

    try {
      const userHandPlayer = getUserHandPlayer()
      if (!userHandPlayer) {
        throw new Error('Player not found in hand')
      }

      const currentBet = currentHand.currentBet ? BigInt(currentHand.currentBet) : 0n
      const chipsCommitted = userHandPlayer.chipsCommitted ? BigInt(userHandPlayer.chipsCommitted) : 0n
      const canCheck = currentBet === 0n || chipsCommitted >= currentBet

      const action = canCheck ? 'CHECK' : 'CALL'
      const result = await playerAction(tableId, action, address, signature)
      
      if (result.handEnded) {
        console.log('Hand ended after check/call')
      }
      
      if (result.roundAdvanced) {
        console.log('Betting round advanced')
      }
      
      // Clear any previous errors on success
      setActionError(null)
      
      // Polling will automatically pick up the state change
    } catch (err: any) {
      console.error('Failed to check/call:', err)
      setActionError(err.message || 'Failed to check/call')
    } finally {
      setIsProcessingAction(false)
    }
  }

  /**
   * Gets the call amount needed (if any)
   */
  function getCallAmount(): bigint | null {
    if (!currentHand) return null
    
    const userHandPlayer = getUserHandPlayer()
    if (!userHandPlayer) return null

    const currentBet = currentHand.currentBet ? BigInt(currentHand.currentBet) : 0n
    const chipsCommitted = userHandPlayer.chipsCommitted ? BigInt(userHandPlayer.chipsCommitted) : 0n
    
    if (currentBet === 0n || chipsCommitted >= currentBet) {
      return null // Can check
    }
    
    return currentBet - chipsCommitted
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
          
          {/* Community Cards - Center of Table */}
          {currentHand && currentHand.communityCards.length > 0 && (
            <div className="table-community-cards">
              {currentHand.communityCards.map((card, index) => (
                <Card
                  key={index}
                  suit={card.suit}
                  rank={card.rank}
                />
              ))}
            </div>
          )}

          {/* Pots Display - Below Community Cards */}
          {currentHand && currentHand.pots.length > 0 && (
            <div className="table-pots">
              {currentHand.pots.map((pot) => (
                <div key={pot.potNumber} className="table-pot">
                  <div className="table-pot-amount">
                    {(Number(pot.amount) / 1e9).toFixed(4).replace(/\.?0+$/, '')} ETH
                  </div>
                  <div className="table-pot-avatars">
                    {pot.eligibleSeatNumbers.map((seatNum) => {
                      const handPlayer = getHandPlayerBySeat(seatNum)
                      if (!handPlayer?.twitterAvatarUrl) return null
                      return (
                        <img
                          key={seatNum}
                          src={handPlayer.twitterAvatarUrl}
                          alt={handPlayer.twitterHandle || 'Player'}
                          className="table-pot-avatar"
                        />
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          
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
                        
                        {/* Badges for dealer/blinds - can show multiple - positioned outside circle to avoid clipping */}
                        {currentHand && (
                          <div className="table-seat-badges">
                            {currentHand.dealerPosition === seatIndex && (
                              <div className="table-seat-badge table-seat-badge-dealer">D</div>
                            )}
                            {currentHand.smallBlindSeat === seatIndex && (
                              <div className="table-seat-badge table-seat-badge-small-blind">SB</div>
                            )}
                            {currentHand.bigBlindSeat === seatIndex && (
                              <div className="table-seat-badge table-seat-badge-big-blind">BB</div>
                            )}
                          </div>
                        )}

                        {/* Player Cards */}
                        {currentHand && (() => {
                          const handPlayer = getHandPlayerBySeat(seatIndex)
                          const isAuthorizedPlayer = address && player.walletAddress.toLowerCase() === address.toLowerCase()
                          
                          if (!handPlayer) return null
                          
                          // Show hole cards for authorized player if active
                          if (isAuthorizedPlayer && handPlayer.holeCards && handPlayer.status === 'ACTIVE') {
                            return (
                              <div className="table-seat-cards">
                                {handPlayer.holeCards.map((card, idx) => (
                                  <Card
                                    key={idx}
                                    suit={card.suit}
                                    rank={card.rank}
                                  />
                                ))}
                              </div>
                            )
                          }
                          
                          // Show card backs for other players in hand
                          if (!isAuthorizedPlayer && handPlayer.status === 'ACTIVE') {
                            return (
                              <div className="table-seat-cards">
                                <Card isBack={true} />
                                <Card isBack={true} />
                              </div>
                            )
                          }
                          
                          return null
                        })()}
                        
                        {/* Player Info Box */}
                        <div className={`table-seat-player-info ${position.x > 50 ? 'table-seat-player-info-right' : ''} ${isSeatTurn(seatIndex) ? 'table-seat-player-info-turn' : ''}`}>
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
                          {/* Stand Up Button - only show if this is the current user's seat and no hand active */}
                          {isUserSeated() && getUserPlayer()?.seatNumber === seatIndex && !currentHand && (
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

        {/* Action Buttons - Show when it's user's turn */}
        {currentHand && isUserTurn() && (
          <div className="table-action-buttons">
            <div className="table-action-info">
              {actionError && (
                <div className="table-action-error" style={{ color: '#ef4444', fontSize: '0.9rem', marginBottom: '8px' }}>
                  {actionError}
                </div>
              )}
              {currentHand.currentBet && (
                <div className="table-action-current-bet">
                  Current Bet: {(Number(currentHand.currentBet) / 1e9).toFixed(4).replace(/\.?0+$/, '')} ETH
                </div>
              )}
            </div>
            <div className="table-action-buttons-row">
              <button
                className="table-action-button table-action-button-fold"
                onClick={handleFoldClick}
                disabled={isProcessingAction}
              >
                {isProcessingAction ? 'Processing...' : 'Fold'}
              </button>
              <button
                className="table-action-button table-action-button-check-call"
                onClick={handleCheckCallClick}
                disabled={isProcessingAction}
              >
                {(() => {
                  const callAmount = getCallAmount()
                  if (callAmount === null) {
                    return isProcessingAction ? 'Processing...' : 'Check'
                  } else {
                    const callAmountEth = (Number(callAmount) / 1e9).toFixed(4).replace(/\.?0+$/, '')
                    return isProcessingAction ? 'Processing...' : `Call ${callAmountEth} ETH`
                  }
                })()}
              </button>
              <button
                className="table-action-button table-action-button-raise"
                onClick={() => {
                  // TODO: Implement raise action
                  console.log('Raise clicked')
                }}
              >
                Raise
              </button>
            </div>
          </div>
        )}
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

