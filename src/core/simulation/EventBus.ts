export type EventHandler<T> = (payload: T) => void;

export class EventBus<T> {
  private handlers = new Map<string, Array<EventHandler<T>>>();

  subscribe(type: string, handler: EventHandler<T>): () => void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
    return () => this.unsubscribe(type, handler);
  }

  unsubscribe(type: string, handler: EventHandler<T>): void {
    const list = this.handlers.get(type);
    if (!list) return;
    this.handlers.set(type, list.filter(h => h !== handler));
  }

  publish(type: string, payload: Omit<T, 'type'> & Partial<T>): void {
    const event = { ...payload, type } as T;
    for (const handler of this.handlers.get(type) ?? []) handler(event);
  }

  clear(): void {
    this.handlers.clear();
  }
}
