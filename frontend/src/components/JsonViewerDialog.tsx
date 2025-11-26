import './JsonViewerDialog.css'

/**
 * JSON Viewer Dialog Component
 *
 * Dialog for displaying formatted JSON payloads in a readable way.
 */
export function JsonViewerDialog({
  isOpen,
  onClose,
  jsonString,
  title = 'JSON Payload',
}: {
  isOpen: boolean
  onClose: () => void
  jsonString: string
  title?: string
}) {
  if (!isOpen) return null

  let formattedJson: string
  let parseError: string | null = null

  try {
    const parsed = JSON.parse(jsonString)
    formattedJson = JSON.stringify(parsed, null, 2)
  } catch (error) {
    parseError = error instanceof Error ? error.message : 'Failed to parse JSON'
    formattedJson = jsonString
  }

  function handleCopy() {
    navigator.clipboard.writeText(formattedJson).catch((err) => {
      console.error('Failed to copy JSON:', err)
    })
  }

  return (
    <div className="json-dialog-overlay" onClick={onClose}>
      <div className="json-dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="json-dialog-header">
          <h2 className="json-dialog-title">{title}</h2>
          <div className="json-dialog-actions-header">
            <button className="json-dialog-copy" onClick={handleCopy} title="Copy JSON">
              Copy
            </button>
            <button className="json-dialog-close" onClick={onClose} aria-label="Close dialog">
              ×
            </button>
          </div>
        </div>

        <div className="json-dialog-body">
          {parseError && (
            <div className="json-dialog-error">
              <p>Parse Error: {parseError}</p>
              <p className="json-dialog-error-note">Displaying raw content below:</p>
            </div>
          )}
          <pre className="json-dialog-pre">
            <code className="json-dialog-code">{formattedJson}</code>
          </pre>
        </div>
      </div>
    </div>
  )
}

