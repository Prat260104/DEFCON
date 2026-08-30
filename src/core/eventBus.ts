import type { AgentEvent, EventSubscriber } from "./types.js";
import { DedupeBuffer } from "./dedupe.js";

/**
 * Central event bus that normalizes, deduplicates, and dispatches agent events.
 *
 * All adapters emit events through the bus; all consumers (notification, storage,
 * policy engine) subscribe to it. The bus is the single point where deduplication
 * happens — neither adapters nor subscribers need to worry about duplicates.
 */
export class EventBus {
  private subscribers: EventSubscriber[] = [];
  private dedupe: DedupeBuffer;
  private eventCount = 0;
  private droppedCount = 0;

  constructor(dedupeWindowMs?: number, dedupeMaxSize?: number) {
    this.dedupe = new DedupeBuffer(dedupeMaxSize, dedupeWindowMs);
  }

  /**
   * Emit an event through the bus. Deduplicates first, then notifies
   * all subscribers if the event passes through.
   *
   * Returns true if the event was dispatched, false if it was dropped as duplicate.
   */
  emit(event: AgentEvent): boolean {
    if (this.dedupe.shouldDrop(event)) {
      this.droppedCount++;
      return false;
    }

    this.eventCount++;

    for (const subscriber of this.subscribers) {
      try {
        subscriber(event);
      } catch (error) {
        // Subscriber errors must never crash the bus.
        // Log but continue dispatching to other subscribers.
        console.error("[EventBus] Subscriber error:", error);
      }
    }

    return true;
  }

  /**
   * Subscribe to receive events that pass deduplication.
   * Returns an unsubscribe function.
   */
  subscribe(callback: EventSubscriber): () => void {
    this.subscribers.push(callback);

    return () => {
      const index = this.subscribers.indexOf(callback);
      if (index !== -1) {
        this.subscribers.splice(index, 1);
      }
    };
  }

  /** Number of events that passed through the bus. */
  get processedCount(): number {
    return this.eventCount;
  }

  /** Number of events dropped by deduplication. */
  get deduplicatedCount(): number {
    return this.droppedCount;
  }

  /** Number of active subscribers. */
  get subscriberCount(): number {
    return this.subscribers.length;
  }

  /** Reset all state — mostly useful for testing. */
  reset(): void {
    this.subscribers = [];
    this.dedupe.clear();
    this.eventCount = 0;
    this.droppedCount = 0;
  }
}
