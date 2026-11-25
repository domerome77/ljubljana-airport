import { useState, type FormEvent } from 'react';
import type { Api, VehicleInput } from '../../api/Api';
import { Modal } from '../Modal';
import { errMsg, useLoad } from '../useLoad';

const EMPTY: VehicleInput = { internalName: '', plate: '', seats: 8, active: true, notes: '' };

export function Vehicles({ api }: { api: Api }) {
  const { data, reload, error } = useLoad(() => api.listVehicles(), [api]);
  const [edit, setEdit] = useState<VehicleInput | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!edit) return;
    try {
      await api.saveVehicle(edit);
      setEdit(null);
      await reload();
    } catch (err) {
      setFormError(errMsg(err));
    }
  }
  return (
    <>
      <div className="page-head">
        <h1>Vehicles</h1>
        <button type="button" className="btn btn-primary" onClick={() => { setFormError(null); setEdit({ ...EMPTY }); }}>Add vehicle</button>
      </div>
      {error && <p className="notice notice-bad">{error}</p>}
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Name (internal)</th><th>Plate</th><th>Seats</th><th>Status</th><th /></tr></thead>
          <tbody>
            {(data ?? []).map((v) => (
              <tr key={v.id}>
                <td><b>{v.internalName || '—'}</b>{v.notes && <div className="muted">{v.notes}</div>}</td>
                <td><span className="plate">{v.plate}</span></td>
                <td>{v.seats}</td>
                <td>{v.active ? 'Active' : 'Inactive'}</td>
                <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => { setFormError(null); setEdit({ ...v }); }}>Edit</button></td>
              </tr>
            ))}
            {data?.length === 0 && <tr><td colSpan={5} className="muted">No vehicles yet. Add your first van.</td></tr>}
          </tbody>
        </table>
      </div>
      {edit && (
        <Modal title={edit.id ? 'Edit vehicle' : 'Add vehicle'} onClose={() => setEdit(null)}>
          <form className="form-stack" onSubmit={save} noValidate>
            <div className="grid-3">
              <label className="sinput"><span>Name (internal)</span>
                <input aria-label="Name (internal)" value={edit.internalName} onChange={(e) => setEdit({ ...edit, internalName: e.target.value })} />
                <small>Never shown to passengers.</small>
              </label>
              <label className="sinput"><span>Licence plate</span>
                <input aria-label="Licence plate" value={edit.plate} onChange={(e) => setEdit({ ...edit, plate: e.target.value })} />
              </label>
              <label className="sinput"><span>Seats</span>
                <input aria-label="Seats" type="number" min={1} max={60} value={Number.isNaN(edit.seats) ? '' : edit.seats} onChange={(e) => setEdit({ ...edit, seats: e.target.valueAsNumber })} />
                <small>Passenger seats (without driver).</small>
              </label>
            </div>
            <label className="sinput"><span>Notes</span><input aria-label="Notes" value={edit.notes ?? ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></label>
            <label className="scheck"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />Active (can be used for new departures)</label>
            {formError && <p className="notice notice-bad" role="alert">{formError}</p>}
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEdit(null)}>Close</button>
              <button type="submit" className="btn btn-primary">Save vehicle</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
