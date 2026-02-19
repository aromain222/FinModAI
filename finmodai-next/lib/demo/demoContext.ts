type DemoContext = {
  demoMode: boolean;
};

let demoContextStore: import('node:async_hooks').AsyncLocalStorage<DemoContext> | null = null;

function getStore() {
  if (!demoContextStore && typeof window === 'undefined') {
    const { AsyncLocalStorage }: typeof import('node:async_hooks') = require('node:async_hooks');
    demoContextStore = new AsyncLocalStorage<DemoContext>();
  }
  return demoContextStore;
}

export function runWithDemoMode<T>(demoMode: boolean, fn: () => T): T {
  const store = getStore();
  if (!store) {
    return fn();
  }
  return store.run({ demoMode }, fn);
}

export function getDemoModeFromContext(): boolean | undefined {
  const store = getStore();
  return store?.getStore?.()?.demoMode;
}
