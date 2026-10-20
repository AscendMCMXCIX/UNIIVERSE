/*
  Keeps the number of queries in flight at or below the pool size.

  postgres-js opens up to `max` connections and, when every one is busy, pipelines further
  queries onto busy connections (a second query is written before the first has answered).
  Through Supabase's transaction pooler those pipelined queries never answered: on the Vercel
  deployment every burst of more queries than connections hung (perf-probe, 2026-10-13, see
  docs/PERFORMANCE.md). With this gate a query waits for a free slot instead, which is what the
  pool would do anyway; nothing else about the query changes. A transaction holds one slot for
  its whole duration, since it reserves a connection.
*/

import { egressFlushDue, flushEgress, recordQuery } from "./egress";

type Thenable<T> = { then: Promise<T>["then"] };

interface PendingLike {
  then: Promise<unknown>["then"];
  values?: () => Promise<unknown>;
  raw?: () => Promise<unknown>;
  execute?: () => Promise<unknown>;
}

export interface GateStats {
  active: number;
  waiting: number;
  limit: number;
}

/** A client whose `unsafe` and `begin` go through the gate; everything else is the client itself. */
export function gateConcurrency<T extends object>(
  client: T,
  limit: number,
): T & { gate: () => GateStats } {
  let active = 0;
  const waiting: Array<() => void> = [];
  const acquire = () =>
    new Promise<void>((resolve) => {
      if (active < limit) {
        active += 1;
        resolve();
      } else {
        waiting.push(() => {
          active += 1;
          resolve();
        });
      }
    });
  const release = () => {
    active -= 1;
    const next = waiting.shift();
    if (next) next();
  };
  const target = client as unknown as {
    unsafe: (...args: unknown[]) => PendingLike;
    begin: (...args: unknown[]) => Promise<unknown>;
  };

  const unsafe = (...args: unknown[]) => {
    // Lazy: nothing is sent until the caller awaits it or asks for a result shape, exactly as
    // postgres-js's own pending query behaves; the slot is held from send to answer.
    const run = async <R>(
      f: (q: PendingLike) => Promise<R> | Thenable<R>,
      shape: ResultShape = "rows",
    ): Promise<R> => {
      await acquire();
      try {
        const result = await f(target.unsafe(...args));
        // Egress accounting (db/egress.ts): the size this result had on the wire.
        if (shape !== "query") recordQuery(args[0] as string, result, { raw: shape === "raw" });
        return result;
      } finally {
        release();
        if (egressFlushDue()) void flushEgress((query, params) => unsafe(query, params) as unknown as PromiseLike<unknown>);
      }
    };
    const plain = () => run((q) => q as unknown as Thenable<unknown>);
    const pending = {
      then: (
        onFulfilled?: ((v: unknown) => unknown) | null,
        onRejected?: ((e: unknown) => unknown) | null,
      ) => plain().then(onFulfilled, onRejected),
      catch: (onRejected?: ((e: unknown) => unknown) | null) =>
        plain().catch(onRejected),
      finally: (onFinally?: (() => void) | null) => plain().finally(onFinally),
      values: () =>
        run((q) =>
          q.values ? q.values() : (q as unknown as Thenable<unknown>),
        ),
      raw: () =>
        run((q) => (q.raw ? q.raw() : (q as unknown as Thenable<unknown>)), "raw"),
      execute: () =>
        run(
          (q) => (q.execute ? q.execute() : (q as unknown as Thenable<unknown>)),
          "query",
        ),
    };
    return pending;
  };

  const begin = async (...args: unknown[]) => {
    await acquire();
    try {
      // The transaction's own client is counted too (its queries do not pass through `unsafe`).
      const last = args.length - 1;
      const fn = args[last];
      if (typeof fn === "function") args[last] = (tx: object) => (fn as (t: object) => unknown)(countingClient(tx));
      return await target.begin(...args);
    } finally {
      release();
    }
  };

  const gate = (): GateStats => ({ active, waiting: waiting.length, limit });

  return new Proxy(client, {
    get(obj, prop, receiver) {
      if (prop === "unsafe") return unsafe;
      if (prop === "begin") return begin;
      if (prop === "gate") return gate;
      const value = Reflect.get(obj, prop, receiver);
      return typeof value === "function"
        ? (value as (...a: unknown[]) => unknown).bind(obj)
        : value;
    },
  }) as T & { gate: () => GateStats };
}

type ResultShape = "rows" | "raw" | "query";

/**
 * A transaction client whose queries are counted for egress (db/egress.ts). Only `unsafe` (what
 * drizzle calls) and `savepoint` (nested transactions) are wrapped; everything else is the client.
 */
function countingClient(tx: object): object {
  const t = tx as { unsafe: (...a: unknown[]) => PendingLike; savepoint?: (...a: unknown[]) => Promise<unknown> };
  const unsafe = (...args: unknown[]) => {
    const q = t.unsafe(...args);
    const counted = <R>(p: PromiseLike<R>, raw = false): Promise<R> =>
      Promise.resolve(p).then((result) => {
        recordQuery(args[0] as string, result, { raw });
        return result;
      });
    return {
      then: (onFulfilled?: ((v: unknown) => unknown) | null, onRejected?: ((e: unknown) => unknown) | null) => counted(q as unknown as PromiseLike<unknown>).then(onFulfilled, onRejected),
      catch: (onRejected?: ((e: unknown) => unknown) | null) => counted(q as unknown as PromiseLike<unknown>).catch(onRejected),
      finally: (onFinally?: (() => void) | null) => counted(q as unknown as PromiseLike<unknown>).finally(onFinally),
      values: () => counted((q.values ? q.values() : q) as PromiseLike<unknown>),
      raw: () => counted((q.raw ? q.raw() : q) as PromiseLike<unknown>, true),
      execute: () => (q.execute ? q.execute() : q),
    };
  };
  return new Proxy(tx, {
    get(obj, prop, receiver) {
      if (prop === "unsafe") return unsafe;
      if (prop === "savepoint" && typeof t.savepoint === "function")
        return (...args: unknown[]) => {
          const last = args.length - 1;
          const fn = args[last];
          if (typeof fn === "function") args[last] = (sp: object) => (fn as (s: object) => unknown)(countingClient(sp));
          return t.savepoint!(...args);
        };
      const value = Reflect.get(obj, prop, receiver);
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(obj) : value;
    },
  });
}
