import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../../src/core/eventBus.js";
import type { AgentEvent } from "../../src/core/types.js";

function makeEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    type: "working",
    agent: "claude-code",
    command: "npm test",
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("EventBus", () => {
  it("dispatches events to subscribers", () => {
    const bus = new EventBus();
    const received: AgentEvent[] = [];

    bus.subscribe((event) => received.push(event));

    const event = makeEvent();
    bus.emit(event);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(event);
  });

  it("dispatches events to multiple subscribers", () => {
    const bus = new EventBus();
    const received1: AgentEvent[] = [];
    const received2: AgentEvent[] = [];

    bus.subscribe((event) => received1.push(event));
    bus.subscribe((event) => received2.push(event));

    const event = makeEvent();
    bus.emit(event);

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
    expect(received1[0]).toEqual(event);
    expect(received2[0]).toEqual(event);
  });

  it("drops duplicate events and returns false", () => {
    const bus = new EventBus(2000);
    const received: AgentEvent[] = [];

    bus.subscribe((event) => received.push(event));

    const now = Date.now();
    bus.emit(makeEvent({ timestamp: now }));
    const dispatched = bus.emit(makeEvent({ timestamp: now + 500 }));

    expect(dispatched).toBe(false);
    expect(received).toHaveLength(1);
  });

  it("returns true when event is dispatched", () => {
    const bus = new EventBus();
    const event = makeEvent();

    const result = bus.emit(event);

    expect(result).toBe(true);
  });

  it("tracks processed and deduplicated counts", () => {
    const bus = new EventBus(2000);
    const now = Date.now();

    bus.emit(makeEvent({ command: "cmd1", timestamp: now }));
    bus.emit(makeEvent({ command: "cmd1", timestamp: now + 100 })); // duplicate
    bus.emit(makeEvent({ command: "cmd2", timestamp: now + 200 }));

    expect(bus.processedCount).toBe(2);
    expect(bus.deduplicatedCount).toBe(1);
  });

  it("unsubscribe removes the subscriber", () => {
    const bus = new EventBus();
    const received: AgentEvent[] = [];

    const unsubscribe = bus.subscribe((event) => received.push(event));

    bus.emit(makeEvent({ command: "before-unsub", timestamp: Date.now() }));
    expect(received).toHaveLength(1);

    unsubscribe();

    bus.emit(makeEvent({ command: "after-unsub", timestamp: Date.now() + 5000 }));
    expect(received).toHaveLength(1); // no new event
    expect(bus.subscriberCount).toBe(0);
  });

  it("subscriber errors do not crash the bus or block other subscribers", () => {
    const bus = new EventBus();
    const received: AgentEvent[] = [];
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    bus.subscribe(() => {
      throw new Error("subscriber exploded");
    });
    bus.subscribe((event) => received.push(event));

    const event = makeEvent();
    expect(() => bus.emit(event)).not.toThrow();
    expect(received).toHaveLength(1);
    expect(consoleSpy).toHaveBeenCalledOnce();

    consoleSpy.mockRestore();
  });

  it("reset() clears all state", () => {
    const bus = new EventBus();
    const received: AgentEvent[] = [];

    bus.subscribe((event) => received.push(event));
    bus.emit(makeEvent({ timestamp: Date.now() }));

    expect(bus.processedCount).toBe(1);
    expect(bus.subscriberCount).toBe(1);

    bus.reset();

    expect(bus.processedCount).toBe(0);
    expect(bus.deduplicatedCount).toBe(0);
    expect(bus.subscriberCount).toBe(0);
  });
});
