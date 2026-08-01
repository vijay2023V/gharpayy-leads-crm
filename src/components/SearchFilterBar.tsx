import { STATUSES, type LeadStatus } from "../types";

type Props = {
  query: string;
  onQuery: (v: string) => void;
  status: LeadStatus | "";
  onStatus: (v: LeadStatus | "") => void;
  location: string;
  onLocation: (v: string) => void;
  locations: string[];
  onAdd: () => void;
};

export function SearchFilterBar({
  query,
  onQuery,
  status,
  onStatus,
  location,
  onLocation,
  locations,
  onAdd,
}: Props) {
  return (
    <div className="toolbar">
      <div className="search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          placeholder="Search by name or phone…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </div>
      <select value={status} onChange={(e) => onStatus(e.target.value as LeadStatus | "")}>
        <option value="">All statuses</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select value={location} onChange={(e) => onLocation(e.target.value)}>
        <option value="">All locations</option>
        {locations.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
      <button className="btn btn-primary" onClick={onAdd}>
        + New lead
      </button>
    </div>
  );
}
