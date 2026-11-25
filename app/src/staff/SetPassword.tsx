import { useState, type FormEvent } from 'react';
import '../styles/staff.css';
import { errMsg } from './useLoad';

export function SetPassword({ setPassword, onDone }: { setPassword: (pw: string) => Promise<void>; onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 10) { setError('Use at least 10 characters'); return; }
    if (pw !== pw2) { setError('Passwords do not match'); return; }
    try { await setPassword(pw); onDone(); } catch (err) { setError(errMsg(err)); }
  }
  return (
    <main className="staff-center">
      <form className="panel login" onSubmit={submit}>
        <h1>Set your password</h1>
        <p className="muted">Welcome to the GoOpti LJU shuttle back office. Choose a password for your staff account.</p>
        <label className="sinput"><span>New password</span><input aria-label="New password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        <label className="sinput"><span>Repeat password</span><input aria-label="Repeat password" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
        {error && <p className="notice notice-bad" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block">Save password</button>
      </form>
    </main>
  );
}
