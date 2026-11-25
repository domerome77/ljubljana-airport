import { useState, type FormEvent } from 'react';
import type { StaffApi, StaffUser } from '../api/Api';
import { errMsg } from './useLoad';

export function Login({ api, onSignedIn, demo }: { api: StaffApi; onSignedIn: (u: StaffUser) => void; demo: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try { onSignedIn(await api.signIn(email, password)); } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  }
  return (
    <main className="staff-center">
      <form className="panel login" onSubmit={submit}>
        <h1>Staff sign in</h1>
        <label className="sinput"><span>Email</span><input aria-label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="sinput"><span>Password</span><input aria-label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <p className="notice notice-bad" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>Sign in</button>
        {demo && <p className="muted">Demo accounts: <b>admin@demo</b> or <b>desk@demo</b>, password <b>demo</b>.</p>}
      </form>
    </main>
  );
}
