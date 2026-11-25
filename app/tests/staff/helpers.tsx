import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MockApi, memoryStorage } from '../../src/api/mock/MockApi';
import { AdminApp } from '../../src/staff/admin/AdminApp';
import { DeskPage } from '../../src/staff/desk/DeskPage';

export const T0 = '2026-11-25T08:00:00.000Z'; // 09:00 Ljubljana
export const at = (min: number) => new Date(Date.parse(T0) + min * 60_000).toISOString();

export async function makeApi(signInAs: 'admin' | 'desk' | null = 'admin') {
  const storage = memoryStorage();
  const api = new MockApi({ now: () => T0, storage, seed: 'empty' });
  await api.signIn('admin@demo', 'demo');
  const [lj] = await api.listRoutes();
  const v = await api.saveVehicle({ internalName: 'Kombi 1', plate: 'LJ-AB-123', seats: 8, active: true });
  const d = await api.saveDeparture({ routeId: lj.id, vehicleId: v.id, departsAt: at(120), sellShared: true, sellPrivate: true, privatePrice: null,
    salesCloseMinutes: 10, blockedSeats: 0, tiers: [{ seatCount: 3, pricePerSeat: 12 }] });
  await api.signOut();
  if (signInAs) await api.signIn(`${signInAs}@demo`, 'demo');
  return { api, v, d, lj, storage };
}

export function renderAdmin(api: MockApi, path = '/admin') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/*" element={<AdminApp api={api} now={() => T0} />} />
        <Route path="/desk" element={<DeskPage api={api} now={() => T0} />} />
      </Routes>
    </MemoryRouter>,
  );
}
