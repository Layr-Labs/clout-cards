import './App.css'
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getPokerTables, type PokerTable } from './services/tables'
import { Header } from './components/Header'
import { LoginDialog } from './components/LoginDialog'

/**
 * Table page component for CloutCards
 *
 * Displays a specific poker table with its active players.
 * Features the same header as the Play page.
 */
function Table() {
  const { id } = useParams<{ id: string }>()
  const [table, setTable] = useState<PokerTable | null>(null)
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false)

  const tableId = id ? parseInt(id, 10) : null

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
              {calculateSeatPositions(table.maxSeatCount).map((position, index) => (
                <div
                  key={index}
                  className="table-seat-avatar"
                  style={{
                    left: `${position.x}%`,
                    top: `${position.y}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <div className="table-seat-avatar-circle" />
                </div>
              ))}
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
    </div>
  )
}

export default Table

