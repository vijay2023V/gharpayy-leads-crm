/**
 * Impact Queue scoring — Priority Stack + Next Best Action.
 *
 * Pure functions. No store access. Given a lead and its context the
 * engine produces:
 *   - priorityScore: number used to sort the stack (higher = work first)
 *   - nba:           one-line "next best action" with reason + verb
 *   - pressure:      "normal" | "watch" | "escalate" — auto-decay state
 */
import type { Lead, Tour } from "@/lib/types";
import type { Quotation } from "@/lib/crm10x/quotations";
import { calculateLeadTemperature, liveConfidence } from "@/lib/engine";

export type Pressure = "normal" | "watch" | "escalate";
export type NBAVerb =
  | "call"
  | "schedule"
  | "confirm"
  | "remind"
  | "quote"
  | "follow-quote"
  | "negotiate"
  | "book"
  | "revive"
  | "rest";

export interface NextBestAction {
  verb: NBAVerb;
  label: string;       // "Send quotation now"
  reason: string;      // "Toured 35 min ago"
  pressure: Pressure;
  ageMinutes: number;
}

export interface PriorityBreakdown {
  score: number;
  reasons: string[];
}

const minutesSince = (iso?: string | null): number => {
  if (!iso) return Infinity;
  return Math.max(0, Math.round((Date.now() - +new Date(iso)) / 60000));
};
const minutesUntil = (iso?: string | null): number => {
  if (!iso) return Infinity;
  return Math.round((+new Date(iso) - Date.now()) / 60000);
};

export function scoreLead(
  lead: Lead,
  openTour: Tour | undefined,
  lastQuote: Quotation | undefined,
): PriorityBreakdown {
  let s = 0;
  const r: string[] = [];

  const temperature = calculateLeadTemperature(lead, openTour ? [openTour] : [], Date.now());
  const dynamicConfidence = liveConfidence(lead, openTour ? [openTour] : [], Date.now());

  // Intent
  if (temperature === "hot") { s += 50; r.push("HOT"); }
  else if (temperature === "warm") { s += 20; r.push("warm"); }
  else { s += 5; r.push("cold"); }

  // Confidence baseline
  s += Math.round(dynamicConfidence * 0.4);

  // Stage urgency
  if (lead.stage === "negotiation") { s += 25; r.push("negotiating"); }
  if (lead.stage === "tour-done") { s += 18; r.push("post-tour"); }

  // Open tour today/tomorrow boost
  if (openTour) {
    const mins = minutesUntil(openTour.scheduledAt);
    if (mins < 0) { s += 30; r.push("tour overdue"); }
    else if (mins < 60 * 4) { s += 30; r.push("tour < 4h"); }
    else if (mins < 60 * 24) { s += 18; r.push("tour today"); }
  }

  // Quote signal
  if (lastQuote && lastQuote.status === "sent") {
    const age = minutesSince(lastQuote.sentAt);
    if (age > 60 * 24) { s += 22; r.push("quote stale 24h+"); }
    else if (age > 60 * 3) { s += 14; r.push("quote sent"); }
    else { s += 8; r.push("fresh quote"); }
  }

  // Move-in urgency
  const moveInDays = minutesUntil(lead.moveInDate) / 1440;
  if (moveInDays >= 0 && moveInDays <= 7) { s += 18; r.push(`move-in ${Math.round(moveInDays)}d`); }
  else if (moveInDays >= 0 && moveInDays <= 14) { s += 8; }

  // Idle penalty / reward
  const idle = minutesSince(lead.updatedAt);
  if (idle > 60 * 24 && temperature === "hot") { s += 25; r.push("hot & idle 24h"); }
  else if (idle > 60 * 72) { s += 8; r.push("idle 3d"); }

  return { score: s, reasons: r };
}

export function computeNBA(
  lead: Lead,
  openTour: Tour | undefined,
  lastQuote: Quotation | undefined,
): NextBestAction {
  // 1. Booking-ready
  if (lastQuote?.status === "paid") {
    return {
      verb: "book", label: "Close booking now",
      reason: "Quote marked paid — confirm the booking",
      pressure: "escalate", ageMinutes: minutesSince(lastQuote.paidAt ?? lastQuote.sentAt),
    };
  }

  // 2. Open tour — confirm / live / post
  if (openTour) {
    const mins = minutesUntil(openTour.scheduledAt);
    if (mins < -30) {
      return {
        verb: "quote", label: "Send quotation",
        reason: "Tour finished — strike while warm",
        pressure: "escalate", ageMinutes: Math.abs(mins),
      };
    }
    if (mins <= 30 && mins >= -30) {
      return {
        verb: "confirm", label: "Mark tour live",
        reason: "Tour starting now — confirm arrival",
        pressure: "escalate", ageMinutes: Math.abs(mins),
      };
    }
    if (mins <= 60 * 4) {
      return {
        verb: "remind", label: "Send reminder + agent details",
        reason: `Tour in ${Math.round(mins / 60)}h`,
        pressure: "watch", ageMinutes: 0,
      };
    }
    return {
      verb: "confirm", label: "Confirm attendance",
      reason: "Tour scheduled — verify the lead will show",
      pressure: minutesSince(lead.updatedAt) > 60 * 12 ? "watch" : "normal",
      ageMinutes: 0,
    };
  }

  // 3. Quote sent — follow up
  if (lastQuote && lastQuote.status === "sent") {
    const age = minutesSince(lastQuote.sentAt);
    if (age > 60 * 24) {
      return {
        verb: "follow-quote", label: "Chase quote · 24h+ silent",
        reason: "Quote sent yesterday and still unread",
        pressure: "escalate", ageMinutes: age,
      };
    }
    return {
      verb: "follow-quote", label: "Nudge lead on quote",
      reason: `Quote sent ${Math.round(age / 60)}h ago`,
      pressure: age > 60 * 6 ? "watch" : "normal", ageMinutes: age,
    };
  }

  // 4. Stage-driven
  if (lead.stage === "negotiation") {
    return {
      verb: "negotiate", label: "Open negotiation playbook",
      reason: "Lead negotiating — pick a script",
      pressure: "watch", ageMinutes: minutesSince(lead.updatedAt),
    };
  }

  if (lead.stage === "new" || lead.stage === "contacted") {
    const idleH = minutesSince(lead.updatedAt) / 60;
    const temperature = calculateLeadTemperature(lead, openTour ? [openTour] : [], Date.now());
    if (temperature === "hot" && idleH > 0.25) {
      return {
        verb: "call", label: "Call HOT lead now",
        reason: `Untouched for ${Math.round(idleH * 60)}m — HOT lead window`,
        pressure: "escalate", ageMinutes: idleH * 60,
      };
    }
    return {
      verb: "schedule", label: "Schedule tour",
      reason: temperature === "hot" ? "HOT lead with no tour yet" : "Lock a visit slot",
      pressure: temperature === "hot" ? "watch" : "normal",
      ageMinutes: idleH * 60,
    };
  }

  if (lead.stage === "tour-done") {
    return {
      verb: "quote", label: "Send quotation",
      reason: "Tour done — push the quote",
      pressure: "escalate", ageMinutes: minutesSince(lead.updatedAt),
    };
  }

  if (lead.stage === "dropped") {
    return {
      verb: "revive", label: "Re-engage with revival template",
      reason: "Dropped — reopen with a fresh offer",
      pressure: "normal", ageMinutes: minutesSince(lead.updatedAt),
    };
  }

  return {
    verb: "rest", label: "Nothing urgent",
    reason: "Lead is on track",
    pressure: "normal", ageMinutes: 0,
  };
}

export function pressureColor(p: Pressure): string {
  if (p === "escalate") return "text-danger border-danger/40 bg-danger/10";
  if (p === "watch") return "text-warning border-warning/40 bg-warning/10";
  return "text-muted-foreground border-border bg-muted/30";
}

export function intentChip(i: Lead["intent"]): string {
  if (i === "hot") return "bg-danger/15 text-danger border-danger/30";
  if (i === "warm") return "bg-warning/15 text-warning border-warning/30";
  return "bg-muted text-muted-foreground border-border";
}