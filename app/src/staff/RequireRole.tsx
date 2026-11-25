import { useEffect, useState, type ReactNode } from 'react';
import type { Api, StaffUser } from '../api/Api';
import type { StaffRole } from '../domain/types';
import '../styles/staff.css';
import { Login } from './Login';

export function RequireRole({ api, roles, children }: { api: Api; roles: StaffRole[]; children: (u: StaffUser, signOut: () => void) => ReactNode }) {
  const [user, setUser] = useState<StaffUser | null | undefined>(undefined);
  useEffect(() => { api.me().then(setUser).catch(() => setUser(null)); }, [api]);
  const signOut = () => { void api.signOut().then(() => setUser(null)); };
  if (user === undefined) return <main className="staff-center"><p>Loading…</p></main>;
  if (user === null) return <Login api={api} onSignedIn={setUser} demo={api.isDemo} />;
  if (!roles.includes(user.role)) {
    return (
      <main className="staff-center">
        <div className="panel">
          <h1>Not allowed</h1>
          <p>Your account ({user.email}) has the {user.role} role, which cannot open this page.</p>
          <p><a href="#/desk">Go to the desk</a> · <button className="link-btn" onClick={signOut}>Sign out</button></p>
        </div>
      </main>
    );
  }
  return <>{children(user, signOut)}</>;
}
