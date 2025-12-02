/**
 * Event Queue for Sequential Event Processing
 *
 * This module provides an EventQueue class that ensures events are processed
 * sequentially, one at a time, even if they arrive out of order or in bursts.
 * This is critical for smooth animations and preventing race conditions.
 *
 * Features:
 * - Maintains ordered queue by eventId
 * - Processes one event at a time
 * - Waits for async handlers to complete before processing next event
 * - Handles out-of-order events (inserts in correct position)
 * - Error handling (logs errors, continues processing)
 * - Queue clearing for cleanup
 */

/**
 * Table event structure
 *
 * Represents an event received from the SSE stream.
 * The payload is parsed from the JSON string sent by the server.
 */
export interface TableEvent {
  /**
   * Event ID - unique identifier for ordering events
   */
  eventId: number;

  /**
   * Parsed event payload
   * The structure varies by event kind (hand_start, bet, hand_end, etc.)
   */
  payload: {
    kind: string;
    [key: string]: unknown;
  };
}

/**
 * Event handler function type
 *
 * Called for each event in the queue. Must be async or return a Promise.
 * If the handler throws an error, it will be logged and processing will continue.
 *
 * @param event - The event to process
 * @returns Promise that resolves when processing is complete
 */
export type EventHandler = (event: TableEvent) => Promise<void> | void;

/**
 * Event Queue for sequential event processing
 *
 * Ensures events are processed in order by eventId, one at a time.
 * If events arrive out of order, they are inserted in the correct position.
 * Processing waits for each handler to complete before moving to the next event.
 */
export class EventQueue {
  /**
   * Ordered queue of events (sorted by eventId ascending)
   */
  private queue: TableEvent[] = [];

  /**
   * Whether the queue is currently processing events
   */
  private processing = false;

  /**
   * The event handler function to call for each event
   */
  private handler: EventHandler;

  /**
   * The last processed event ID
   * Used to detect duplicate or out-of-order events
   */
  private lastProcessedEventId = 0;

  /**
   * Whether the queue has been stopped (for cleanup)
   */
  private stopped = false;

  /**
   * Creates a new EventQueue instance
   *
   * @param handler - Function to call for each event (must be async or return Promise)
   */
  constructor(handler: EventHandler) {
    this.handler = handler;
  }

  /**
   * Enqueues an event for processing
   *
   * If the event is out of order, it will be inserted in the correct position.
   * Processing will start automatically if not already running.
   *
   * @param event - The event to enqueue
   */
  async enqueue(event: TableEvent): Promise<void> {
    if (this.stopped) {
      console.warn('[EventQueue] Ignoring event - queue has been stopped', event.eventId);
      return;
    }

    // Ignore duplicate events (events we've already processed)
    if (event.eventId <= this.lastProcessedEventId) {
      console.warn(
        `[EventQueue] Ignoring duplicate/old event ${event.eventId} (last processed: ${this.lastProcessedEventId})`
      );
      return;
    }

    // Insert event in correct position (sorted by eventId)
    this.insertInOrder(event);

    // Start processing if not already processing
    if (!this.processing) {
      this.processQueue().catch((error) => {
        console.error('[EventQueue] Error in processQueue:', error);
      });
    }
  }

  /**
   * Inserts an event in the correct position in the queue (sorted by eventId)
   *
   * Uses binary search for efficient insertion.
   *
   * @param event - The event to insert
   */
  private insertInOrder(event: TableEvent): void {
    // Binary search to find insertion point
    let left = 0;
    let right = this.queue.length;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (this.queue[mid].eventId < event.eventId) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    // Insert at the found position
    this.queue.splice(left, 0, event);
  }

  /**
   * Processes events in the queue sequentially
   *
   * Processes one event at a time, waiting for each handler to complete
   * before moving to the next event. Continues until the queue is empty.
   * Handles errors gracefully (logs and continues).
   */
  private async processQueue(): Promise<void> {
    if (this.processing) {
      return; // Already processing
    }

    this.processing = true;

    try {
      while (this.queue.length > 0 && !this.stopped) {
        // Get the next event (first in queue, lowest eventId)
        const event = this.queue.shift();
        if (!event) {
          break;
        }

        // Skip if we've already processed this event (shouldn't happen, but safety check)
        if (event.eventId <= this.lastProcessedEventId) {
          console.warn(
            `[EventQueue] Skipping already processed event ${event.eventId} (last processed: ${this.lastProcessedEventId})`
          );
          continue;
        }

        try {
          // Process the event (wait for handler to complete)
          await this.handler(event);

          // Update last processed event ID
          this.lastProcessedEventId = event.eventId;
        } catch (error) {
          // Log error but continue processing
          console.error(`[EventQueue] Error processing event ${event.eventId}:`, error);
          // Still update lastProcessedEventId to prevent reprocessing
          this.lastProcessedEventId = event.eventId;
        }
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Clears the queue and stops processing
   *
   * Used for cleanup when unmounting components or disconnecting.
   * After calling this, the queue will ignore new events.
   */
  clear(): void {
    this.stopped = true;
    this.queue = [];
    this.processing = false;
  }

  /**
   * Gets the current queue size
   *
   * @returns Number of events waiting to be processed
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Gets the last processed event ID
   *
   * @returns The eventId of the last processed event, or 0 if none processed
   */
  getLastProcessedEventId(): number {
    return this.lastProcessedEventId;
  }

  /**
   * Checks if the queue is currently processing events
   *
   * @returns True if processing, false otherwise
   */
  isProcessing(): boolean {
    return this.processing;
  }
}

