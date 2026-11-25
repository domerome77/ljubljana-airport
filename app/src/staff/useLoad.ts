import { useCallback, useEffect, useState } from 'react';

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null; reload: () => Promise<void> } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  const reload = useCallback(async () => {
    try {
      setData(await run());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load data');
    }
  }, [run]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, error, reload };
}

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : 'Something went wrong');
