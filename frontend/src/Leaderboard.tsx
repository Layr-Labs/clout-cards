import './App.css'
import { useState, useEffect } from 'react'
import { PageLayout } from './components/PageLayout'
import { getLeaderboard, type LeaderboardEntry, type LeaderboardSortBy } from './services/leaderboard'
import { formatEth } from './utils/formatEth'
import { AsyncState } from './components/AsyncState'

/**
 * Leaderboard page component
 *
 * Displays top players ranked by different metrics:
 * - Biggest Winners (by total lifetime winnings)
 * - Biggest Bettors (by total lifetime bets)
 * - Most Active (by hands played)
 */
function Leaderboard() {
  const [activeTab, setActiveTab] = useState<LeaderboardSortBy>('winnings')
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Fetches leaderboard data when tab changes
   */
  useEffect(() => {
    async function loadLeaderboard() {
      setIsLoading(true)
      setError(null)
      try {
        const data = await getLeaderboard(activeTab, 20)
        setLeaderboard(data)
      } catch (err: any) {
        setError(err.message || 'Failed to load leaderboard')
        console.error('Failed to load leaderboard:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadLeaderboard()
  }, [activeTab])

  const tabs = [
    { id: 'winnings' as LeaderboardSortBy, label: 'Biggest Winners' },
    { id: 'bets' as LeaderboardSortBy, label: 'Biggest Bettors' },
    { id: 'hands' as LeaderboardSortBy, label: 'Most Active' },
  ]

  return (
    <PageLayout containerClassName="app-container">
      <div className="content-container">
        <div className="leaderboard-container">
          <h1>Leaderboard</h1>

          {/* Tabs */}
          <div className="leaderboard-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`leaderboard-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Leaderboard Table */}
          <AsyncState isLoading={isLoading} error={error}>
            {leaderboard.length === 0 ? (
              <div className="leaderboard-empty">
                <p>No players found. Be the first to play!</p>
              </div>
            ) : (
              <div className="leaderboard-table-container">
                <table className="leaderboard-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Player</th>
                      <th>Hands Played</th>
                      <th>Hands Won</th>
                      {activeTab === 'winnings' && <th>Total Winnings</th>}
                      {activeTab === 'bets' && <th>Total Bets</th>}
                      {activeTab === 'hands' && <th>Win Rate</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((entry) => {
                      const winRate = entry.handsPlayed > 0
                        ? ((entry.handsWon / entry.handsPlayed) * 100).toFixed(1)
                        : '0.0'

                      return (
                        <tr key={entry.twitterHandle}>
                          <td className="leaderboard-rank">#{entry.rank}</td>
                          <td className="leaderboard-handle">
                            <a
                              href={`https://twitter.com/${entry.twitterHandle.replace('@', '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="leaderboard-handle-link"
                            >
                              {entry.twitterHandle}
                            </a>
                          </td>
                          <td>{entry.handsPlayed}</td>
                          <td>{entry.handsWon}</td>
                          {activeTab === 'winnings' && (
                            <td className="leaderboard-amount">{formatEth(entry.totalLifetimeWinnings)}</td>
                          )}
                          {activeTab === 'bets' && (
                            <td className="leaderboard-amount">{formatEth(entry.totalLifetimeBets)}</td>
                          )}
                          {activeTab === 'hands' && (
                            <td>{winRate}%</td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </AsyncState>
        </div>
      </div>
    </PageLayout>
  )
}

export default Leaderboard

