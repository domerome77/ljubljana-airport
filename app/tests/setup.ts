import '@testing-library/jest-dom/vitest';

// Node 26 + jsdom can leave window.localStorage undefined; provide an in-memory Storage for tests.
if (typeof window !== 'undefined' && !window.localStorage) {
  const m = new Map<string, string>();
  const storage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
}
