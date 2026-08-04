import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "./supabaseClient";
import type { Lead, LeadStatus, LeadNote } from "../types";

export function useLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLeads = useCallback(async () => {
    if (!supabaseConfigured) {
      setLoading(false);
      setError("not_configured");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      setError(error.message);
    } else {
      setError(null);
      setLeads((data as Lead[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLeads();
    if (!supabaseConfigured) return;

    const channel = supabase
      .channel("leads-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads" },
        () => fetchLeads()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchLeads]);

  const createLead = useCallback(
    async (input: {
      name: string;
      phone: string;
      preferred_location?: string;
      budget?: number | null;
      move_in_date?: string | null;
      notes?: string;
    }) => {
      const notes: LeadNote[] = input.notes
        ? [{ text: input.notes, created_at: new Date().toISOString() }]
        : [];
      const { error } = await supabase.from("leads").insert({
        name: input.name,
        phone: input.phone,
        preferred_location: input.preferred_location || null,
        budget: input.budget ?? null,
        move_in_date: input.move_in_date || null,
        status: "New",
        notes,
      });
      if (error) throw error;
      await fetchLeads();
    },
    [fetchLeads]
  );

  const updateStatus = useCallback(
    async (id: string, status: LeadStatus) => {
      const { error } = await supabase.from("leads").update({ status }).eq("id", id);
      if (error) throw error;
      await fetchLeads();
    },
    [fetchLeads]
  );

  const addNote = useCallback(
    async (lead: Lead, text: string) => {
      const notes = [...(lead.notes || []), { text, created_at: new Date().toISOString() }];
      const { error } = await supabase.from("leads").update({ notes }).eq("id", lead.id);
      if (error) throw error;
      await fetchLeads();
    },
    [fetchLeads]
  );

  return { leads, loading, error, refetch: fetchLeads, createLead, updateStatus, addNote };
}
