import { describe, it, expect } from "vitest";
import { isDuplicate, DedupeBuffer } from "../../src/core/dedupe.js";
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

describe("isDuplicate", () => {
  it("returns true for identical event within time window", () => {
    const now = Date.now();
    const event1 = makeEvent({ timestamp: now });
    const event2 = makeEvent({ timestamp: now + 500 });

    const recent = [
      { agent: event1.agent, type: event1.type, command: event1.command, timestamp: event1.timestamp },
    ];

    expect(isDuplicate(event2, recent, 2000)).toBe(true);
  });

  it("returns false for identical event after time window expires", () => {
    const now = Date.now();
    const event1 = makeEvent({ timestamp: now });
    const event2 = makeEvent({ timestamp: now + 3000 });

    const recent = [
      { agent: event1.agent, type: event1.type, command: event1.command, timestamp: event1.timestamp },
    ];

    expect(isDuplicate(event2, recent, 2000)).toBe(false);
  });

  it("returns false for events with different commands", () => {
    const now = Date.now();
    const event1 = makeEvent({ command: "npm test", timestamp: now });
    const event2 = makeEvent({ command: "npm build", timestamp: now + 500 });

    const recent = [
      { agent: event1.agent, type: event1.type, command: event1.command, timestamp: event1.timestamp },
    ];

    expect(isDuplicate(event2, recent, 2000)).toBe(false);
  });

  it("returns false for events with different agents", () => {
    const now = Date.now();
    const event1 = makeEvent({ agent: "claude-code", timestamp: now });
    const event2 = makeEvent({ agent: "gemini-cli", timestamp: now + 500 });

    const recent = [
      { agent: event1.agent, type: event1.type, command: event1.command, timestamp: event1.timestamp },
    ];

    expect(isDuplicate(event2, recent, 2000)).toBe(false);
  });

  it("returns false for events with different types", () => {
    const now = Date.now();
    const event1 = makeEvent({ type: "working", timestamp: now });
    const event2 = makeEvent({ type: "permission_required", timestamp: now + 500 });

    const recent = [
      { agent: event1.agent, type: event1.type, command: event1.command, timestamp: event1.timestamp },
    ];

    expect(isDuplicate(event2, recent, 2000)).toBe(false);
  });

  it("returns false when recentEvents is empty", () => {
    const event = makeEvent();
    expect(isDuplicate(event, [], 2000)).toBe(false);
  });

  it("handles events with undefined command correctly", () => {
    const now = Date.now();
    const event1 = makeEvent({ command: undefined, timestamp: now });
    const event2 = makeEvent({ command: undefined, timestamp: now + 500 });

    const recent = [
      { agent: event1.agent, type: event1.type, command: event1.command, timestamp: event1.timestamp },
    ];

    expect(isDuplicate(event2, recent, 2000)).toBe(true);
  });
});

describe("DedupeBuffer", () => {
  it("drops duplicate events within window", () => {
    const buffer = new DedupeBuffer(50, 2000);
    const now = Date.now();

    const event1 = makeEvent({ timestamp: now });
    const event2 = makeEvent({ timestamp: now + 500 });

    expect(buffer.shouldDrop(event1)).toBe(false);
    expect(buffer.shouldDrop(event2)).toBe(true);
  });

  it("passes through identical events after window expires", () => {
    const buffer = new DedupeBuffer(50, 2000);
    const now = Date.now();

    const event1 = makeEvent({ timestamp: now });
    const event2 = makeEvent({ timestamp: now + 3000 });

    expect(buffer.shouldDrop(event1)).toBe(false);
    expect(buffer.shouldDrop(event2)).toBe(false);
  });

  it("passes through events with different commands", () => {
    const buffer = new DedupeBuffer(50, 2000);
    const now = Date.now();

    const event1 = makeEvent({ command: "npm test", timestamp: now });
    const event2 = makeEvent({ command: "npm build", timestamp: now + 100 });

    expect(buffer.shouldDrop(event1)).toBe(false);
    expect(buffer.shouldDrop(event2)).toBe(false);
  });

  it("respects max buffer size and drops oldest entries", () => {
    const buffer = new DedupeBuffer(3, 2000);
    const now = Date.now();

    // Fill buffer with 3 different events
    buffer.shouldDrop(makeEvent({ command: "cmd1", timestamp: now }));
    buffer.shouldDrop(makeEvent({ command: "cmd2", timestamp: now + 10 }));
    buffer.shouldDrop(makeEvent({ command: "cmd3", timestamp: now + 20 }));

    expect(buffer.size).toBe(3);

    // Add a 4th — should trim the oldest (cmd1)
    buffer.shouldDrop(makeEvent({ command: "cmd4", timestamp: now + 30 }));

    expect(buffer.size).toBe(3);

    // cmd1 was evicted, so it should pass through again
    expect(buffer.shouldDrop(makeEvent({ command: "cmd1", timestamp: now + 40 }))).toBe(false);
  });

  it("clear() empties the buffer", () => {
    const buffer = new DedupeBuffer(50, 2000);
    const now = Date.now();

    buffer.shouldDrop(makeEvent({ timestamp: now }));
    expect(buffer.size).toBe(1);

    buffer.clear();
    expect(buffer.size).toBe(0);

    // Same event should now pass through
    expect(buffer.shouldDrop(makeEvent({ timestamp: now + 100 }))).toBe(false);
  });
});
