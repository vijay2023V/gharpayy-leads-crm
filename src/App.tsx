import { useMemo, useState } from "react";
import type { Lead, LeadStatus } from "./types";
import { useLeads } from "./lib/useLeads";
import { supabaseConfigured } from "./lib/supabaseClient";
import { SearchFilterBar } from "./components/SearchFilterBar";
import { KanbanBoard } from "./components/KanbanBoard";
import { LeadModal } from "./components/LeadModal";
import { AddLeadModal } from "./components/AddLeadModal";
import { Kpis } from "./components/Kpis";
import "./App.css";

export default function App() {
  const { leads, loading, error, createLead, updateStatus, addNote } = useLeads();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<LeadStatus | "">("");
  const [location, setLocation] = useState("");
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const locations = useMemo(
    () => [...new Set(leads.map((l) => l.preferred_location).filter(Boolean) as string[])],
    [leads]
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return leads.filter((l) => {
      const matchQ = !q || l.name.toLowerCase().includes(q) || l.phone.includes(q);
      const matchS = !status || l.status === status;
      const matchL = !location || l.preferred_location === location;
      return matchQ && matchS && matchL;
    });
  }, [leads, query, status, location]);

  return (
    <div className="app">
      <header>
        <div className="brand">
          <div className="mark">GH</div>
          <div>
            <h1>Leads CRM</h1>
            <div className="sub">gharpayy · lead-management · supabase</div>
          </div>
        </div>
        <div className={`status-pill ${supabaseConfigured && !error ? "" : "warn"}`}>
          <span className="dot" />
          {supabaseConfigured && !error ? "live" : error === "not_configured" ? "not configured" : "error"}
        </div>
      </header>

      {!supabaseConfigured && (
        <div className="banner">
          Supabase isn't connected yet. Copy <code>.env.example</code> to <code>.env</code>, add your
          project URL + anon key, and restart the dev server. See README for the full setup.
        </div>
      )}
      {supabaseConfigured && error && error !== "not_configured" && (
        <div className="banner error">Couldn't load leads: {error}</div>
      )}

      <Kpis leads={leads} />

      <SearchFilterBar
        query={query}
        onQuery={setQuery}
        status={status}
        onStatus={setStatus}
        location={location}
        onLocation={setLocation}
        locations={locations}
        onAdd={() => setShowAdd(true)}
      />

      {loading ? (
        <div className="empty-state">Loading leads…</div>
      ) : (
        <KanbanBoard leads={filtered} onOpen={setOpenLead} />
      )}

      {openLead && (
        <LeadModal
          lead={leads.find((l) => l.id === openLead.id) ?? openLead}
          onClose={() => setOpenLead(null)}
          onStatusChange={updateStatus}
          onAddNote={addNote}
        />
      )}
      {showAdd && <AddLeadModal onClose={() => setShowAdd(false)} onCreate={createLead} />}
    </div>
  );
}
