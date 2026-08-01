import type { Lead } from "../types";
import { intentTier, TIER_META, whatsappLink } from "../lib/scoring";

type Props = {
  lead: Lead;
  onOpen: (lead: Lead) => void;
};

export function LeadCard({ lead, onOpen }: Props) {
  const tier = intentTier(lead);
  const meta = TIER_META[tier];

  return (
    <div className="card" onClick={() => onOpen(lead)}>
      <div className="top">
        <div>
          <div className="name">{lead.name}</div>
          <div className="phone">{lead.phone}</div>
        </div>
        <span className="tier" style={{ color: meta.color, background: meta.bg }}>
          {meta.emoji} {meta.label}
        </span>
      </div>
      <div className="meta">
        <span className="area-tag">{lead.preferred_location || "—"}</span>
        {lead.budget ? <span className="budget">₹{lead.budget.toLocaleString("en-IN")}</span> : null}
      </div>
      <a
        className="qa-inline wa"
        href={whatsappLink(lead)}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        💬 WhatsApp
      </a>
    </div>
  );
}
