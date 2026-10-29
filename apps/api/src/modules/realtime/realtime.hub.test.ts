import { EventEmitter } from "node:events";
import type { Redis } from "ioredis";
import { describe, expect, it, vi } from "vitest";
import { createRealtimeHub, parseVaultEvent, vaultChannel } from "./realtime.hub";

/** Just enough of an ioredis subscriber connection. */
class FakeSubscriber extends EventEmitter {
  readonly calls: string[] = [];
  subscribe = vi.fn(async (channel: string) => {
    this.calls.push(`sub ${channel}`);
  });
  unsubscribe = vi.fn(async (channel: string) => {
    this.calls.push(`unsub ${channel}`);
  });
  disconnect = vi.fn();
}

function setup() {
  const subscriber = new FakeSubscriber();
  const publish = vi.fn(async () => 1);
  const createSubscriber = vi.fn(() => subscriber as unknown as Redis);
  const onError = vi.fn();
  const hub = createRealtimeHub({
    publisher: { publish } as unknown as Redis,
    createSubscriber,
    onError,
  });
  return { hub, subscriber, publish, createSubscriber, onError };
}

describe("parseVaultEvent", () => {
  it("accepts only a non-negative integer revision", () => {
    expect(parseVaultEvent('{"revision":7}')).toEqual({ revision: 7 });
    expect(parseVaultEvent('{"revision":7,"extra":"x"}')).toEqual({ revision: 7 });
    expect(parseVaultEvent('{"revision":-1}')).toBeNull();
    expect(parseVaultEvent('{"revision":"7"}')).toBeNull();
    expect(parseVaultEvent("null")).toBeNull();
    expect(parseVaultEvent("not json")).toBeNull();
  });
});

describe("realtime hub", () => {
  it("publishes only the revision on the user's channel", () => {
    const { hub, publish, createSubscriber } = setup();
    hub.vaultChanged("u1", 42);
    expect(publish).toHaveBeenCalledWith(vaultChannel("u1"), '{"revision":42}');
    // Publishing never opens the subscriber connection (the worker only publishes).
    expect(createSubscriber).not.toHaveBeenCalled();
  });

  it("reports a failed publish instead of throwing", async () => {
    const { hub, publish, onError } = setup();
    publish.mockRejectedValueOnce(new Error("down"));
    hub.vaultChanged("u1", 1);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
  });

  it("subscribes once per user and fans messages out to every listener", async () => {
    const { hub, subscriber } = setup();
    const a = vi.fn();
    const b = vi.fn();
    const other = vi.fn();
    await hub.subscribeVault("u1", a);
    await hub.subscribeVault("u1", b);
    await hub.subscribeVault("u2", other);
    expect(subscriber.subscribe).toHaveBeenCalledTimes(2);

    subscriber.emit("message", vaultChannel("u1"), '{"revision":3}');
    expect(a).toHaveBeenCalledWith({ revision: 3 });
    expect(b).toHaveBeenCalledWith({ revision: 3 });
    expect(other).not.toHaveBeenCalled();
  });

  it("ignores malformed messages and unknown channels", async () => {
    const { hub, subscriber } = setup();
    const listener = vi.fn();
    await hub.subscribeVault("u1", listener);
    subscriber.emit("message", vaultChannel("u1"), "garbage");
    subscriber.emit("message", vaultChannel("u9"), '{"revision":1}');
    expect(listener).not.toHaveBeenCalled();
  });

  it("unsubscribes from Redis when the last listener leaves", async () => {
    const { hub, subscriber } = setup();
    const offA = await hub.subscribeVault("u1", vi.fn());
    const offB = await hub.subscribeVault("u1", vi.fn());
    offA();
    expect(subscriber.unsubscribe).not.toHaveBeenCalled();
    offB();
    offB(); // idempotent
    expect(subscriber.unsubscribe).toHaveBeenCalledOnce();
    expect(hub.channelCount()).toBe(0);

    await hub.subscribeVault("u1", vi.fn());
    expect(subscriber.calls).toEqual([
      `sub ${vaultChannel("u1")}`,
      `unsub ${vaultChannel("u1")}`,
      `sub ${vaultChannel("u1")}`,
    ]);
  });

  it("a failed SUBSCRIBE rejects and the next stream retries", async () => {
    const { hub, subscriber } = setup();
    subscriber.subscribe.mockRejectedValueOnce(new Error("down"));
    await expect(hub.subscribeVault("u1", vi.fn())).rejects.toThrow("down");
    expect(hub.channelCount()).toBe(0);
    await hub.subscribeVault("u1", vi.fn());
    expect(subscriber.subscribe).toHaveBeenCalledTimes(2);
  });
});
