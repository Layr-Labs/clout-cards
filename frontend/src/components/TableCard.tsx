/**
 * Reusable table card component
 *
 * Displays table information in a card format.
 * Used on both Play and Admin pages.
 */

import { formatEth } from '../utils/formatEth';
import { type PokerTable, type TablePlayer } from '../services/tables';
import '../styles/status-badges.css';
import './TableCard.css';

/**
 * Props for TableCard component
 */
export interface TableCardProps {
  /**
   * Poker table data to display
   */
  table: PokerTable;
  /**
   * Optional array of players at the table
   */
  players?: TablePlayer[];
  /**
   * Callback when action button is clicked
   */
  onAction?: (table: PokerTable) => void;
  /**
   * Label for the action button
   */
  actionLabel?: string;
  /**
   * Whether the action button should be disabled
   */
  actionDisabled?: boolean;
  /**
   * Custom action button render function (for complex button logic)
   */
  renderAction?: (table: PokerTable) => React.ReactNode;
  /**
   * Whether to show full details or summary view
   */
  showDetails?: boolean;
  /**
   * Additional CSS class name
   */
  className?: string;
}

/**
 * Table Card component
 *
 * Displays a poker table in a card format with:
 * - Table name and status badge
 * - Buy-in range
 * - Blinds
 * - Rake
 * - Seats
 * - Optional action button
 */
export function TableCard({
  table,
  players,
  onAction,
  actionLabel,
  actionDisabled = false,
  showDetails = true,
  className = '',
  renderAction,
}: TableCardProps) {
  const handleClick = () => {
    if (onAction) {
      onAction(table);
    }
  };

  return (
    <div 
      className={`table-card ${className}`}
      onClick={onAction && !actionLabel ? handleClick : undefined}
      style={onAction && !actionLabel ? { cursor: 'pointer' } : undefined}
    >
      <div className="table-card-header">
        <h3 className="table-card-name">{table.name}</h3>
        <span className={`status-badge ${table.isActive ? 'active' : 'inactive'}`}>
          {table.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>
      {showDetails && (
        <div className="table-card-details">
          <div className="table-card-detail">
            <span className="table-card-label">Buy-In:</span>
            <span className="table-card-value">
              {formatEth(table.minimumBuyIn)} - {formatEth(table.maximumBuyIn)}
            </span>
          </div>
          <div className="table-card-detail">
            <span className="table-card-label">Blinds:</span>
            <span className="table-card-value">
              {formatEth(table.smallBlind)} / {formatEth(table.bigBlind)}
            </span>
          </div>
          <div className="table-card-detail">
            <span className="table-card-label">Rake:</span>
            <span className="table-card-value">{(table.perHandRake / 100).toFixed(2)}%</span>
          </div>
          <div className="table-card-detail">
            <span className="table-card-label">Seats:</span>
            <span className="table-card-value">{table.maxSeatCount}</span>
          </div>
          {players && players.length > 0 && (
            <div className="table-card-detail table-card-players">
              <span className="table-card-label">Players:</span>
              <div className="table-card-players-avatars">
                {players.map((player) => {
                  const twitterUrl = player.twitterHandle
                    ? `https://twitter.com/${player.twitterHandle.replace('@', '')}`
                    : null;
                  
                  const avatarContent = (
                    <>
                      {player.twitterAvatarUrl ? (
                        <img
                          src={player.twitterAvatarUrl}
                          alt={player.twitterHandle || 'Player'}
                          className="table-card-avatar-image"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const parent = target.parentElement;
                            if (parent && player.twitterHandle) {
                              const initialDiv = document.createElement('div');
                              initialDiv.className = 'table-card-avatar-initial';
                              initialDiv.textContent = player.twitterHandle.charAt(1).toUpperCase();
                              parent.appendChild(initialDiv);
                            }
                          }}
                        />
                      ) : (
                        <div className="table-card-avatar-initial">
                          {player.twitterHandle ? player.twitterHandle.charAt(1).toUpperCase() : '?'}
                        </div>
                      )}
                    </>
                  );

                  return twitterUrl ? (
                    <a
                      key={player.id}
                      href={twitterUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="table-card-player-avatar table-card-player-avatar-link"
                      title={player.twitterHandle || player.walletAddress}
                    >
                      {avatarContent}
                    </a>
                  ) : (
                    <div
                      key={player.id}
                      className="table-card-player-avatar"
                      title={player.twitterHandle || player.walletAddress}
                    >
                      {avatarContent}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      {(onAction && actionLabel) || renderAction ? (
        <div className="table-card-actions">
          {renderAction ? (
            renderAction(table)
          ) : (
            <button
              className="table-card-action-button"
              onClick={(e) => {
                e.stopPropagation();
                onAction!(table);
              }}
              disabled={actionDisabled || !table.isActive}
            >
              {actionLabel}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

