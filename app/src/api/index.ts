import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import type { Api } from './Api';
import { MockApi } from './mock/MockApi';
import { safeStorage } from './mock/store';
import { SupabaseApi, type SupabaseLike } from './supabase/SupabaseApi';

let instance: Api | null = null;

export function getApi(): Api {
  if (!instance) {
    instance = config.supabaseUrl
      ? new SupabaseApi(createClient(config.supabaseUrl, config.supabaseAnonKey) as unknown as SupabaseLike)
      : new MockApi({ storage: safeStorage() });
  }
  return instance;
}

/** Tests only. */
export function setApi(api: Api | null): void {
  instance = api;
}
