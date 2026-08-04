import { createClient } from "@supabase/supabase-js";
import type { Lead } from "../types";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

if (!supabaseConfigured) {
  // Don't throw — let the UI render a clear "not configured" state instead of a blank screen.
  // eslint-disable-next-line no-console
  console.warn(
    "Supabase env vars missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example)."
  );
}

export const supabase = createClient(url ?? "https://placeholder.supabase.co", anonKey ?? "placeholder");

export type LeadInsert = Omit<Lead, "id" | "created_at" | "last_activity_at" | "notes"> & {
  notes?: Lead["notes"];
};
