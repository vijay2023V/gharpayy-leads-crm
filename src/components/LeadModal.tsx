import { useState } from "react";
import { STATUSES, type Lead, type LeadStatus } from "../types";
import { intentTier, TIER_META, whatsappLink } from "../lib/scoring";

type Props = {
  lead: Lead;
  onClose: () => void;
  onStatusChange: (id: string, status: LeadStatus) => Promise<void>;
  onAddNote: (lead: Lead, text: string) => Promise<void>;
};

export function LeadModal({ lead, onClose, onStatusChange, onAddNote }: Props) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const tier = intentTier(lead);
  const meta = TIER_META[tier];

  const submitNote = async () => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      await onAddNote(lead, note.trim());
      setNote("");
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
        <h3>{lead.name}</h3>
        <div className="d-meta">
          {lead.phone} · {lead.preferred_location || "—"} ·{" "}
          {lead.budget ? `₹${lead.budget.toLocaleString("en-IN")}` : "budget n/a"}
        </div>
        <span className="tier" style={{ color: meta.color, background: meta.bg }}>
          {meta.emoji} {meta.label} lead
        </span>

        <a className="qa wa" href={whatsappLink(lead)} target="_blank" rel="noreferrer">
          💬 Contact via WhatsApp
        </a>

        <div className="field">
          <label>Status</label>
        </div>
        <div className="stage-row">
          {STATUSES.map((s) => (
            <span
              key={s}
              className={`stage-chip ${s === lead.status ? "active" : ""}`}
              onClick={() => onStatusChange(lead.id, s)}
            >
              {s}
            </span>
          ))}
        </div>

        <div className="field">
          <label>Activity notes</label>
        </div>
        <div className="notes-list">
          {lead.notes && lead.notes.length ? (
            [...lead.notes].reverse().map((n, i) => (
              <div className="note" key={i}>
                <div className="ts">{new Date(n.created_at).toLocaleString()}</div>
                {n.text}
              </div>
            ))
          ) : (
            <div className="empty-state">No activity yet</div>
          )}
        </div>
        <textarea
          placeholder='e.g. "Wants single occupancy, budget ₹12k, visiting this Saturday"'
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-primary" onClick={submitNote} disabled={saving}>
            {saving ? "Saving…" : "Save note"}
          </button>
        </div>
      </div>
    </div>
  );
}
