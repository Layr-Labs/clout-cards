/**
 * Reusable table card component
 *
 * Displays table information in a card format.
 * Used on both Play and Admin pages.
 */

import { formatGwei } from '../utils/formatGwei';
import { type PokerTable } from '../services/tables';
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
              {formatGwei(table.minimumBuyIn)} - {formatGwei(table.maximumBuyIn)} gwei
            </span>
          </div>
          <div className="table-card-detail">
            <span className="table-card-label">Blinds:</span>
            <span className="table-card-value">
              {formatGwei(table.smallBlind)} / {formatGwei(table.bigBlind)} gwei
            </span>
          </div>
          <div className="table-card-detail">
            <span className="table-card-label">Rake:</span>
            <span className="table-card-value">{table.perHandRake} bps</span>
          </div>
          <div className="table-card-detail">
            <span className="table-card-label">Seats:</span>
            <span className="table-card-value">{table.maxSeatCount}</span>
          </div>
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

