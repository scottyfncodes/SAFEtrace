/** Minimal typed event bus. The only channel from sim to ui/audio. */

export type Listener<T> = (payload: T) => void;

export class EventBus<Events extends Record<string, unknown>> {
  private map = new Map<keyof Events, Set<Listener<never>>>();
  private queue: Array<{ type: keyof Events; payload: unknown }> = [];

  on<K extends keyof Events>(type: K, fn: Listener<Events[K]>): () => void {
    let set = this.map.get(type);
    if (!set) { set = new Set(); this.map.set(type, set); }
    set.add(fn as Listener<never>);
    return () => { set!.delete(fn as Listener<never>); };
  }

  /** Queue an event. Delivered on flush(), keeping sim ticks free of side effects. */
  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    this.queue.push({ type, payload });
  }

  /** Deliver immediately. Use only outside the sim tick. */
  emitNow<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.map.get(type);
    if (!set) return;
    for (const fn of set) (fn as Listener<Events[K]>)(payload);
  }

  flush(): void {
    if (this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];
    for (const { type, payload } of batch) {
      const set = this.map.get(type);
      if (!set) continue;
      for (const fn of set) (fn as Listener<unknown>)(payload);
    }
  }

  clear(): void { this.queue.length = 0; }
  get pending(): number { return this.queue.length; }
}
