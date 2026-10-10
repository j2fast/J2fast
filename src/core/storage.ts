// Safe key/value storage. Falls back to memory if localStorage is unavailable
// (private browsing, file:// restrictions, quota errors).

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): boolean;
  remove(key: string): void;
  keys(): string[];
}

export class MemoryStore implements KeyValueStore {
  private map = new Map<string, string>();
  get(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  set(key: string, value: string) {
    this.map.set(key, value);
    return true;
  }
  remove(key: string) {
    this.map.delete(key);
  }
  keys() {
    return [...this.map.keys()];
  }
}

export class BrowserStore implements KeyValueStore {
  private fallback = new MemoryStore();
  private usable: boolean;
  constructor() {
    this.usable = false;
    try {
      const k = '__lb_probe__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      this.usable = true;
    } catch {
      console.warn('[storage] localStorage unavailable; progress will only last this session.');
    }
  }
  get persistent() {
    return this.usable;
  }
  get(key: string) {
    if (!this.usable) return this.fallback.get(key);
    try {
      return localStorage.getItem(key);
    } catch {
      return this.fallback.get(key);
    }
  }
  set(key: string, value: string) {
    if (!this.usable) return this.fallback.set(key, value);
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (err) {
      console.error('[storage] write failed', err);
      this.fallback.set(key, value);
      return false;
    }
  }
  remove(key: string) {
    try {
      if (this.usable) localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    this.fallback.remove(key);
  }
  keys() {
    if (!this.usable) return this.fallback.keys();
    try {
      return Object.keys(localStorage);
    } catch {
      return this.fallback.keys();
    }
  }
}
