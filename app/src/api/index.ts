import type { Api } from './Api';
import { MockApi } from './mock/MockApi';
import { safeStorage } from './mock/store';

let instance: Api | null = null;

export function getApi(): Api {
  if (!instance) instance = new MockApi({ storage: safeStorage() });
  return instance;
}

/** Tests only. */
export function setApi(api: Api | null): void {
  instance = api;
}
