# Code Duplication Refactoring Plan

This document identifies code duplication across the frontend and backend, and proposes refactoring strategies to reduce redundancy and improve maintainability.

## Summary

The analysis identified **7 major areas** of code duplication:
1. Frontend API client error handling (High Priority)
2. Backend error response formatting (High Priority)
3. Table ID validation (Medium Priority)
4. BigInt serialization helpers (Medium Priority)
5. Authentication middleware patterns (Medium Priority)
6. Table card component duplication (Low Priority)
7. Loading/error/empty state patterns (Low Priority)

---

## 1. Frontend API Client Error Handling (HIGH PRIORITY)

### Current Duplication

**Location**: All files in `frontend/src/services/`
- `tables.ts` (6 occurrences)
- `events.ts` (1 occurrence)
- `escrow.ts` (2 occurrences)
- `session.ts` (1 occurrence)
- `twitter.ts` (1 occurrence)
- `admin.ts` (1 occurrence)

**Pattern**:
```typescript
if (!response.ok) {
  const errorData = await response.json().catch(() => ({}));
  throw new Error(
    errorData.message || `Failed to [action]: ${response.status} ${response.statusText}`
  );
}
```

### Proposed Solution

**Create**: `frontend/src/services/apiClient.ts`

```typescript
/**
 * Centralized API client with consistent error handling
 * 
 * Provides a wrapper around fetch with:
 * - Automatic error parsing
 * - Consistent error message extraction
 * - Type-safe request/response handling
 */

interface ApiClientOptions extends RequestInit {
  requireAuth?: boolean;
  signature?: string;
  twitterToken?: string;
  walletAddress?: string;
}

export async function apiClient<T>(
  endpoint: string,
  options: ApiClientOptions = {}
): Promise<T> {
  const { requireAuth, signature, twitterToken, walletAddress, ...fetchOptions } = options;
  
  const headers = new Headers(fetchOptions.headers);
  headers.set('Content-Type', 'application/json');
  
  if (requireAuth && signature) {
    headers.set('Authorization', `Bearer ${signature}`);
  }
  
  if (twitterToken) {
    headers.set('X-Twitter-Access-Token', twitterToken);
  }
  
  const url = walletAddress 
    ? `${endpoint}?walletAddress=${encodeURIComponent(walletAddress)}`
    : endpoint;
  
  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `API request failed: ${response.status} ${response.statusText}`
    );
  }
  
  return response.json();
}
```

**Refactor Impact**:
- **Files to modify**: 6 service files
- **Lines removed**: ~60 lines of duplicated code
- **Benefits**: Single source of truth for error handling, easier to add retry logic, consistent error messages

---

## 2. Backend Error Response Formatting (HIGH PRIORITY)

### Current Duplication

**Location**: `src/index.ts` (throughout all endpoints)

**Pattern**:
```typescript
catch (error) {
  console.error('Error [action]:', error);
  res.status(statusCode).json({
    error: 'Failed to [action]',
    message: error instanceof Error ? error.message : 'Unknown error',
  });
}
```

**Additional duplication**: Error status code mapping logic is repeated:
- 400 for validation errors
- 401 for auth errors
- 404 for not found
- 409 for conflicts
- 500 for server errors

### Proposed Solution

**Create**: `src/utils/errorHandler.ts`

```typescript
/**
 * Centralized error handling utilities for Express endpoints
 */

export interface ApiError {
  error: string;
  message: string;
}

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly errorCode?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function handleError(error: unknown, defaultMessage: string): ApiError {
  if (error instanceof AppError) {
    return {
      error: error.errorCode || 'Error',
      message: error.message,
    };
  }
  
  return {
    error: 'Error',
    message: error instanceof Error ? error.message : defaultMessage,
  };
}

export function sendErrorResponse(
  res: Response,
  error: unknown,
  defaultMessage: string,
  defaultStatusCode: number = 500
): void {
  const appError = error instanceof AppError ? error : new AppError(defaultMessage, defaultStatusCode);
  const apiError = handleError(appError, defaultMessage);
  
  res.status(appError.statusCode).json(apiError);
}
```

**Create**: `src/utils/validation.ts`

```typescript
/**
 * Common validation utilities
 */

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'ValidationError');
  }
}

export function validateTableId(tableIdParam: unknown): number {
  if (!tableIdParam) {
    throw new ValidationError('tableId query parameter is required');
  }
  
  const tableId = parseInt(String(tableIdParam), 10);
  if (isNaN(tableId) || tableId <= 0) {
    throw new ValidationError('tableId must be a positive integer');
  }
  
  return tableId;
}
```

**Refactor Impact**:
- **Files to modify**: `src/index.ts` (all endpoints)
- **Lines removed**: ~150 lines of duplicated error handling
- **Benefits**: Consistent error responses, easier to add error tracking/logging, type-safe error handling

---

## 3. Table ID Validation (MEDIUM PRIORITY)

### Current Duplication

**Location**: `src/index.ts`
- Lines 365-384 (`/tablePlayers`)
- Lines 481-500 (`/admin/tableSessions`)
- Lines 621-655 (`/joinTable`)
- Lines 778-801 (`/standUp`)

**Pattern**:
```typescript
const tableIdParam = req.query.tableId;
if (!tableIdParam) {
  res.status(400).json({
    error: 'Invalid request',
    message: 'tableId query parameter is required',
  });
  return;
}

const tableId = parseInt(tableIdParam as string, 10);
if (isNaN(tableId) || tableId <= 0) {
  res.status(400).json({
    error: 'Invalid request',
    message: 'tableId must be a positive integer',
  });
  return;
}

// Verify table exists
const table = await prisma.pokerTable.findUnique({
  where: { id: tableId },
  select: { id: true },
});

if (!table) {
  res.status(404).json({
    error: 'Table not found',
    message: `No table found with id: ${tableId}`,
  });
  return;
}
```

### Proposed Solution

**Extend**: `src/utils/validation.ts` (from section 2)

```typescript
/**
 * Validates table ID and verifies table exists
 * 
 * @param tableIdParam - Table ID from query/body
 * @returns Validated table ID
 * @throws {ValidationError} If tableId is invalid
 * @throws {NotFoundError} If table doesn't exist
 */
export async function validateAndGetTableId(tableIdParam: unknown): Promise<number> {
  const tableId = validateTableId(tableIdParam);
  
  // Verify table exists
  const table = await prisma.pokerTable.findUnique({
    where: { id: tableId },
    select: { id: true },
  });
  
  if (!table) {
    throw new NotFoundError(`No table found with id: ${tableId}`);
  }
  
  return tableId;
}
```

**Refactor Impact**:
- **Files to modify**: `src/index.ts` (4 endpoints)
- **Lines removed**: ~80 lines of duplicated validation
- **Benefits**: Single source of truth for table validation, consistent error messages

---

## 4. BigInt Serialization Helpers (MEDIUM PRIORITY)

### Current Duplication

**Location**: `src/index.ts` (multiple endpoints)

**Pattern**: Converting BigInt to string for JSON responses:
```typescript
// Convert BigInt fields to strings for JSON response
res.status(200).json({
  id: table.id,
  name: table.name,
  minimumBuyIn: table.minimumBuyIn.toString(),
  maximumBuyIn: table.maximumBuyIn.toString(),
  // ... more BigInt fields
});
```

**Also**: Converting string to BigInt in request handlers:
```typescript
const createTableInput: CreateTableInput = {
  name: tableInput.name,
  minimumBuyIn: BigInt(tableInput.minimumBuyIn),
  maximumBuyIn: BigInt(tableInput.maximumBuyIn),
  // ... more BigInt conversions
};
```

### Proposed Solution

**Create**: `src/utils/serialization.ts`

```typescript
/**
 * Utilities for serializing BigInt values in API responses
 */

/**
 * Converts a table object with BigInt fields to a JSON-safe object
 */
export function serializeTable(table: {
  id: number;
  name: string;
  minimumBuyIn: bigint;
  maximumBuyIn: bigint;
  perHandRake: number;
  maxSeatCount: number;
  smallBlind: bigint;
  bigBlind: bigint;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: table.id,
    name: table.name,
    minimumBuyIn: table.minimumBuyIn.toString(),
    maximumBuyIn: table.maximumBuyIn.toString(),
    perHandRake: table.perHandRake,
    maxSeatCount: table.maxSeatCount,
    smallBlind: table.smallBlind.toString(),
    bigBlind: table.bigBlind.toString(),
    isActive: table.isActive,
    createdAt: table.createdAt.toISOString(),
    updatedAt: table.updatedAt.toISOString(),
  };
}

/**
 * Converts a table seat session with BigInt fields to a JSON-safe object
 */
export function serializeTableSeatSession(session: {
  id: number;
  walletAddress: string;
  twitterHandle: string | null;
  twitterAvatarUrl: string | null;
  seatNumber: number;
  joinedAt: Date;
  leftAt: Date | null;
  isActive: boolean;
  tableBalanceGwei: bigint;
}) {
  return {
    id: session.id,
    walletAddress: session.walletAddress,
    twitterHandle: session.twitterHandle,
    twitterAvatarUrl: session.twitterAvatarUrl,
    seatNumber: session.seatNumber,
    joinedAt: session.joinedAt.toISOString(),
    leftAt: session.leftAt?.toISOString() || null,
    isActive: session.isActive,
    tableBalanceGwei: session.tableBalanceGwei.toString(),
  };
}

/**
 * Parses table input with BigInt string fields to CreateTableInput
 */
export function parseTableInput(input: {
  name: string;
  minimumBuyIn: string;
  maximumBuyIn: string;
  perHandRake: number;
  maxSeatCount: number;
  smallBlind: string;
  bigBlind: string;
  isActive?: boolean;
}): {
  name: string;
  minimumBuyIn: bigint;
  maximumBuyIn: bigint;
  perHandRake: number;
  maxSeatCount: number;
  smallBlind: bigint;
  bigBlind: bigint;
  isActive?: boolean;
} {
  return {
    name: input.name,
    minimumBuyIn: BigInt(input.minimumBuyIn),
    maximumBuyIn: BigInt(input.maximumBuyIn),
    perHandRake: input.perHandRake,
    maxSeatCount: input.maxSeatCount,
    smallBlind: BigInt(input.smallBlind),
    bigBlind: BigInt(input.bigBlind),
    isActive: input.isActive,
  };
}
```

**Refactor Impact**:
- **Files to modify**: `src/index.ts` (multiple endpoints)
- **Lines removed**: ~100 lines of duplicated serialization
- **Benefits**: Type-safe serialization, consistent format, easier to maintain

---

## 5. Authentication Middleware Patterns (MEDIUM PRIORITY)

### Current Duplication

**Location**: 
- `src/middleware/adminAuth.ts`
- `src/middleware/walletAuth.ts`
- `src/middleware/twitterAuth.ts`

**Pattern**: All three middleware files have similar structure:
1. Extract token/signature from headers
2. Extract address from body/query/header
3. Validate presence
4. Verify authentication
5. Attach to request object
6. Return error or call next()

### Proposed Solution

**Create**: `src/middleware/baseAuth.ts`

```typescript
/**
 * Base authentication middleware utilities
 * 
 * Provides shared functionality for extracting and validating
 * authentication tokens and addresses from requests.
 */

export interface AuthExtractionOptions {
  addressSource?: 'body' | 'query' | 'header';
  addressHeaderName?: string;
  addressFieldName?: string; // 'adminAddress' vs 'walletAddress'
}

export function extractSignature(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

export function extractAddress(
  req: Request,
  options: AuthExtractionOptions
): string | null {
  const { addressSource = 'query', addressHeaderName, addressFieldName } = options;
  const fieldName = addressFieldName || 'address';
  
  if (addressSource === 'body') {
    return req.body?.[fieldName];
  } else if (addressSource === 'query') {
    return req.query?.[fieldName] as string | undefined;
  } else if (addressSource === 'header') {
    const headerName = addressHeaderName || `X-${fieldName}`;
    const headerValue = req.headers[headerName.toLowerCase()];
    return Array.isArray(headerValue) ? headerValue[0] : headerValue;
  }
  
  return null;
}
```

**Refactor Impact**:
- **Files to modify**: 3 middleware files
- **Lines removed**: ~40 lines of duplicated extraction logic
- **Benefits**: Consistent address extraction, easier to add new auth methods

**Note**: Keep middleware files separate for clarity, but extract shared utilities.

---

## 6. Table Card Component Duplication (LOW PRIORITY)

### Current Duplication

**Location**: 
- `frontend/src/Admin.tsx` (lines 282-321)
- `frontend/src/Play.tsx` (lines 163-211)

**Pattern**: Both render table cards with:
- Table name and status badge
- Buy-in range
- Blinds
- Rake
- Seats
- Action button (different per page)

### Proposed Solution

**Create**: `frontend/src/components/TableCard.tsx`

```typescript
/**
 * Reusable table card component
 * 
 * Displays table information in a card format.
 * Used on both Play and Admin pages.
 */

interface TableCardProps {
  table: PokerTable;
  onAction?: (table: PokerTable) => void;
  actionLabel?: string;
  actionDisabled?: boolean;
  showDetails?: boolean; // Show full details or summary
}

export function TableCard({
  table,
  onAction,
  actionLabel,
  actionDisabled,
  showDetails = true,
}: TableCardProps) {
  // Shared card rendering logic
}
```

**Refactor Impact**:
- **Files to modify**: `Admin.tsx`, `Play.tsx`
- **Lines removed**: ~60 lines of duplicated JSX
- **Benefits**: Consistent table display, easier to update styling, reusable component

---

## 7. Loading/Error/Empty State Patterns (LOW PRIORITY)

### Current Duplication

**Location**: Multiple components
- `Admin.tsx` (tables loading, events loading)
- `Play.tsx` (tables loading)
- `TableSessionsDialog.tsx` (sessions loading)
- Other components with async data

**Pattern**:
```typescript
{isLoading ? (
  <div className="[component]-loading">
    <p>Loading [resource]...</p>
  </div>
) : [resource].length === 0 ? (
  <div className="[component]-empty">
    <p>No [resource] found.</p>
  </div>
) : (
  // Actual content
)}
```

### Proposed Solution

**Create**: `frontend/src/components/AsyncState.tsx`

```typescript
/**
 * Reusable component for handling loading, error, and empty states
 */

interface AsyncStateProps {
  isLoading: boolean;
  error: string | null;
  isEmpty: boolean;
  emptyMessage?: string;
  loadingMessage?: string;
  children: React.ReactNode;
}

export function AsyncState({
  isLoading,
  error,
  isEmpty,
  emptyMessage = 'No items found.',
  loadingMessage = 'Loading...',
  children,
}: AsyncStateProps) {
  if (isLoading) {
    return (
      <div className="async-state-loading">
        <p>{loadingMessage}</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="async-state-error">
        <p>Error: {error}</p>
      </div>
    );
  }
  
  if (isEmpty) {
    return (
      <div className="async-state-empty">
        <p>{emptyMessage}</p>
      </div>
    );
  }
  
  return <>{children}</>;
}
```

**Refactor Impact**:
- **Files to modify**: Multiple components
- **Lines removed**: ~30-40 lines per component
- **Benefits**: Consistent UX, easier to update loading/error styles, reusable pattern

---

## Implementation Priority

### Phase 1: High Priority (Immediate)
1. ✅ Frontend API Client Error Handling
2. ✅ Backend Error Response Formatting

### Phase 2: Medium Priority (Next Sprint)
3. ✅ Table ID Validation
4. ✅ BigInt Serialization Helpers
5. ✅ Authentication Middleware Patterns

### Phase 3: Low Priority (Future)
6. ✅ Table Card Component
7. ✅ Loading/Error/Empty State Patterns

---

## Estimated Impact

### Code Reduction
- **Total lines removed**: ~520 lines of duplicated code
- **New utility files**: ~400 lines (reusable, well-documented)
- **Net reduction**: ~120 lines
- **Maintainability**: Significantly improved

### Benefits
1. **Single Source of Truth**: Changes to error handling, validation, etc. happen in one place
2. **Type Safety**: Centralized utilities enable better TypeScript typing
3. **Consistency**: All endpoints/components use the same patterns
4. **Easier Testing**: Utilities can be unit tested independently
5. **Better Error Messages**: Centralized error handling allows for consistent, user-friendly messages

---

## Risks and Considerations

1. **Breaking Changes**: Refactoring API client may require updating all service calls
   - **Mitigation**: Implement gradually, keep old functions as wrappers initially

2. **Testing**: Need to ensure all refactored code is properly tested
   - **Mitigation**: Add unit tests for new utilities before refactoring

3. **Review Complexity**: Large refactoring PRs are harder to review
   - **Mitigation**: Implement in phases, one priority level at a time

4. **Type Safety**: Need to ensure TypeScript types are preserved
   - **Mitigation**: Use generic types in utilities, maintain strict typing

---

## 8. CSS Duplication (HIGH PRIORITY)

### Current Duplication

**Location**: Multiple CSS files in `frontend/src/components/` and `frontend/src/`

**Patterns Identified**:

#### 8.1 Dialog Overlay Patterns (HIGH)
**Files**: `AddTableDialog.css`, `BuyInDialog.css`, `ConfirmDialog.css`, `DepositDialog.css`, `CashOutDialog.css`, `LoginDialog.css`, `JsonViewerDialog.css`, `TableSessionsDialog.css`

**Duplicated Code** (~150 lines):
```css
/* Repeated in 8+ files */
.[component]-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

#### 8.2 Dialog Content Patterns (HIGH)
**Duplicated Code** (~100 lines):
```css
/* Similar structure across all dialogs */
.[component]-dialog {
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  border: 2px solid #d4af37;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
```

#### 8.3 Dialog Header & Close Button Patterns (MEDIUM)
**Duplicated Code** (~80 lines):
```css
/* Header structure repeated */
.[component]-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px;
  border-bottom: 1px solid rgba(212, 175, 55, 0.3);
}

/* Close button repeated */
.[component]-dialog-close {
  background: none;
  border: none;
  color: #d4af37;
  font-size: 2rem;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s ease;
}
```

#### 8.4 Dialog Button Patterns (MEDIUM)
**Duplicated Code** (~120 lines):
```css
/* Cancel/Submit button patterns repeated */
.[component]-dialog-button-cancel {
  background: rgba(255, 255, 255, 0.1);
  color: #ccc;
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 14px 24px;
  border-radius: 8px;
  /* ... more styles */
}

.[component]-dialog-button-confirm {
  background: linear-gradient(135deg, #d4af37 0%, #f4d03f 100%);
  color: #1a1a1a;
  /* ... more styles */
}
```

#### 8.5 Status Badge Patterns (MEDIUM)
**Files**: `App.css` (admin-table-status, play-table-status), `TableSessionsDialog.css`

**Duplicated Code** (~40 lines):
```css
/* Active/Inactive badges repeated */
.[component]-status.active {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.[component]-status.inactive {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
}
```

#### 8.6 Table Card Patterns (LOW)
**Files**: `App.css` (admin-table-card, play-table-card)

**Duplicated Code** (~60 lines):
```css
/* Very similar card styles */
.[component]-table-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 20px;
  transition: all 0.3s linear;
}

.[component]-table-card:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
```

#### 8.7 Form Input Patterns (MEDIUM)
**Duplicated Code** (~50 lines):
```css
/* Similar input styles across dialogs */
.[component]-input {
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #ffffff;
  transition: all 0.3s linear;
}

.[component]-input:focus {
  outline: none;
  border-color: #d4af37;
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.2);
}
```

#### 8.8 Slider Patterns (MEDIUM)
**Files**: `BuyInDialog.css`, `DepositDialog.css`, `CashOutDialog.css`

**Duplicated Code** (~80 lines):
```css
/* Slider styles repeated */
.[component]-slider {
  width: 100%;
  height: 8px;
  border-radius: 4px;
  background: rgba(212, 175, 55, 0.2);
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}

.[component]-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: linear-gradient(135deg, #d4af37 0%, #f4d03f 100%);
  /* ... more styles */
}
```

### Proposed Solution

**Create**: `frontend/src/styles/dialog.css` (Base dialog styles)

```css
/**
 * Base dialog component styles
 * 
 * Provides reusable styles for all dialog components.
 * Components can extend these base styles with component-specific overrides.
 */

/* Dialog Overlay */
.dialog-overlay-base {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: dialogFadeIn 0.2s ease-out;
}

@keyframes dialogFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Dialog Content */
.dialog-content-base {
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  border: 2px solid #d4af37;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(212, 175, 55, 0.2);
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
  animation: dialogSlideUp 0.3s ease-out;
  position: relative;
}

@keyframes dialogSlideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

/* Dialog Header */
.dialog-header-base {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 24px 20px;
  border-bottom: 1px solid rgba(212, 175, 55, 0.3);
}

.dialog-title-base {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 700;
  color: #d4af37;
  text-transform: uppercase;
  letter-spacing: 1px;
}

/* Dialog Close Button */
.dialog-close-base {
  background: none;
  border: none;
  color: #d4af37;
  font-size: 2rem;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.dialog-close-base:hover:not(:disabled) {
  background: rgba(212, 175, 55, 0.1);
  transform: scale(1.1);
}

.dialog-close-base:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Dialog Buttons */
.dialog-button-base {
  padding: 14px 24px;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.dialog-button-cancel-base {
  background: rgba(255, 255, 255, 0.1);
  color: #ccc;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.dialog-button-cancel-base:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
}

.dialog-button-confirm-base {
  background: linear-gradient(135deg, #d4af37 0%, #f4d03f 100%);
  color: #1a1a1a;
  box-shadow: 0 4px 12px rgba(212, 175, 55, 0.4);
}

.dialog-button-confirm-base:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(212, 175, 55, 0.6);
}

.dialog-button-base:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none !important;
}
```

**Create**: `frontend/src/styles/status-badges.css`

```css
/**
 * Status badge component styles
 * 
 * Reusable active/inactive status badges
 */

.status-badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 0.875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.status-badge.active {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.status-badge.inactive {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
}
```

**Create**: `frontend/src/styles/form-inputs.css`

```css
/**
 * Form input component styles
 * 
 * Reusable form input styles
 */

.form-input-base {
  padding: 12px 16px;
  font-size: 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #ffffff;
  font-family: inherit;
  transition: all 0.3s linear;
}

.form-input-base:focus {
  outline: none;
  border-color: #d4af37;
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.2);
}

.form-input-base:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.form-input-error {
  border-color: #ef4444;
}

.form-input-error:focus {
  border-color: #ef4444;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
}
```

**Create**: `frontend/src/styles/slider.css`

```css
/**
 * Slider component styles
 * 
 * Reusable range slider styles
 */

.slider-base {
  width: 100%;
  height: 8px;
  border-radius: 4px;
  background: rgba(212, 175, 55, 0.2);
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
}

.slider-base::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: linear-gradient(135deg, #d4af37 0%, #f4d03f 100%);
  border: 2px solid #1a1a1a;
  box-shadow: 0 2px 8px rgba(212, 175, 55, 0.5);
  cursor: pointer;
  transition: all 0.2s ease;
}

.slider-base::-webkit-slider-thumb:hover {
  transform: scale(1.15);
  box-shadow: 0 4px 12px rgba(212, 175, 55, 0.7);
}

.slider-base::-moz-range-thumb {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: linear-gradient(135deg, #d4af37 0%, #f4d03f 100%);
  border: 2px solid #1a1a1a;
  box-shadow: 0 2px 8px rgba(212, 175, 55, 0.5);
  cursor: pointer;
  transition: all 0.2s ease;
}

.slider-base::-moz-range-thumb:hover {
  transform: scale(1.15);
  box-shadow: 0 4px 12px rgba(212, 175, 55, 0.7);
}

.slider-base:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

**Refactor Impact**:
- **Files to modify**: 8+ dialog CSS files, `App.css`
- **Lines removed**: ~620 lines of duplicated CSS
- **New utility CSS**: ~300 lines (reusable, well-organized)
- **Net reduction**: ~320 lines
- **Benefits**: 
  - Consistent dialog styling across the app
  - Easier to update global dialog styles
  - Reduced CSS bundle size
  - Better maintainability

### Implementation Strategy

1. **Create base CSS files** in `frontend/src/styles/`
2. **Update components** to use base classes + component-specific overrides
3. **Use CSS composition** pattern: `className="dialog-overlay-base buy-in-dialog-overlay"`
4. **Gradually migrate** one dialog at a time to avoid breaking changes

---

## Updated Implementation Priority

### Phase 1: High Priority (Immediate)
1. ✅ Frontend API Client Error Handling
2. ✅ Backend Error Response Formatting
3. ✅ **CSS Dialog Patterns** (NEW)

### Phase 2: Medium Priority (Next Sprint)
4. ✅ Table ID Validation
5. ✅ BigInt Serialization Helpers
6. ✅ Authentication Middleware Patterns
7. ✅ **CSS Status Badges & Form Inputs** (NEW)

### Phase 3: Low Priority (Future)
8. ✅ Table Card Component
9. ✅ Loading/Error/Empty State Patterns
10. ✅ **CSS Table Cards & Sliders** (NEW)

---

## Updated Estimated Impact

### Code Reduction
- **Total lines removed**: ~1,140 lines of duplicated code (520 JS/TS + 620 CSS)
- **New utility code**: ~700 lines (400 JS/TS + 300 CSS)
- **Net reduction**: ~440 lines
- **Maintainability**: Significantly improved

### Benefits
1. **Single Source of Truth**: Changes to error handling, validation, styling happen in one place
2. **Type Safety**: Centralized utilities enable better TypeScript typing
3. **Consistency**: All endpoints/components/dialogs use the same patterns
4. **Easier Testing**: Utilities can be unit tested independently
5. **Better Error Messages**: Centralized error handling allows for consistent, user-friendly messages
6. **Smaller CSS Bundle**: Reduced duplication means smaller file sizes
7. **Easier Theming**: Base CSS classes make theme changes simpler

---

## Notes

- This plan focuses on **code duplication**, not architectural changes
- All refactoring should maintain **backward compatibility** where possible
- Each refactoring should be **independently testable**
- Consider adding **JSDoc comments** to all new utilities for better IDE support
- **CSS refactoring** should use composition pattern (base classes + overrides) rather than inheritance
- Consider using **CSS custom properties (variables)** for colors and spacing to further reduce duplication

