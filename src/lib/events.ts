type Handler<T> = (payload: T) => void;

export interface AppEvents {
  badge: { id: string };
  levelUp: { level: number };
  toast: { kind: 'success' | 'error' | 'info'; message: string };
  libraryReplaced: undefined;
}

const handlers: { [K in keyof AppEvents]?: Set<Handler<AppEvents[K]>> } = {};

export function on<K extends keyof AppEvents>(name: K, fn: Handler<AppEvents[K]>): () => void {
  (handlers[name] ??= new Set() as any).add(fn as any);
  return () => (handlers[name] as Set<Handler<AppEvents[K]>> | undefined)?.delete(fn);
}

export function emit<K extends keyof AppEvents>(name: K, payload: AppEvents[K]) {
  (handlers[name] as Set<Handler<AppEvents[K]>> | undefined)?.forEach((fn) => {
    try {
      fn(payload);
    } catch (e) {
      console.error(e);
    }
  });
}
