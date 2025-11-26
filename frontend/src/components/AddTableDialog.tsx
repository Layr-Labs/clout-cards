import { useState, useEffect } from 'react'
import './AddTableDialog.css'

/**
 * Form data for creating a table
 */
interface TableFormData {
  name: string
  minimumBuyIn: string
  maximumBuyIn: string
  perHandRake: string
  maxSeatCount: string
  smallBlind: string
  bigBlind: string
}

/**
 * Validation errors for form fields
 */
interface FormErrors {
  name?: string
  minimumBuyIn?: string
  maximumBuyIn?: string
  perHandRake?: string
  maxSeatCount?: string
  smallBlind?: string
  bigBlind?: string
}

/**
 * Add Table Dialog Component
 *
 * Dialog for creating a new poker table with validation matching database constraints.
 */
export function AddTableDialog({
  isOpen,
  onClose,
  onCreateTable,
}: {
  isOpen: boolean
  onClose: () => void
  onCreateTable: (data: TableFormData) => Promise<void>
}) {
  const [formData, setFormData] = useState<TableFormData>({
    name: '',
    minimumBuyIn: '',
    maximumBuyIn: '',
    perHandRake: '',
    maxSeatCount: '',
    smallBlind: '',
    bigBlind: '',
  })

  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  /**
   * Validates a single field
   */
  function validateField(name: keyof TableFormData, value: string): string | undefined {
    switch (name) {
      case 'name':
        if (!value.trim()) {
          return 'Table name is required'
        }
        if (value.length > 255) {
          return 'Table name must be 255 characters or less'
        }
        return undefined

      case 'minimumBuyIn':
        if (!value.trim()) {
          return 'Minimum buy-in is required'
        }
        const minBuyIn = BigInt(value.trim() || '0')
        if (minBuyIn <= 0n) {
          return 'Minimum buy-in must be greater than 0'
        }
        return undefined

      case 'maximumBuyIn':
        if (!value.trim()) {
          return 'Maximum buy-in is required'
        }
        const maxBuyIn = BigInt(value.trim() || '0')
        const currentMinBuyIn = BigInt(formData.minimumBuyIn.trim() || '0')
        if (maxBuyIn < currentMinBuyIn) {
          return 'Maximum buy-in must be >= minimum buy-in'
        }
        return undefined

      case 'perHandRake':
        if (!value.trim()) {
          return 'Per-hand rake is required'
        }
        const rake = parseInt(value.trim(), 10)
        if (isNaN(rake) || rake < 0) {
          return 'Per-hand rake must be >= 0 (in basis points)'
        }
        return undefined

      case 'maxSeatCount':
        if (!value.trim()) {
          return 'Max seat count is required'
        }
        const seats = parseInt(value.trim(), 10)
        if (isNaN(seats) || seats < 0 || seats > 8) {
          return 'Max seat count must be between 0 and 8'
        }
        return undefined

      case 'smallBlind':
        if (!value.trim()) {
          return 'Small blind is required'
        }
        const smallBlind = BigInt(value.trim() || '0')
        if (smallBlind <= 0n) {
          return 'Small blind must be greater than 0'
        }
        return undefined

      case 'bigBlind':
        if (!value.trim()) {
          return 'Big blind is required'
        }
        const bigBlind = BigInt(value.trim() || '0')
        const currentSmallBlind = BigInt(formData.smallBlind.trim() || '0')
        if (bigBlind < currentSmallBlind) {
          return 'Big blind must be >= small blind'
        }
        if (bigBlind <= 0n) {
          return 'Big blind must be greater than 0'
        }
        return undefined

      default:
        return undefined
    }
  }

  /**
   * Validates all fields
   */
  function validateAll(): boolean {
    const newErrors: FormErrors = {}
    let isValid = true

    for (const field in formData) {
      const error = validateField(field as keyof TableFormData, formData[field as keyof TableFormData])
      if (error) {
        newErrors[field as keyof FormErrors] = error
        isValid = false
      }
    }

    setErrors(newErrors)
    return isValid
  }

  /**
   * Handles input changes
   */
  function handleChange(name: keyof TableFormData, value: string) {
    setFormData((prev) => ({ ...prev, [name]: value }))
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[name]
        return newErrors
      })
    }
  }

  /**
   * Handles form submission
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!validateAll()) {
      return
    }

    setIsSubmitting(true)
    try {
      await onCreateTable(formData)
      // Reset form and close dialog on success
      setFormData({
        name: '',
        minimumBuyIn: '',
        maximumBuyIn: '',
        perHandRake: '',
        maxSeatCount: '',
        smallBlind: '',
        bigBlind: '',
      })
      setErrors({})
      onClose()
    } catch (error) {
      console.error('Error creating table:', error)
      alert(error instanceof Error ? error.message : 'Failed to create table')
    } finally {
      setIsSubmitting(false)
    }
  }

  /**
   * Checks if form is valid (all fields filled and no errors)
   * 
   * Note: This does NOT call validateAll() to avoid infinite re-renders.
   * Validation happens on blur/change, and this just checks if fields are filled
   * and there are no existing errors.
   */
  const isFormValid = (): boolean => {
    // Check all required fields are filled
    if (
      !formData.name.trim() ||
      !formData.minimumBuyIn.trim() ||
      !formData.maximumBuyIn.trim() ||
      !formData.perHandRake.trim() ||
      !formData.maxSeatCount.trim() ||
      !formData.smallBlind.trim() ||
      !formData.bigBlind.trim()
    ) {
      return false
    }

    // Check there are no validation errors
    if (Object.keys(errors).length > 0) {
      return false
    }

    // Quick validation checks without calling setErrors
    try {
      const minBuyIn = BigInt(formData.minimumBuyIn.trim() || '0')
      const maxBuyIn = BigInt(formData.maximumBuyIn.trim() || '0')
      const rake = parseInt(formData.perHandRake.trim(), 10)
      const seats = parseInt(formData.maxSeatCount.trim(), 10)
      const smallBlind = BigInt(formData.smallBlind.trim() || '0')
      const bigBlind = BigInt(formData.bigBlind.trim() || '0')

      if (minBuyIn <= 0n) return false
      if (maxBuyIn < minBuyIn) return false
      if (isNaN(rake) || rake < 0) return false
      if (isNaN(seats) || seats < 0 || seats > 8) return false
      if (smallBlind <= 0n) return false
      if (bigBlind < smallBlind || bigBlind <= 0n) return false
      if (formData.name.length > 255) return false

      return true
    } catch {
      return false
    }
  }

  // Reset form when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setFormData({
        name: '',
        minimumBuyIn: '',
        maximumBuyIn: '',
        perHandRake: '',
        maxSeatCount: '',
        smallBlind: '',
        bigBlind: '',
      })
      setErrors({})
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2 className="dialog-title">Add New Table</h2>
          <button className="dialog-close" onClick={onClose} aria-label="Close dialog">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="dialog-form">
          <div className="form-group">
            <label htmlFor="name" className="form-label">
              Table Name *
            </label>
            <input
              type="text"
              id="name"
              className={`form-input ${errors.name ? 'form-input-error' : ''}`}
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="e.g., High Stakes Table"
              maxLength={255}
              required
            />
            {errors.name && <span className="form-error">{errors.name}</span>}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="minimumBuyIn" className="form-label">
                Minimum Buy-In (gwei) *
              </label>
              <input
                type="text"
                id="minimumBuyIn"
                className={`form-input ${errors.minimumBuyIn ? 'form-input-error' : ''}`}
                value={formData.minimumBuyIn}
                onChange={(e) => handleChange('minimumBuyIn', e.target.value)}
                placeholder="1000000000"
                required
              />
              {errors.minimumBuyIn && <span className="form-error">{errors.minimumBuyIn}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="maximumBuyIn" className="form-label">
                Maximum Buy-In (gwei) *
              </label>
              <input
                type="text"
                id="maximumBuyIn"
                className={`form-input ${errors.maximumBuyIn ? 'form-input-error' : ''}`}
                value={formData.maximumBuyIn}
                onChange={(e) => handleChange('maximumBuyIn', e.target.value)}
                placeholder="10000000000"
                required
              />
              {errors.maximumBuyIn && <span className="form-error">{errors.maximumBuyIn}</span>}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="perHandRake" className="form-label">
                Per-Hand Rake (bps) *
              </label>
              <input
                type="number"
                id="perHandRake"
                className={`form-input ${errors.perHandRake ? 'form-input-error' : ''}`}
                value={formData.perHandRake}
                onChange={(e) => handleChange('perHandRake', e.target.value)}
                placeholder="100"
                min="0"
                required
              />
              {errors.perHandRake && <span className="form-error">{errors.perHandRake}</span>}
              <span className="form-hint">100 bps = 1%</span>
            </div>

            <div className="form-group">
              <label htmlFor="maxSeatCount" className="form-label">
                Max Seat Count *
              </label>
              <input
                type="number"
                id="maxSeatCount"
                className={`form-input ${errors.maxSeatCount ? 'form-input-error' : ''}`}
                value={formData.maxSeatCount}
                onChange={(e) => handleChange('maxSeatCount', e.target.value)}
                placeholder="6"
                min="0"
                max="8"
                required
              />
              {errors.maxSeatCount && <span className="form-error">{errors.maxSeatCount}</span>}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="smallBlind" className="form-label">
                Small Blind (gwei) *
              </label>
              <input
                type="text"
                id="smallBlind"
                className={`form-input ${errors.smallBlind ? 'form-input-error' : ''}`}
                value={formData.smallBlind}
                onChange={(e) => handleChange('smallBlind', e.target.value)}
                placeholder="100000000"
                required
              />
              {errors.smallBlind && <span className="form-error">{errors.smallBlind}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="bigBlind" className="form-label">
                Big Blind (gwei) *
              </label>
              <input
                type="text"
                id="bigBlind"
                className={`form-input ${errors.bigBlind ? 'form-input-error' : ''}`}
                value={formData.bigBlind}
                onChange={(e) => handleChange('bigBlind', e.target.value)}
                placeholder="200000000"
                required
              />
              {errors.bigBlind && <span className="form-error">{errors.bigBlind}</span>}
            </div>
          </div>

          <div className="dialog-actions">
            <button type="button" className="dialog-button-cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="dialog-button-submit"
              disabled={!isFormValid() || isSubmitting}
            >
              {isSubmitting ? 'Creating...' : 'Create Table'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

