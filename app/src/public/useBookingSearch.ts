import { useCallback, useEffect, useState } from 'react';
import type { PublicApi } from '../api/Api';
import type { Product, PublicDeparture, Quote, RouteCode } from '../domain/types';
import { fits, visibleFor } from './DepartureList';

export interface BookingSearch {
  route: RouteCode; setRoute: (r: RouteCode) => void;
  product: Product; setProduct: (p: Product) => void;
  passengers: number; setPassengers: (n: number) => void;
  departures: PublicDeparture[]; loading: boolean; error: string | null;
  selectedId: string | null; setSelectedId: (id: string) => void;
  selected: PublicDeparture | null;
  quote: Quote | null;
  refresh: () => Promise<void>;
}

export function useBookingSearch(api: PublicApi, refreshMs = 30_000): BookingSearch {
  const [route, setRoute] = useState<RouteCode>('LJU-LJ');
  const [product, setProduct] = useState<Product>('shared');
  const [passengers, setPassengers] = useState(1);
  const [departures, setDepartures] = useState<PublicDeparture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await api.listDepartures(route);
      setDepartures(list);
      setError(null);
    } catch {
      setError('Could not load departures. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, [api, route]);

  useEffect(() => {
    setLoading(true);
    void refresh();
    if (!refreshMs) return;
    const t = setInterval(() => void refresh(), refreshMs);
    return () => clearInterval(t);
  }, [refresh, refreshMs]);

  // keep a valid selection: nearest departure that fits the request
  useEffect(() => {
    const current = departures.find((d) => d.id === selectedId);
    if (current && fits(current, product, passengers)) return;
    const first = visibleFor(departures, product).find((d) => fits(d, product, passengers));
    setSelectedId(first?.id ?? null);
  }, [departures, product, passengers, selectedId]);

  useEffect(() => {
    let alive = true;
    setQuote(null);
    if (!selectedId) return;
    api.quote(selectedId, product, passengers).then((q) => { if (alive) setQuote(q); }).catch(() => { if (alive) setQuote(null); });
    return () => { alive = false; };
  }, [api, selectedId, product, passengers, departures]);

  return {
    route, setRoute, product, setProduct, passengers, setPassengers, departures, loading, error,
    selectedId, setSelectedId, selected: departures.find((d) => d.id === selectedId) ?? null, quote, refresh,
  };
}
