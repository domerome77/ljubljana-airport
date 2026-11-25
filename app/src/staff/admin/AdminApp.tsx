import { NavLink, Route, Routes } from 'react-router-dom';
import type { Api } from '../../api/Api';
import { RequireRole } from '../RequireRole';
import { Bookings } from './Bookings';
import { Departures } from './Departures';
import { Manifest } from './Manifest';
import { SettingsPage } from './Settings';
import { Staff } from './Staff';
import { TodayBoard } from './TodayBoard';
import { Vehicles } from './Vehicles';

export interface AdminProps { api: Api; now: () => string }

const TABS = [
  ['', 'Today'], ['departures', 'Departures'], ['vehicles', 'Vehicles'], ['bookings', 'Bookings'], ['settings', 'Prices & settings'], ['staff', 'Staff'],
] as const;

export function StaffHeader({ title, tabs, user, onSignOut, extra }: {
  title: string; tabs: readonly (readonly [string, string])[]; user: string; onSignOut: () => void; extra?: React.ReactNode;
}) {
  return (
    <header className="staff-top no-print">
      <div className="wrap">
        <div className="staff-brand"><img src={`${import.meta.env.BASE_URL}assets/goopti-logo.png`} alt="GoOpti" /><span>{title}</span></div>
        <nav className="staff-tabs" aria-label={title}>
          {tabs.map(([to, label]) => (
            <NavLink key={label} to={to} end className={({ isActive }) => (isActive ? 'active' : undefined)}>{label}</NavLink>
          ))}
        </nav>
        <div className="staff-user">{extra}<span>{user}</span><button type="button" className="link-btn" onClick={onSignOut}>Sign out</button></div>
      </div>
    </header>
  );
}

export function AdminApp({ api, now }: AdminProps) {
  return (
    <RequireRole api={api} roles={['admin']}>
      {(user, signOut) => (
        <div className="staff">
          <StaffHeader
            title="Admin" user={user.displayName} onSignOut={signOut}
            tabs={[...TABS.map(([p, l]) => [`/admin${p ? `/${p}` : ''}`, l] as const), ['/desk', 'Desk'] as const]}
            extra={api.isDemo && 'resetDemo' in api ? (
              <button type="button" className="link-btn" onClick={() => {
                if (window.confirm('Reset all demo data?')) { (api as unknown as { resetDemo: () => void }).resetDemo(); window.location.reload(); }
              }}>Reset demo</button>
            ) : null}
          />
          <main className="wrap staff-main">
            <Routes>
              <Route index element={<TodayBoard api={api} now={now} />} />
              <Route path="departures" element={<Departures api={api} now={now} />} />
              <Route path="vehicles" element={<Vehicles api={api} />} />
              <Route path="bookings" element={<Bookings api={api} now={now} />} />
              <Route path="settings" element={<SettingsPage api={api} />} />
              <Route path="staff" element={<Staff api={api} />} />
              <Route path="manifest/:id" element={<Manifest api={api} />} />
            </Routes>
          </main>
        </div>
      )}
    </RequireRole>
  );
}
