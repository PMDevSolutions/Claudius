import "@testing-library/jest-dom/vitest";

// Mock chrome.storage API for tests
const storage: Record<string, unknown> = {};
const sessionStorage: Record<string, unknown> = {};

function createStorageMock(store: Record<string, unknown>) {
  return {
    get: vi.fn((keys: string | string[]) => {
      if (typeof keys === "string") {
        return Promise.resolve({ [keys]: store[keys] ?? undefined });
      }
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        result[key] = store[key] ?? undefined;
      }
      return Promise.resolve(result);
    }),
    set: vi.fn((items: Record<string, unknown>) => {
      Object.assign(store, items);
      return Promise.resolve();
    }),
    remove: vi.fn((keys: string | string[]) => {
      const toRemove = typeof keys === "string" ? [keys] : keys;
      for (const key of toRemove) {
        delete store[key];
      }
      return Promise.resolve();
    }),
  };
}

const chromeStorageMock = {
  local: createStorageMock(storage),
  session: createStorageMock(sessionStorage),
};

Object.defineProperty(globalThis, "chrome", {
  value: {
    storage: chromeStorageMock,
    runtime: {
      sendMessage: vi.fn(),
      onMessage: { addListener: vi.fn() },
    },
  },
  writable: true,
});

// Reset storage between tests
beforeEach(() => {
  Object.keys(storage).forEach((key) => delete storage[key]);
  Object.keys(sessionStorage).forEach((key) => delete sessionStorage[key]);
  vi.clearAllMocks();
});
