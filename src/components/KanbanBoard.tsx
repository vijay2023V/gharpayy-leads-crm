import { STATUSES, type Lead } from "../types";
import { LeadCard } from "./LeadCard";

type Props = {
  leads: Lead[];
  onOpen: (lead: Lead) => void;
};

export function KanbanBoard({ leads, onOpen }: Props) {
  return (
    <div className="board">
      {STATUSES.map((status) => {
        const items = leads.filter((l) => l.status === status);
        return (
          <div className="col" key={status}>
            <div className="col-head">
              <span>{status}</span>
              <span className="count">{items.length}</span>
            </div>
            {items.length === 0 ? (
              <div className="empty-col">No leads</div>
            ) : (
              items.map((lead) => <LeadCard key={lead.id} lead={lead} onOpen={onOpen} />)
            )}
          </div>
        );
      })}
    </div>
  );
}
