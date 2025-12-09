import './ConfirmDialog.css';

/**
 * Confirmation dialog component
 *
 * Simple dialog for confirming user actions before execution.
 *
 * @param isOpen - Whether the dialog is visible
 * @param onClose - Callback function called when dialog should be closed
 * @param onConfirm - Callback function called when user confirms the action
 * @param title - Dialog title text
 * @param message - Dialog message text
 * @param confirmText - Text for the confirm button (default: "Confirm")
 * @param cancelText - Text for the cancel button (default: "Cancel")
 * @param isLoading - Whether the action is in progress (disables buttons)
 */
export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isLoading = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
}) {
  if (!isOpen) return null;

  return (
    <div className="dialog-overlay-base confirm-dialog-overlay" onClick={onClose}>
      <div className="dialog-content-base confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header-base confirm-dialog-header">
          <h2 className="dialog-title-base">{title}</h2>
          <button
            className="dialog-close-base confirm-dialog-close"
            onClick={onClose}
            disabled={isLoading}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>

        <div className="dialog-content-area-base confirm-dialog-content">
          <p>{message}</p>
        </div>

        <div className="dialog-actions-base confirm-dialog-actions">
          <button
            className="dialog-button-base dialog-button-cancel-base confirm-dialog-button-cancel"
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelText}
          </button>
          <button
            className="dialog-button-base dialog-button-confirm-base confirm-dialog-button-confirm"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

