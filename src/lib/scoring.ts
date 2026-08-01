import type { Lead, IntentTier } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Automated Lead Intent / Prioritization Score.
 *
 * HOT  🔥 — budget > ₹10,000 AND move-in within 7 days
 * WARM ⚡ — moderate budget (>= ₹6,000) OR a visit already scheduled
 * COLD ❄️ — low budget AND no activity in > 5 days (or no signals at all)
 */
export function intentTier(lead: Lead): IntentTier {
  const now = Date.now();
  const daysSinceActivity = (now - new Date(lead.last_activity_at).getTime()) / DAY_MS;
  const moveInDays = lead.move_in_date
    ? (new Date(lead.move_in_date).getTime() - now) / DAY_MS
    : Infinity;
  const budget = lead.budget ?? 0;

  if (budget > 10000 && moveInDays <= 7 && moveInDays >= -1) return "HOT";
  if (lead.status === "Visit Scheduled" || budget >= 6000) return "WARM";
  if (budget < 6000 && daysSinceActivity > 5) return "COLD";
  return daysSinceActivity > 5 ? "COLD" : "WARM";
}

export const TIER_META: Record<IntentTier, { emoji: string; label: string; color: string; bg: string }> = {
  HOT: { emoji: "🔥", label: "Hot", color: "#C0554A", bg: "#F6E1DE" },
  WARM: { emoji: "⚡", label: "Warm", color: "#E0803F", bg: "#FBE6D4" },
  COLD: { emoji: "❄️", label: "Cold", color: "#3F6B93", bg: "#DEE9F1" },
};

export function whatsappMessage(lead: Lead): string {
  const loc = lead.preferred_location || "your area";
  return (
    `Hi ${lead.name}, thanks for inquiring with Gharpayy! ` +
    `We have great PG options in ${loc} within your budget. ` +
    `Would you like to schedule a quick visit today?`
  );
}

export function whatsappLink(lead: Lead): string {
  const digits = (lead.phone || "").replace(/[^0-9]/g, "");
  const text = encodeURIComponent(whatsappMessage(lead));
  return `https://wa.me/${digits}?text=${text}`;
}
