import { useState, type FormEvent } from 'react';
import type { Api } from '../../api/Api';
import type { StaffRole } from '../../domain/types';
import { errMsg, useLoad } from '../useLoad';

export function Staff({ api }: { api: Api }) {
  const list = useLoad(() => api.listStaff(), [api]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<StaffRole>('desk');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function invite(e: FormEvent) {
    e.preventDefault();
    try {
      await api.inviteStaff(email.trim(), role, name.trim());
      setMsg({ ok: true, text: `Invitation sent to ${email}` });
      setEmail(''); setName('');
      await list.reload();
    } catch (err) { setMsg({ ok: false, text: errMsg(err) }); }
  }
  return (
    <>
      <div className="page-head"><h1>Staff</h1></div>
      <div className="table-wrap" style={{ marginBottom: 20 }}>
        <table className="data">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
          <tbody>{(list.data ?? []).map((u) => <tr key={u.id}><td>{u.displayName}</td><td>{u.email}</td><td>{u.role}</td></tr>)}</tbody>
        </table>
      </div>
      <form className="panel form-stack" onSubmit={invite}>
        <h2 style={{ margin: 0 }}>Invite a colleague</h2>
        <p className="muted" style={{ margin: 0 }}><b>Desk</b> can sell and print tickets at the airport. <b>Admin</b> can also manage vehicles, departures, prices and bookings.</p>
        <div className="grid-3">
          <label className="sinput"><span>Name</span><input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="sinput"><span>Email</span><input aria-label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="sinput"><span>Role</span><select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}><option value="desk">Desk</option><option value="admin">Admin</option></select></label>
        </div>
        {msg && <p className={`notice ${msg.ok ? 'notice-ok' : 'notice-bad'}`} role="status">{msg.text}</p>}
        <div><button className="btn btn-primary">Send invitation</button></div>
      </form>
    </>
  );
}
