export type LeadStatus = "New" | "Contacted" | "Visit Scheduled" | "Booked" | "Lost";

export type LeadNote = {
  text: string;
  created_at: string;
  author?: string;
};

export type Lead = {
  id: string;
  name: string;
  phone: string;
  preferred_location: string | null;
  budget: number | null;
  move_in_date: string | null; // ISO date
  status: LeadStatus;
  notes: LeadNote[];
  last_activity_at: string;
  created_at: string;
};

export const STATUSES: LeadStatus[] = ["New", "Contacted", "Visit Scheduled", "Booked", "Lost"];

export type IntentTier = "HOT" | "WARM" | "COLD";
