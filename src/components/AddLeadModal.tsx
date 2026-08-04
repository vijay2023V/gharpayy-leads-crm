import { useState } from "react";

const LOCATIONS = [
  "Koramangala",
  "HSR Layout",
  "Bellandur",
  "Marathahalli",
  "Whitefield",
  "Indiranagar",
  "BTM Layout",
  "Hebbal",
  "Electronic City",
  "Jayanagar",
];

type Props = {
  onClose: () => void;
  onCreate: (input: {
    name: string;
    phone: string;
    preferred_location?: string;
    budget?: number | null;
    move_in_date?: string | null;
    notes?: string;
  }) => Promise<void>;
};

export function AddLeadModal({ onClose, onCreate }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState(LOCATIONS[0]);
  const [budget, setBudget] = useState("");
  const [moveIn, setMoveIn] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!name.trim() || !phone.trim()) {
      setErr("Name and phone are required.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      await onCreate({
        name: name.trim(),
        phone: phone.trim(),
        preferred_location: location,
        budget: budget ? Number(budget) : null,
        move_in_date: moveIn || null,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save lead.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay show" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="close-x" onClick={onClose}>
          ✕
        </button>
        <h3>New lead</h3>
        <div className="field">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya Nair" />
        </div>
        <div className="row2">
          <div className="field">
            <label>Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 90000 00000" />
          </div>
          <div className="field">
            <label>Budget (₹/mo)</label>
            <input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="12000" type="number" />
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label>Preferred location</label>
            <select value={location} onChange={(e) => setLocation(e.target.value)}>
              {LOCATIONS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Move-in date</label>
            <input type="date" value={moveIn} onChange={(e) => setMoveIn(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Requirements, occupancy type…" />
        </div>
        {err && <div className="err">{err}</div>}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Create lead"}
          </button>
        </div>
      </div>
    </div>
  );
}
