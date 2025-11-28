/**
 * Centralized error handling utilities for Express endpoints
 *
 * Provides consistent error response formatting and custom error types
 * for better error handling across the application.
 */

import { Response } from 'express';

/**
 * API error response structure
 */
export interface ApiError {
  error: string;
  message: string;
}

/**
 * Custom application error class
 *
 * Extends Error with status code and optional error code for better
 * error handling and HTTP response mapping.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly errorCode?: string
  ) {
    super(message);
    this.name = 'AppError';
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}

/**
 * Validation error class
 *
 * Used for input validation errors (400 status code)
 */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'ValidationError');
    this.name = 'ValidationError';
  }
}

/**
 * Not found error class
 *
 * Used for resource not found errors (404 status code)
 */
export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, 'NotFoundError');
    this.name = 'NotFoundError';
  }
}

/**
 * Conflict error class
 *
 * Used for conflict errors (409 status code)
 */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'ConflictError');
    this.name = 'ConflictError';
  }
}

/**
 * Unauthorized error class
 *
 * Used for authentication/authorization errors (401 status code)
 */
export class UnauthorizedError extends AppError {
  constructor(message: string) {
    super(message, 401, 'UnauthorizedError');
    this.name = 'UnauthorizedError';
  }
}

/**
 * Converts an unknown error to an ApiError structure
 *
 * @param error - The error to convert (can be AppError, Error, or unknown)
 * @param defaultMessage - Default message if error doesn't have a message
 * @returns ApiError structure for JSON response
 */
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

/**
 * Sends an error response using Express response object
 *
 * Handles different error types and maps them to appropriate HTTP status codes.
 * Logs the error to console for debugging.
 *
 * @param res - Express response object
 * @param error - The error to handle (can be AppError, Error, or unknown)
 * @param defaultMessage - Default error message if error doesn't have one
 * @param defaultStatusCode - Default status code if error doesn't specify one
 *
 * @example
 * ```typescript
 * try {
 *   await someOperation();
 * } catch (error) {
 *   sendErrorResponse(res, error, 'Failed to perform operation');
 * }
 * ```
 */
export function sendErrorResponse(
  res: Response,
  error: unknown,
  defaultMessage: string,
  defaultStatusCode: number = 500
): void {
  // Log error for debugging
  console.error('Error:', error);

  // Determine status code
  let statusCode = defaultStatusCode;
  if (error instanceof AppError) {
    statusCode = error.statusCode;
  }

  // Convert to API error format
  const apiError = handleError(error, defaultMessage);

  // Send response
  res.status(statusCode).json(apiError);
}

