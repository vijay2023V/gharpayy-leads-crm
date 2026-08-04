/**
 * Arena Infrastructure — engine layer.
 * Pure functions. No state. Compose on top of the store.
 *
 * Encodes the real-life rules of the system:
 *   - SLA clocks (response, follow-up, post-tour)
 *   - Confidence decay (silence is the enemy)
 *   - Escalation thresholds
 *   - Smart "do next" prioritization
 */
import type { Lead, Tour, FollowUp, Intent } from "./types";

/* ============== SLA RULES ============== */

export const SLA = {
  firstResponseMins: 5,         // first response after lead arrives
  followUpHours: 24,            // every lead has a follow-up within 24h
  postTourHours: 1,             // post-tour form filled within 1h
  postTourAlertHours: 2,        // soft alert
  postTourEscalateHours: 6,     // hard escalation to Flow Ops
  reassignDays: 3,              // T+3 with no action → reassign
} as const;

export type SlaState = "ok" | "warn" | "breach";

export function slaForFollowUp(dueAt: string | null, now: number): SlaState {
  if (!dueAt) return "breach"; // no follow-up = breach
  const due = +new Date(dueAt);
  if (now > due) return "breach";
  if (due - now < 60 * 60 * 1000) return "warn"; // <1h
  return "ok";
}

export function slaForPostTour(tour: Tour, now: number): SlaState {
  if (tour.status !== "completed" || tour.postTour.filledAt) return "ok";
  const elapsedHrs = (now - +new Date(tour.scheduledAt)) / 36e5;
  if (elapsedHrs >= SLA.postTourEscalateHours) return "breach";
  if (elapsedHrs >= SLA.postTourAlertHours) return "warn";
  return "ok";
}

export function slaForFirstResponse(lead: Lead): SlaState {
  if (lead.responseSpeedMins <= SLA.firstResponseMins) return "ok";
  if (lead.responseSpeedMins <= SLA.firstResponseMins * 3) return "warn";
  return "breach";
}

/* ============== CONFIDENCE DECAY ============== */

/**
 * Live confidence — silence kills deals.
 *  - -1 per hour of silence after 6h
 *  - -5 if no follow-up scheduled
 *  - -8 if move-in date passed
 *  - +6 if move-in <= 3 days
 *  - +5 if response speed <= 5min
 *  - +8 if a tour is already completed
 */
function budgetWeight(budget: number): number {
  if (budget >= 35_000) return 18;
  if (budget >= 25_000) return 12;
  if (budget >= 15_000) return 7;
  if (budget >= 8_000) return 3;
  return -4;
}

function stageWeight(stage: Lead["stage"]): number {
  if (stage === "booked") return 20;
  if (stage === "negotiation") return 12;
  if (stage === "tour-done") return 9;
  if (stage === "tour-scheduled") return 6;
  if (stage === "contacted") return 4;
  return 0;
}

export function liveConfidence(lead: Lead, tours: Tour[], now: number): number {
  let s = lead.confidence + budgetWeight(lead.budget) + stageWeight(lead.stage);
  const silentHrs = (now - +new Date(lead.updatedAt)) / 36e5;
  if (silentHrs > 6) s -= Math.min(20, Math.floor(silentHrs - 6));
  if (!lead.nextFollowUpAt) s -= 5;
  if (lead.responseSpeedMins <= 5) s += 5;
  else if (lead.responseSpeedMins > 15) s -= 4;

  const days = (+new Date(lead.moveInDate) - now) / (24 * 36e5);
  if (days < 0) s -= 8;
  else if (days <= 3) s += 6;
  else if (days >= 14) s -= 3;

  if (tours.some((t) => t.leadId === lead.id && t.status === "completed")) s += 8;
  if (tours.some((t) => t.leadId === lead.id && t.decision === "booked")) s = 100;
  if (lead.stage === "dropped") s = Math.min(s, 15);
  if (lead.stage === "booked") s = 100;

  return Math.max(0, Math.min(100, Math.round(s)));
}

export function intentFor(confidence: number): Intent {
  if (confidence >= 75) return "hot";
  if (confidence >= 50) return "warm";
  return "cold";
}

/**
 * Shared lead temperature resolver used across Today, queue, and impact views.
 * Any screen that needs a HOT/WARM/COLD badge should derive it from this helper.
 */
export function calculateLeadTemperature(lead: Lead, tours: Tour[] = [], now: number = Date.now()): Intent {
  return intentFor(liveConfidence(lead, tours, now));
}

/* ============== SMART "DO NEXT" QUEUE ============== */

export interface NextAction {
  leadId: string;
  reason: string;
  /** higher = do first */
  score: number;
  kind:
    | "post-tour-overdue"
    | "follow-up-overdue"
    | "follow-up-today"
    | "no-follow-up"
    | "first-response"
    | "tour-today";
  dueAt?: string;
}

/** The single source-of-truth queue. Replaces "browse leads". */
export function buildDoNextQueue(
  leads: Lead[],
  tours: Tour[],
  followUps: FollowUp[],
  now: number,
  filterTcmId?: string,
): NextAction[] {
  const actions: NextAction[] = [];
  const byLead = (l: Lead) => !filterTcmId || l.assignedTcmId === filterTcmId;

  // 1. post-tour pending — highest priority
  tours
    .filter((t) => t.status === "completed" && !t.postTour.filledAt)
    .forEach((t) => {
      const lead = leads.find((l) => l.id === t.leadId);
      if (!lead || !byLead(lead)) return;
      const hrs = (now - +new Date(t.scheduledAt)) / 36e5;
      actions.push({
        leadId: lead.id,
        reason: `Post-tour form pending · ${Math.max(1, Math.round(hrs))}h overdue`,
        kind: "post-tour-overdue",
        score: 1000 + Math.min(100, hrs * 5),
      });
    });

  // 2. overdue follow-ups
  followUps
    .filter((f) => !f.done && +new Date(f.dueAt) < now)
    .forEach((f) => {
      const lead = leads.find((l) => l.id === f.leadId);
      if (!lead || !byLead(lead)) return;
      const hrs = (now - +new Date(f.dueAt)) / 36e5;
      const temperature = calculateLeadTemperature(lead, tours, now);
      actions.push({
        leadId: lead.id,
        reason: `Follow-up overdue · ${f.reason}`,
        kind: "follow-up-overdue",
        score: 800 + Math.min(150, hrs * 2) + intentBoost(temperature),
        dueAt: f.dueAt,
      });
    });

  // 3. tours scheduled today
  tours
    .filter((t) => t.status === "scheduled" && sameDay(+new Date(t.scheduledAt), now))
    .forEach((t) => {
      const lead = leads.find((l) => l.id === t.leadId);
      if (!lead || !byLead(lead)) return;
      const minsToTour = (+new Date(t.scheduledAt) - now) / 60_000;
      const temperature = calculateLeadTemperature(lead, tours, now);
      actions.push({
        leadId: lead.id,
        reason: minsToTour > 0
          ? `Tour today in ${formatRel(minsToTour)}`
          : `Tour was ${formatRel(-minsToTour)} ago — confirm`,
        kind: "tour-today",
        score: 700 + intentBoost(temperature) - Math.abs(minsToTour) / 30,
        dueAt: t.scheduledAt,
      });
    });

  // 4. follow-ups due today
  followUps
    .filter((f) => !f.done && sameDay(+new Date(f.dueAt), now) && +new Date(f.dueAt) >= now)
    .forEach((f) => {
      const lead = leads.find((l) => l.id === f.leadId);
      if (!lead || !byLead(lead)) return;
      const temperature = calculateLeadTemperature(lead, tours, now);
      actions.push({
        leadId: lead.id,
        reason: `Follow-up today · ${f.reason}`,
        kind: "follow-up-today",
        score: 500 + intentBoost(temperature),
        dueAt: f.dueAt,
      });
    });

  // 5. leads without any follow-up scheduled (and not closed)
  leads
    .filter((l) => byLead(l) && !l.nextFollowUpAt && l.stage !== "booked" && l.stage !== "dropped")
    .forEach((l) => {
      const temperature = calculateLeadTemperature(l, tours, now);
      actions.push({
        leadId: l.id,
        reason: `No follow-up set · SLA breach`,
        kind: "no-follow-up",
        score: 600 + intentBoost(temperature),
      });
    });

  // 6. brand-new leads waiting for first response
  leads
    .filter((l) => byLead(l) && l.stage === "new")
    .forEach((l) => {
      const ageMin = (now - +new Date(l.createdAt)) / 60_000;
      if (ageMin > SLA.firstResponseMins) {
        actions.push({
          leadId: l.id,
          reason: `First response overdue · created ${formatRel(ageMin)} ago`,
          kind: "first-response",
          score: 900 + Math.min(100, ageMin / 5),
        });
      }
    });

  // de-dup by lead+kind, sort
  const seen = new Set<string>();
  return actions
    .sort((a, b) => b.score - a.score)
    .filter((a) => {
      const k = `${a.leadId}:${a.kind}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

function intentBoost(i: Intent) {
  return i === "hot" ? 50 : i === "warm" ? 20 : 0;
}

function sameDay(a: number, b: number) {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() &&
         da.getMonth() === db.getMonth() &&
         da.getDate() === db.getDate();
}

function formatRel(mins: number): string {
  if (mins < 1) return "now";
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = mins / 60;
  if (h < 24) return `${h.toFixed(h < 10 ? 1 : 0)}h`;
  return `${Math.round(h / 24)}d`;
}

/* ============== TCM PERFORMANCE ============== */

export interface TcmPerformance {
  tcmId: string;
  leadCount: number;
  toursDone: number;
  bookings: number;
  conversion: number; // 0-100
  pendingPostTour: number;
  overdueFollowUps: number;
  discipline: number; // 0-100, higher = better
}

export function computeTcmPerformance(
  tcmId: string,
  leads: Lead[],
  tours: Tour[],
  followUps: FollowUp[],
  now: number,
): TcmPerformance {
  const myLeads = leads.filter((l) => l.assignedTcmId === tcmId);
  const myTours = tours.filter((t) => t.tcmId === tcmId);
  const toursDone = myTours.filter((t) => t.status === "completed").length;
  const bookings = myTours.filter((t) => t.decision === "booked").length;
  const conversion = toursDone > 0 ? Math.round((bookings / toursDone) * 100) : 0;
  const pendingPostTour = myTours.filter((t) => t.status === "completed" && !t.postTour.filledAt).length;
  const overdueFollowUps = followUps.filter((f) => f.tcmId === tcmId && !f.done && +new Date(f.dueAt) < now).length;
  const total = myLeads.length || 1;
  const discipline = Math.max(0, Math.min(100,
    100 - (pendingPostTour / total) * 100 - (overdueFollowUps / total) * 60,
  ));
  return {
    tcmId, leadCount: myLeads.length, toursDone, bookings, conversion,
    pendingPostTour, overdueFollowUps, discipline: Math.round(discipline),
  };
}
