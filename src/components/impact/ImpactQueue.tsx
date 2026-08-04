import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { useQuotations, formatINR, type Quotation } from "@/lib/crm10x/quotations";
import { useTcmContacts } from "@/lib/crm10x/tcm-contacts";
import { useLeadInterests } from "@/lib/crm10x/lead-interests";
import { useLeadFocus } from "@/lib/crm10x/lead-focus";
import { useDossierReadiness } from "@/lib/crm10x/dossier-readiness";
import { useCheckins, DELAY_REASONS, STAGE_LABEL, riskLevel, RISK_CLASS, RISK_LABEL, type DelayReason, type CheckIn } from "@/lib/checkins/store";
import { waBookingConfirm, waDateConfirm, waRescheduleCheckIn, waTokenRequest } from "@/lib/checkins/templates";
import { useSnoozes } from "@/lib/impact/snoozes";
import { calculateLeadTemperature } from "@/lib/engine";
import type { Lead, Property, TCM, Tour } from "@/lib/types";
import {
  IMPACT_TEMPLATES, renderImpactTemplate, impactWaLink,
  type ImpactScenario, type ImpactTpl, type ImpactTplCtx,
} from "@/lib/crm10x/impact-templates";
import {
  scoreLead, computeNBA, pressureColor, intentChip,
  type NextBestAction,
} from "@/lib/crm10x/impact-scoring";
import { QuotationBuilder } from "@/components/crm10x/QuotationBuilder";
import { SmartDossier } from "@/components/crm10x/SmartDossier";
import { LeadPropertyDossier } from "@/components/impact/LeadPropertyDossier";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Calendar, CheckCircle2, ChevronRight, ClipboardCopy,
  ExternalLink, FileText, Flame, LayoutGrid, ListOrdered, Phone, Plus,
  Search, Send, Sparkles, Target, Timer, UserCheck, Wallet, Zap,
  Beaker, Home, Pin, X, Heart, Star, Activity, TrendingUp, Bell, Sunrise,
  RotateCcw, KeyRound, ScrollText, MessageSquare, ChevronLeft,
} from "lucide-react";
import { toast } from "sonner";
import { useMountedNow } from "@/hooks/use-now";
import { CopyChip } from "@/components/atc/CopyChip";
import { leadsBlock, toursBlock } from "@/lib/impact/copy-formats";
import { LeadCreateSheet } from "@/components/leads/LeadCreateSheet";

/* ================================================================== */
/*  Impact Queue — 10x                                                */
/*  Priority Stack + Stage Board · Live counters · NBA per card       */
/*  Multi-variant templates · Negotiation playbook · Direct book       */
/* ================================================================== */

function todayISO() {
  const d = new Date(); d.setHours(0,0,0,0); return d.toISOString().slice(0,10);
}
function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}
function isThisWeek(iso: string) {
  const d = new Date(iso); const n = new Date();
  const diff = (+n - +d) / 86_400_000;
  return diff >= 0 && diff <= 7;
}
function isThisMonth(iso: string) {
  const d = new Date(iso); const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
}
function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}
function fmtWhen(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));
}
function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}
function fmtRel(iso: string, nowMs: number) {
  const ms = +new Date(iso) - nowMs;
  const m = Math.round(ms / 60000);
  if (Math.abs(m) < 60) return `${m > 0 ? "in " : ""}${Math.abs(m)}m${m < 0 ? " ago" : ""}`;
  const h = Math.round(m / 60);
  if (Math.abs(h) < 24) return `${h > 0 ? "in " : ""}${Math.abs(h)}h${h < 0 ? " ago" : ""}`;
  return fmtWhen(iso);
}

async function copyText(text: string, label = "Copied — paste in WhatsApp") {
  try {
    await navigator.clipboard?.writeText(text);
    toast.success(label);
  } catch {
    toast.error("Copy failed");
  }
}

function openWhatsApp(phone: string, text: string) {
  window.open(impactWaLink(phone, text), "_blank", "noopener,noreferrer");
  toast.success("Opened WhatsApp");
}

type IntentFilter = "all" | "hot" | "warm" | "cold";
type ViewMode = "stack" | "board";
export type ColumnKey = "inbox" | "scheduled" | "onTour" | "quoted" | "booked";
const COLUMNS: { key: ColumnKey; label: string; tint: string; icon: typeof Sparkles }[] = [
  { key: "inbox",     label: "Inbox",          tint: "border-l-info",    icon: Sparkles },
  { key: "scheduled", label: "Tour scheduled", tint: "border-l-accent",  icon: Calendar },
  { key: "onTour",    label: "On tour today",  tint: "border-l-warning", icon: UserCheck },
  { key: "quoted",    label: "Quote sent",     tint: "border-l-primary", icon: FileText },
  { key: "booked",    label: "Booked",         tint: "border-l-success", icon: CheckCircle2 },
];

/** Derive impact state (openTour/lastQuote/column/nba) for any lead from current stores. */
export function useImpactStateForLead(lead: Lead | null | undefined) {
  const tours = useApp((s) => s.tours);
  const properties = useApp((s) => s.properties);
  const tcms = useApp((s) => s.tcms);
  const quotes = useQuotations((s) => s.quotations);
  return useMemo(() => {
    if (!lead) return null;
    const ts = tours
      .filter((t) => t.leadId === lead.id)
      .sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt));
    const openTour = ts.find((t) => t.status === "scheduled");
    const lastQuote = quotes
      .filter((q) => q.leadId === lead.id)
      .sort((a, b) => +new Date(b.sentAt) - +new Date(a.sentAt))[0];
    let column: ColumnKey = "inbox";
    if (lead.stage === "booked") column = "booked";
    else if (lastQuote && (lastQuote.status === "sent" || lastQuote.status === "paid")) column = "quoted";
    else if (openTour && isToday(openTour.scheduledAt)) column = "onTour";
    else if (openTour) column = "scheduled";
    const nba = computeNBA(lead, openTour, lastQuote);
    const property = openTour ? properties.find((p) => p.id === openTour.propertyId) : undefined;
    const tcm = tcms.find((t) => t.id === lead.assignedTcmId);
    return { openTour, lastQuote, column, nba, property, tcm };
  }, [lead, tours, properties, tcms, quotes]);
}

/* ------------------------------------------------------------------ */

export function ImpactQueue() {
  const { role, currentTcmId, tcms, leads, tours, properties, bookings } = useApp();
  const quotes = useQuotations((s) => s.quotations);
  const snoozeUntil = useSnoozes((s) => s.until);

  const [tcmFilter, setTcmFilter] = useState<string>(role === "tcm" ? currentTcmId : "all");
  const [query, setQuery] = useState("");
  const [intent, setIntent] = useState<IntentFilter>("all");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [onlyTourToday, setOnlyTourToday] = useState(false);
  const [onlyQuotePending, setOnlyQuotePending] = useState(false);
  const [view, setView] = useState<ViewMode>("board");

  /* --------- 10x live tick: re-rank every 60s --------- */
  // Start at 0 on SSR + first client render to avoid hydration mismatches.
  const [tick, setTick] = useState(0);
  const [lastRerank, setLastRerank] = useState<number>(0);
  useEffect(() => {
    setLastRerank(Date.now());
    const id = setInterval(() => {
      setTick((t) => t + 1);
      setLastRerank(Date.now());
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  /* --------- per-lead enrichment (NBA + score) --------- */
  type Enriched = {
    lead: Lead;
    openTour?: Tour;
    lastQuote?: Quotation;
    nba: NextBestAction;
    score: number;
    column: ColumnKey;
    temperature: ReturnType<typeof calculateLeadTemperature>;
  };

  const enriched: Enriched[] = useMemo(() => {
    const nowMs = Date.now();
    const tFilter = (lead: Lead) => {
      const temperature = calculateLeadTemperature(lead, tours, nowMs);
      return (tcmFilter === "all" || lead.assignedTcmId === tcmFilter) &&
        (intent === "all" || temperature === intent) &&
        (!snoozeUntil[lead.id] || +new Date(snoozeUntil[lead.id]) <= nowMs) &&
        (!query.trim() ||
          lead.name.toLowerCase().includes(query.toLowerCase()) ||
          lead.phone.includes(query));
    };

    return leads.filter(tFilter).map((lead) => {
      const ts = tours
        .filter((t) => t.leadId === lead.id)
        .sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt));
      const openTour = ts.find((t) => t.status === "scheduled");
      const lastQuote = quotes
        .filter((q) => q.leadId === lead.id)
        .sort((a, b) => +new Date(b.sentAt) - +new Date(a.sentAt))[0];

      let column: ColumnKey = "inbox";
      if (lead.stage === "booked") column = "booked";
      else if (lastQuote && (lastQuote.status === "sent" || lastQuote.status === "paid")) column = "quoted";
      else if (openTour && isToday(openTour.scheduledAt)) column = "onTour";
      else if (openTour || lead.stage === "tour-scheduled") column = "scheduled";

      const nba = computeNBA(lead, openTour, lastQuote);
      const { score } = scoreLead(lead, openTour, lastQuote);
      const temperature = calculateLeadTemperature(lead, tours, nowMs);
      return { lead, openTour, lastQuote, nba, score, column, temperature };
    });
  }, [leads, tours, quotes, tcmFilter, query, intent, snoozeUntil]);

  /* --------- filter chips --------- */
  const filtered = useMemo(() => {
    return enriched.filter((e) => {
      if (onlyOverdue && e.nba.pressure !== "escalate") return false;
      if (onlyTourToday && !(e.openTour && isToday(e.openTour.scheduledAt))) return false;
      if (onlyQuotePending && !(e.lastQuote?.status === "sent")) return false;
      // Hide closed deals unless filtering by booked column
      if (e.lead.stage === "dropped") return false;
      return true;
    });
  }, [enriched, onlyOverdue, onlyTourToday, onlyQuotePending]);

  const stackSorted = useMemo(
    () => [...filtered].sort((a, b) => b.score - a.score),
    [filtered],
  );

  const boardBuckets = useMemo(() => {
    const b: Record<ColumnKey, Enriched[]> = {
      inbox: [], scheduled: [], onTour: [], quoted: [], booked: [],
    };
    filtered.forEach((e) => b[e.column].push(e));
    Object.keys(b).forEach((k) => {
      b[k as ColumnKey].sort((a, b) => b.score - a.score);
    });
    return b;
  }, [filtered]);

  /* --------- live counters --------- */
  const counters = useMemo(() => {
    const scopedTours = tcmFilter === "all" ? tours : tours.filter((t) => t.tcmId === tcmFilter);
    const scopedQuotes = tcmFilter === "all" ? quotes : quotes.filter((q) => q.tcmId === tcmFilter);
    const scopedBookings = tcmFilter === "all" ? bookings : bookings.filter((b) => b.tcmId === tcmFilter);
    const toursToday = scopedTours.filter((t) => isToday(t.scheduledAt) && t.status === "scheduled").length;
    const quotesWeek = scopedQuotes.filter((q) => isThisWeek(q.sentAt)).length;
    const bookingsMonth = scopedBookings.filter((b) => isThisMonth(b.ts)).length;
    return { toursToday, quotesWeek, bookingsMonth };
  }, [tours, quotes, bookings, tcmFilter]);

  // Visible targets — tweak as the BBD target evolves.
  const targets = { toursToday: 4, quotesWeek: 10, bookingsMonth: 6 };
  const tone = (got: number, target: number) =>
    got >= target ? "text-success border-success/30 bg-success/10"
    : got >= target * 0.5 ? "text-warning border-warning/30 bg-warning/10"
    : "text-danger border-danger/30 bg-danger/10";

  const escalations = stackSorted.filter((e) => e.nba.pressure === "escalate").length;

  return (
    <div className="space-y-3">
      {/* ---------------- 10x Command Bar ---------------- */}
      <TenXCommandBar
        lastRerank={lastRerank}
        escalations={escalations}
        counters={counters}
        targets={targets}
        stackSorted={stackSorted}
        tick={tick}
      />

      {/* ---------------- Header ---------------- */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-accent font-semibold">
            Conversion engine · one screen
          </div>
          <h1 className="text-2xl font-display font-semibold flex items-center gap-2">
            Impact Queue
            {escalations > 0 && (
              <Badge variant="outline" className="text-[10px] bg-danger/10 text-danger border-danger/40 gap-1">
                <Zap className="h-3 w-3" /> {escalations} escalating
              </Badge>
            )}
          </h1>
          <p className="text-xs text-muted-foreground">
            Work top-down. Every lead has a Next Best Action. Nothing falls through.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <QuickAddLead defaultTcmId={tcmFilter !== "all" ? tcmFilter : currentTcmId} />
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="h-8 pl-7 text-xs w-52"
              placeholder="Search lead or phone"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Select value={tcmFilter} onValueChange={setTcmFilter}>
            <SelectTrigger className="h-8 text-xs w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All TCMs</SelectItem>
              {tcms.map((t) => (
                <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              className={`h-8 px-2 text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1 ${view === "stack" ? "bg-accent text-accent-foreground" : "bg-card text-muted-foreground"}`}
              onClick={() => setView("stack")}>
              <ListOrdered className="h-3 w-3" /> Stack
            </button>
            <button
              className={`h-8 px-2 text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1 ${view === "board" ? "bg-accent text-accent-foreground" : "bg-card text-muted-foreground"}`}
              onClick={() => setView("board")}>
              <LayoutGrid className="h-3 w-3" /> Board
            </button>
          </div>
        </div>
      </div>

      {/* ---------------- Live counters ---------------- */}
      <div className="grid grid-cols-3 gap-2">
        <Counter label="Tours today" got={counters.toursToday} target={targets.toursToday} tone={tone(counters.toursToday, targets.toursToday)} icon={Calendar} />
        <Counter label="Quotes this week" got={counters.quotesWeek} target={targets.quotesWeek} tone={tone(counters.quotesWeek, targets.quotesWeek)} icon={FileText} />
        <Counter label="Bookings this month" got={counters.bookingsMonth} target={targets.bookingsMonth} tone={tone(counters.bookingsMonth, targets.bookingsMonth)} icon={Target} />
      </div>

      {/* ---------------- Bulk copy strip — one tap to WhatsApp ---------------- */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-dashed border-border bg-muted/20 px-2 py-1.5">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          Copy to WhatsApp
        </span>
        <CopyChip
          size="xs"
          label={`Inbox (${boardBuckets.inbox.length})`}
          text={leadsBlock(boardBuckets.inbox.map((e) => e.lead), tcms, "Inbox")}
        />
        <CopyChip
          size="xs"
          label={`Tours today (${tours.filter((t) => isToday(t.scheduledAt) && t.status === "scheduled").length})`}
          text={toursBlock(
            tours.filter((t) => isToday(t.scheduledAt) && t.status === "scheduled"),
            leads, properties, tcms, "Tours today",
          )}
        />
        <CopyChip
          size="xs"
          label={`Scheduled (${boardBuckets.scheduled.length})`}
          text={leadsBlock(boardBuckets.scheduled.map((e) => e.lead), tcms, "Tours scheduled")}
        />
        <CopyChip
          size="xs"
          label={`Quoted (${boardBuckets.quoted.length})`}
          text={leadsBlock(boardBuckets.quoted.map((e) => e.lead), tcms, "Quoted")}
        />
        <CopyChip
          size="xs"
          label={`Booked (${boardBuckets.booked.length})`}
          text={leadsBlock(boardBuckets.booked.map((e) => e.lead), tcms, "Booked")}
        />
        <CopyChip
          size="xs"
          label={`All visible (${filtered.length})`}
          text={leadsBlock(filtered.map((e) => e.lead), tcms, "All visible leads")}
        />
      </div>

      {/* ---------------- Today's Focus Inventory + Message Lab ---------------- */}
      <FocusInventoryStrip tcmFilter={tcmFilter} />

      {/* ---------------- Filter chips ---------------- */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <Chip active={intent === "all"} onClick={() => setIntent("all")}>All</Chip>
        <Chip active={intent === "hot"} onClick={() => setIntent("hot")} tone="danger"><Flame className="h-3 w-3" /> Hot</Chip>
        <Chip active={intent === "warm"} onClick={() => setIntent("warm")} tone="warning">Warm</Chip>
        <Chip active={intent === "cold"} onClick={() => setIntent("cold")}>Cold</Chip>
        <span className="text-muted-foreground/40">·</span>
        <Chip active={onlyOverdue} onClick={() => setOnlyOverdue((v) => !v)} tone="danger">
          Escalating
        </Chip>
        <Chip active={onlyTourToday} onClick={() => setOnlyTourToday((v) => !v)} tone="warning">
          Tour today
        </Chip>
        <Chip active={onlyQuotePending} onClick={() => setOnlyQuotePending((v) => !v)}>
          Quote pending
        </Chip>
        <MessageLabButton tcms={tcms} />
        <span className="ml-auto text-[10px] text-muted-foreground">
          {filtered.length} lead{filtered.length !== 1 ? "s" : ""} in queue
        </span>
      </div>

      {/* ---------------- View ---------------- */}
      {view === "stack" ? (
        <div className="space-y-2">
          {stackSorted.length === 0 && (
            <div className="rounded-lg border border-border bg-card p-10 text-center text-xs text-muted-foreground">
              Queue clear. Add a lead or relax 🌱
            </div>
          )}
          {stackSorted.map((e, i) => (
            <LeadRow key={e.lead.id} rank={i + 1} enriched={e} tcms={tcms} properties={properties} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          {COLUMNS.map((c) => (
            <div key={c.key} className={`rounded-lg border-l-2 ${c.tint} border-t border-r border-b border-border bg-muted/20 p-2 min-h-[300px]`}>
              <div className="flex items-center justify-between px-1 pb-2">
                <div className="text-[11px] font-semibold flex items-center gap-1.5">
                  <c.icon className="h-3 w-3" /> {c.label}
                </div>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {boardBuckets[c.key].length}
                </span>
              </div>
              <div className="space-y-2">
                {boardBuckets[c.key].length === 0 && (
                  <div className="text-[11px] italic text-muted-foreground px-2 py-6 text-center">
                    Nothing here.
                  </div>
                )}
                {boardBuckets[c.key].map((e) => (
                  <LeadRow key={e.lead.id} enriched={e} tcms={tcms} properties={properties} compact />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Atoms                                                             */
/* ================================================================== */

function Counter({
  label, got, target, tone, icon: Icon,
}: { label: string; got: number; target: number; tone: string; icon: typeof Calendar }) {
  const pct = Math.min(100, Math.round((got / Math.max(target, 1)) * 100));
  return (
    <div className={`rounded-lg border ${tone} p-3`}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1.5">
          <Icon className="h-3 w-3" /> {label}
        </div>
        <span className="text-[10px] font-mono opacity-80">{got}/{target}</span>
      </div>
      <div className="text-2xl font-display font-semibold mt-1">{got}</div>
      <div className="h-1 rounded-full bg-background/40 mt-1 overflow-hidden">
        <div className="h-full bg-current opacity-70" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Chip({
  active, onClick, children, tone = "default",
}: {
  active: boolean; onClick: () => void; children: React.ReactNode;
  tone?: "default" | "danger" | "warning";
}) {
  const base = "h-6 px-2 rounded-full text-[10px] uppercase tracking-wider font-semibold border flex items-center gap-1 transition";
  const activeStyle =
    tone === "danger" ? "bg-danger text-danger-foreground border-danger" :
    tone === "warning" ? "bg-warning text-warning-foreground border-warning" :
    "bg-foreground text-background border-foreground";
  return (
    <button
      onClick={onClick}
      className={`${base} ${active ? activeStyle : "bg-card text-muted-foreground border-border hover:border-foreground/40"}`}>
      {children}
    </button>
  );
}

/* ================================================================== */
/*  Lead row — collapses to summary, expands to Command Mode            */
/* ================================================================== */

type EnrichedLite = {
  lead: Lead; openTour?: Tour; lastQuote?: Quotation;
  nba: NextBestAction; score: number; column: ColumnKey;
};

function LeadRow({
  enriched, rank, tcms, properties, compact,
}: {
  enriched: EnrichedLite; rank?: number; tcms: TCM[]; properties: Property[]; compact?: boolean;
}) {
  const { lead, openTour, lastQuote, nba, column } = enriched;
  const tours = useApp((s) => s.tours);
  const selectLead = useApp((s) => s.selectLead);
  const openWhatsApp = () => {
    const phoneDigits = lead.phone.replace(/\D/g, "");
    const message = `Hi ${lead.name}, thanks for connecting with Gharpayy! We have great PG options matching your budget.`;
    window.open(`https://wa.me/91${phoneDigits}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };
  const openDrawer = () => selectLead(lead.id, "impact");
  const tcm = tcms.find((t) => t.id === lead.assignedTcmId);
  const property = openTour ? properties.find((p) => p.id === openTour.propertyId) : undefined;
  const colMeta = COLUMNS.find((c) => c.key === column)!;
  const setLeadStage = useApp((s) => s.setLeadStage);
  const STAGES: Lead["stage"][] = [
    "new", "contacted", "tour-scheduled", "tour-done", "negotiation", "booked",
  ];
  const idx = Math.max(0, STAGES.indexOf(lead.stage));
  const shift = (dir: -1 | 1, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = STAGES[Math.min(STAGES.length - 1, Math.max(0, idx + dir))];
    if (next !== lead.stage) {
      setLeadStage(lead.id, next);
      toast.success(`${lead.name.split(" ")[0]} → ${next.replace("-", " ")}`);
    }
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={openDrawer}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openDrawer(); }}
        className={`w-full cursor-pointer text-left rounded-md border bg-card hover:border-accent/60 hover:bg-muted/30 transition-colors px-3 py-2 flex items-center gap-3 group ${compact ? "" : ""}`}>
        {rank !== undefined && (
          <div className="w-7 h-7 rounded-md bg-muted text-[11px] font-mono font-semibold flex items-center justify-center shrink-0 group-hover:bg-accent/20">
            #{rank}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold truncate">{lead.name}</span>
            <Badge variant="outline" className={`text-[9px] uppercase ${intentChip(calculateLeadTemperature(lead, tours, Date.now()))}`}>{calculateLeadTemperature(lead, tours, Date.now())}</Badge>
            {!compact && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <colMeta.icon className="h-2.5 w-2.5" /> {colMeta.label}
              </span>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
            <Phone className="h-2.5 w-2.5" /> {lead.phone}
            <span>·</span><span>{lead.preferredArea}</span>
            {!compact && <><span>·</span><span>{formatINR(lead.budget)}</span></>}
            {tcm && !compact && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-accent/30 text-[8px] font-mono">
                    {tcm.initials}
                  </span>
                  {tcm.name}
                  {tcm.phone && (
                    <a
                      href={`tel:${tcm.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-accent hover:underline"
                      title={`Call ${tcm.name}`}
                    >
                      · {tcm.phone}
                    </a>
                  )}
                </span>
              </>
            )}
          </div>
          {/* NBA chip — always visible so users see the next move at a glance */}
          <div className={`mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${pressureColor(nba.pressure)}`}>
            <Sparkles className="h-2.5 w-2.5" /> {nba.label}
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={(e) => { e.stopPropagation(); openWhatsApp(); }}
            title="Open WhatsApp"
            className="h-6 w-6 rounded border border-emerald-600/40 bg-emerald-600/10 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-colors flex items-center justify-center"
          >
            <MessageSquare className="h-3 w-3" />
          </button>
          <CopyChip
            size="xs"
            iconOnly
            variant="ghost"
            label="Copy lead"
            text={
              `${lead.name} · ${lead.phone} · ${lead.preferredArea || "—"} · ${formatINR(lead.budget)}/mo · ${lead.stage}` +
              (tcm ? ` · TCM: ${tcm.name}` : "") +
              (property && openTour ? `\nTour: ${property.name} (${property.area}) · ${fmtWhen(openTour.scheduledAt)}` : "") +
              `\nNext: ${nba.label}`
            }
          />
          <button
            onClick={(e) => shift(-1, e)}
            disabled={idx === 0}
            title={`Move back · current: ${lead.stage}`}
            className="h-6 w-6 rounded border border-border bg-card hover:border-accent/60 hover:bg-accent/10 disabled:opacity-30 flex items-center justify-center"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <span className="text-[9px] font-mono text-muted-foreground w-7 text-center hidden sm:block">
            {idx + 1}/{STAGES.length}
          </span>
          <button
            onClick={(e) => shift(1, e)}
            disabled={idx === STAGES.length - 1}
            title={`Move forward · current: ${lead.stage}`}
            className="h-6 w-6 rounded border border-border bg-card hover:border-accent/60 hover:bg-accent/10 disabled:opacity-30 flex items-center justify-center"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </>
  );
}

/* ================================================================== */
/*  Lead Drawer — every action for one lead lives here                 */
/* ================================================================== */

const InterestedPropertiesPicker = LeadInterestedPropertiesPicker;

function LeadDrawer({
  open, onOpenChange, enriched, tcm, property,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  enriched: EnrichedLite;
  tcm?: TCM;
  property?: Property;
}) {
  const { lead, openTour, lastQuote, nba, column } = enriched;
  const tours = useApp((s) => s.tours);
  const colMeta = COLUMNS.find((c) => c.key === column)!;
  const [now, mounted] = useMountedNow(30_000);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 flex flex-col gap-0 overflow-hidden bg-gradient-to-b from-card via-card to-background"
      >
        {/* Glossy header */}
        <SheetHeader className="relative px-5 pt-5 pb-3 border-b border-border space-y-2 bg-gradient-to-br from-accent/10 via-card to-primary/5 backdrop-blur-xl">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
          <div className="flex items-center gap-2 flex-wrap">
            <SheetTitle className="text-base font-display">{lead.name}</SheetTitle>
            <Badge variant="outline" className={`text-[9px] uppercase ${intentChip(calculateLeadTemperature(lead, tours, Date.now()))}`}>{calculateLeadTemperature(lead, tours, Date.now())}</Badge>
            <Badge variant="outline" className="text-[9px] uppercase gap-1">
              <colMeta.icon className="h-2.5 w-2.5" /> {colMeta.label}
            </Badge>
          </div>
          <SheetDescription className="text-[11px] flex items-center gap-1 flex-wrap">
            <Phone className="h-3 w-3" /> {lead.phone}
            <span>·</span><span>{lead.preferredArea}</span>
            <span>·</span><span>{formatINR(lead.budget)}</span>
            {tcm && <><span>·</span><span>TCM: {tcm.name}</span></>}
          </SheetDescription>

          {/* NBA banner */}
          <div className={`rounded-md border px-3 py-2 ${pressureColor(nba.pressure)}`}>
            <div className="text-[10px] uppercase tracking-wider opacity-70">Next best action</div>
            <div className="text-sm font-semibold">{nba.label}</div>
            <div className="text-[10px] opacity-80">{nba.reason}</div>
          </div>

          {/* Context badges */}
          {(openTour || lastQuote) && (
            <div className="flex flex-wrap gap-1.5">
              {openTour && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Calendar className="h-3 w-3" />
                  {property?.name ?? "Property"} · {fmtTime(openTour.scheduledAt)} ({mounted ? fmtRel(openTour.scheduledAt, now) : "—"})
                </Badge>
              )}
              {lastQuote && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <FileText className="h-3 w-3" />
                  {formatINR(lastQuote.discountedPrice)} · {lastQuote.propertyName} · {lastQuote.status}
                </Badge>
              )}
            </div>
          )}
        </SheetHeader>

        {/* Body — scrollable, all actions in one place */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-3">
            <SmartDossier lead={lead} />
          </div>
          <div className="mb-3">
            <LeadPropertyDossier lead={lead} />
          </div>
          <CommandActions
            lead={lead}
            tcm={tcm}
            openTour={openTour}
            lastQuote={lastQuote}
            property={property}
            column={column}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ================================================================== */
/*  Command Actions — the full toolbelt for a single lead             */
/* ================================================================== */

export function CommandActions({
  lead, tcm, openTour, lastQuote, property, column,
}: {
  lead: Lead; tcm?: TCM; openTour?: Tour; lastQuote?: Quotation;
  property?: Property; column: ColumnKey;
}) {
  const completeTour = useApp((s) => s.completeTour);
  const setStatus = useQuotations((s) => s.setStatus);
  const setLeadIntent = useApp((s) => s.setLeadIntent);
  const setLeadStage = useApp((s) => s.setLeadStage);
  const logCall = useApp((s) => s.logCall);
  const checkin = useCheckins((s) => s.checkins.find((c) => c.leadId === lead.id));
  const [now, mounted] = useMountedNow(30_000);

  const tcmPhone = useTcmContacts((s) => s.phones[tcm?.id ?? ""]);

  const baseCtx: ImpactTplCtx = useMemo(() => ({
    leadName: lead.name.split(" ")[0],
    agentName: tcm?.name,
    agentPhone: tcmPhone,
    propertyName: property?.name ?? lastQuote?.propertyName,
    propertyAddress: property?.area,
    tourWhen: openTour ? fmtWhen(openTour.scheduledAt) : undefined,
    roomType: lastQuote?.roomType,
    price: lastQuote?.discountedPrice,
    altPrice: lastQuote ? Math.max(0, lastQuote.discountedPrice - 1500) : undefined,
    area: lead.preferredArea,
    budget: lead.budget,
    moveIn: fmtDate(lead.moveInDate),
  }), [lead, tcm, tcmPhone, property, lastQuote, openTour]);

  /* primary scenario picker (changes with state) */
  const primaryScenario: ImpactScenario = useMemo(() => {
    if (lastQuote?.status === "paid") return "booking-confirm";
    if (lastQuote?.status === "sent") return "quote-followup";
    if (lead.stage === "negotiation") return "negotiate-hold";
    if (openTour) {
      if (!mounted) return "tour-confirm";
      const mins = (+new Date(openTour.scheduledAt) - now) / 60000;
      if (mins < -30) return "quote-followup";
      if (mins < 60 * 4) return "tour-reminder";
      return "tour-confirm";
    }
    if (lead.stage === "dropped") return "revival";
    return "first-touch";
  }, [lead.stage, lastQuote, openTour, mounted, now]);

  return (
    <div className="space-y-3">
      {/* Interested properties — what the lead is leaning toward */}
      <InterestedPropertiesPicker lead={lead} />

      {/* Template messenger */}
      <TemplateMessenger
        leadPhone={lead.phone}
        initialScenario={primaryScenario}
        ctx={baseCtx}
      />

      {/* Action toolbar — context-aware */}
      <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border">
        {column === "inbox" && <ScheduleTourDialog lead={lead} />}

        {column === "scheduled" && openTour && (
          <>
            <ConfirmTourButton lead={lead} tour={openTour} />
            <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1"
              onClick={() => { completeTour(openTour.id); toast.success("Tour marked started"); }}>
              <UserCheck className="h-3 w-3" /> Mark started
            </Button>
          </>
        )}

        {column === "onTour" && openTour && (
          <>
            <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1"
              onClick={() => { completeTour(openTour.id); toast.success("Tour completed"); }}>
              <CheckCircle2 className="h-3 w-3" /> Tour done
            </Button>
          </>
        )}

        {column === "quoted" && lastQuote && (
          <>
            {lastQuote.status === "sent" && (
              <>
                <Button size="sm" className="h-7 text-[10px] gap-1"
                  onClick={() => { setStatus(lastQuote.id, "paid"); toast.success("Quote accepted · paid"); }}>
                  <Wallet className="h-3 w-3" /> Mark paid
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[10px]"
                  onClick={() => { setStatus(lastQuote.id, "not-paid"); toast("Marked not paid"); }}>
                  Not paid
                </Button>
              </>
            )}
            <BookingDialog lead={lead} quote={lastQuote} openTour={openTour} />
          </>
        )}

        {column === "booked" && (
          <div className="text-[10px] text-success font-medium flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Closed
          </div>
        )}

        {/* Always-available — Quote sits next to Negotiate so the pair is one motion */}
        <NegotiationPlaybook lead={lead} leadPhone={lead.phone} ctx={baseCtx} />
        <QuotationDialog lead={lead} label={lastQuote ? "Re-quote" : "Quotation"} />
        <Button size="sm" variant="ghost" className="h-7 text-[10px] gap-1"
          onClick={() => { logCall(lead.id); toast.success("Call logged"); }}>
          <Phone className="h-3 w-3" /> Log call
        </Button>
        <DirectBookButton lead={lead} openTour={openTour} />
        <CheckInOpsButton lead={lead} property={property} quote={lastQuote} existing={checkin} />
      </div>

      {checkin && <CheckInAuditReport checkin={checkin} lead={lead} compact />}

      {/* Tier override */}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        Override intent:
        {(["hot", "warm", "cold"] as const).map((t) => (
          <button key={t}
            onClick={() => { setLeadIntent(lead.id, t); toast.success(`Intent → ${t}`); }}
            className={`px-2 py-0.5 rounded-full border uppercase tracking-wider ${lead.intent === t ? intentChip(t) : "border-border"}`}>
            {t}
          </button>
        ))}
        <span className="mx-1">·</span>
        {lead.stage !== "dropped" && (
          <button onClick={() => { setLeadStage(lead.id, "dropped"); toast("Lead dropped"); }}
            className="px-2 py-0.5 rounded-full border border-border hover:text-danger">
            Drop
          </button>
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Template Messenger — 3+ variants per scenario, copy + send         */
/* ================================================================== */

function TemplateMessenger({
  leadPhone, initialScenario, ctx,
}: {
  leadPhone: string; initialScenario: ImpactScenario; ctx: ImpactTplCtx;
}) {
  const [scenario, setScenario] = useState<ImpactScenario>(initialScenario);
  const variants = IMPACT_TEMPLATES[scenario];
  const [tplId, setTplId] = useState<string>(variants[0].id);
  const tpl = variants.find((v) => v.id === tplId) ?? variants[0];
  const [draft, setDraft] = useState(renderImpactTemplate(tpl, ctx));

  // re-render when scenario / template changes
  const apply = (s: ImpactScenario, id?: string) => {
    const next = IMPACT_TEMPLATES[s];
    const chosen = next.find((v) => v.id === id) ?? next[0];
    setScenario(s);
    setTplId(chosen.id);
    setDraft(renderImpactTemplate(chosen, ctx));
  };
  const reset = () => setDraft(renderImpactTemplate(tpl, ctx));

  const copy = () => copyText(draft);
  const send = () => openWhatsApp(leadPhone, draft);

  const scenarioLabel: Record<ImpactScenario, string> = {
    "first-touch": "First touch",
    "tour-confirm": "Tour confirm",
    "tour-reminder": "Tour reminder",
    "tour-noshow": "No-show recovery",
    "quote-followup": "Quote follow-up",
    "negotiate-hold": "Negotiate · hold",
    "negotiate-alt": "Negotiate · alt room",
    "negotiate-floor": "Negotiate · floor",
    "booking-confirm": "Booking confirm",
    revival: "Revival",
  };

  return (
    <div className="rounded-md border border-border bg-card/60 p-2 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          WhatsApp template
        </div>
        <Select value={scenario} onValueChange={(v) => apply(v as ImpactScenario)}>
          <SelectTrigger className="h-7 text-[11px] w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(IMPACT_TEMPLATES) as ImpactScenario[]).map((k) => (
              <SelectItem key={k} value={k} className="text-xs">{scenarioLabel[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-1">
        {variants.map((v) => (
          <button key={v.id}
            onClick={() => apply(scenario, v.id)}
            className={`h-6 px-2 rounded text-[10px] uppercase tracking-wider font-semibold border ${tpl.id === v.id ? "bg-accent text-accent-foreground border-accent" : "bg-card text-muted-foreground border-border hover:border-foreground/40"}`}>
            {v.label}
          </button>
        ))}
      </div>

      <Textarea
        rows={6}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="text-[12px] font-mono leading-relaxed"
      />

      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" className="h-7 text-[10px] gap-1" onClick={send}>
          <ExternalLink className="h-3 w-3" /> Send via WhatsApp
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={copy}>
          <ClipboardCopy className="h-3 w-3" /> Copy text
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={reset}>
          Reset
        </Button>
        {!ctx.agentPhone && (
          <span className="text-[10px] text-warning self-center">
            ⚠ Set the TCM phone (in “Confirm tour”) so it auto-fills
          </span>
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Negotiation playbook — 3 scripted paths                            */
/* ================================================================== */

function NegotiationPlaybook({
  lead, leadPhone, ctx,
}: { lead: Lead; leadPhone: string; ctx: ImpactTplCtx }) {
  const [open, setOpen] = useState(false);
  const setLeadStage = useApp((s) => s.setLeadStage);

  const send = (msg: string, label: string) => {
    openWhatsApp(leadPhone, msg);
    setLeadStage(lead.id, "negotiation");
    toast.success(`${label} sent`);
  };

  const paths: { key: ImpactScenario; title: string; tag: string }[] = [
    { key: "negotiate-hold",  title: "Hold price · add value", tag: "Keep rent, sweeten the deal" },
    { key: "negotiate-alt",   title: "Alternate room/property", tag: "Lower-priced swap" },
    { key: "negotiate-floor", title: "Floor price offer",       tag: "Manager-approved minimum" },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1">
          <Sparkles className="h-3 w-3" /> Negotiate
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm">Negotiation playbook · {lead.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {paths.map((p) => (
            <div key={p.key} className="border border-border rounded-lg p-3 space-y-2">
              <div>
                <div className="text-xs font-semibold">{p.title}</div>
                <div className="text-[10px] text-muted-foreground">{p.tag}</div>
              </div>
              <div className="space-y-1.5">
                {IMPACT_TEMPLATES[p.key].map((tpl) => {
                  const msg = renderImpactTemplate(tpl, ctx);
                  return (
                    <div key={tpl.id} className="rounded bg-muted/40 p-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-[9px] uppercase">{tpl.label}</Badge>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1"
                            onClick={() => copyText(msg, "Copied")}>
                            <ClipboardCopy className="h-3 w-3" /> Copy
                          </Button>
                          <Button size="sm" className="h-6 text-[10px] gap-1"
                            onClick={() => send(msg, tpl.label)}>
                            <Send className="h-3 w-3" /> Send
                          </Button>
                        </div>
                      </div>
                      <div className="text-[11px] whitespace-pre-wrap font-mono leading-relaxed">{msg}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ================================================================== */
/*  Quick Add Lead                                                    */
/* ================================================================== */

function QuickAddLead({ defaultTcmId }: { defaultTcmId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" className="h-8 text-xs gap-1" onClick={() => setOpen(true)}>
        <Plus className="h-3 w-3" /> Add lead
      </Button>
      <LeadCreateSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

/* ================================================================== */
/*  Schedule Tour                                                     */
/* ================================================================== */

function ScheduleTourDialog({ lead }: { lead: Lead }) {
  const properties = useApp((s) => s.properties);
  const tcms = useApp((s) => s.tcms);
  const scheduleTour = useApp((s) => s.scheduleTour);
  const setLeadStage = useApp((s) => s.setLeadStage);
  const addProperty = useApp((s) => s.addProperty);

  const focus = useLeadFocus(lead);
  const dossier = useDossierReadiness(lead);
  const [open, setOpen] = useState(false);
  const [tcmId, setTcmId] = useState(focus.tcmId || lead.assignedTcmId);
  const [propQuery, setPropQuery] = useState(focus.propertyName ?? "");
  const [propId, setPropId] = useState(focus.propertyId ?? "");
  const [newProp, setNewProp] = useState(false);
  const [newName, setNewName] = useState("");
  const [newArea, setNewArea] = useState(lead.preferredArea);
  const [newPrice, setNewPrice] = useState(focus.amount || lead.budget);
  const today = todayISO();
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("11:00");

  // Re-seed when the dialog opens, so newly-arrived quotes/check-ins flow in.
  useEffect(() => {
    if (!open) return;
    if (focus.propertyId) setPropId((cur) => cur || focus.propertyId!);
    if (focus.propertyName) setPropQuery((cur) => cur || focus.propertyName!);
    if (focus.tcmId) setTcmId((cur) => cur || focus.tcmId);
    if (focus.amount) setNewPrice((cur) => cur || focus.amount);
  }, [open, focus.propertyId, focus.propertyName, focus.tcmId, focus.amount]);

  const filtered = useMemo(() => {
    const q = propQuery.trim().toLowerCase();
    if (!q) return properties.slice(0, 6);
    return properties
      .filter((p) => p.name.toLowerCase().includes(q) || p.area.toLowerCase().includes(q))
      .slice(0, 6);
  }, [properties, propQuery]);

  const handleAddProp = () => {
    const name = newName.trim() || propQuery.trim();
    if (!name) return toast.error("Property name required");
    const created = addProperty({ name, area: newArea || "—", pricePerBed: newPrice || 12000, totalBeds: 1, vacantBeds: 1 });
    setPropId(created.id);
    setPropQuery(name);
    setNewProp(false);
    toast.success(`Added ${name}`);
  };

  const handleSchedule = () => {
    if (!propId) return toast.error("Pick a property");
    if (!dossier.ready) {
      toast.warning(`Dossier ${dossier.filledCount}/${dossier.totalCount} — scheduling anyway`, {
        description: `Still missing: ${dossier.missing.join(", ")}`,
      });
    }
    const iso = new Date(`${date}T${time}:00`).toISOString();
    scheduleTour({ leadId: lead.id, propertyId: propId, tcmId, scheduledAt: iso });
    setLeadStage(lead.id, "tour-scheduled");
    toast.success("Tour scheduled");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-7 text-[10px] gap-1">
          <Calendar className="h-3 w-3" /> Schedule
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-sm">Schedule tour · {lead.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!dossier.ready && (
            <div className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-[11px] text-warning">
              <div className="font-semibold">Dossier incomplete ({dossier.filledCount}/{dossier.totalCount})</div>
              <div className="text-warning/80">Fill before scheduling: {dossier.missing.join(", ")}</div>
            </div>
          )}
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Property</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="h-8 pl-7 text-xs" placeholder="Search or type new name…"
                value={propQuery}
                onChange={(e) => { setPropQuery(e.target.value); setPropId(""); }}
              />
            </div>
            {!newProp && (
              <div className="max-h-40 overflow-y-auto mt-1 space-y-1">
                {filtered.map((p) => (
                  <button key={p.id}
                    onClick={() => { setPropId(p.id); setPropQuery(p.name); }}
                    className={`w-full text-left text-xs px-2 py-1.5 rounded border ${propId === p.id ? "bg-primary/10 border-primary/40" : "border-border hover:bg-muted/50"}`}>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-[10px] text-muted-foreground">{p.area} · {p.vacantBeds} vacant</div>
                  </button>
                ))}
                {filtered.length === 0 && propQuery && (
                  <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1"
                    onClick={() => { setNewName(propQuery); setNewProp(true); }}>
                    <Plus className="h-3 w-3" /> Add "{propQuery}" as new
                  </Button>
                )}
              </div>
            )}
            {newProp && (
              <div className="space-y-2 mt-2 border-t border-border pt-2">
                <Input className="h-8 text-xs" placeholder="Property name" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <Input className="h-8 text-xs" placeholder="Area" value={newArea} onChange={(e) => setNewArea(e.target.value)} />
                  <Input className="h-8 text-xs" type="number" placeholder="Price/bed" value={newPrice} onChange={(e) => setNewPrice(Number(e.target.value))} />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs flex-1" onClick={handleAddProp}>Save</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setNewProp(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>

          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Assign to</Label>
            <Select value={tcmId} onValueChange={setTcmId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {tcms.map((t) => <SelectItem key={t.id} value={t.id} className="text-xs">{t.name} · {t.zone}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Date</Label>
              <Input type="date" className="h-8 text-xs" value={date} onChange={(e) => setDate(e.target.value)} min={today} />
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Time</Label>
              <Input type="time" className="h-8 text-xs" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          <Button className="w-full h-8 text-xs" onClick={handleSchedule}>
            {dossier.ready ? "Schedule tour" : `Schedule tour (dossier ${dossier.filledCount}/${dossier.totalCount})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ================================================================== */
/*  Confirm tour → send TCM details (with phone save)                  */
/* ================================================================== */

function ConfirmTourButton({ lead, tour }: { lead: Lead; tour: Tour }) {
  const tcm = useApp((s) => s.tcms.find((t) => t.id === tour.tcmId));
  const property = useApp((s) => s.properties.find((p) => p.id === tour.propertyId));
  const phones = useTcmContacts((s) => s.phones);
  const setPhone = useTcmContacts((s) => s.setPhone);
  const [open, setOpen] = useState(false);
  const [phone, setPhoneLocal] = useState(phones[tour.tcmId] ?? "");

  const message = useMemo(() => {
    const tpl = IMPACT_TEMPLATES["tour-confirm"][0];
    return renderImpactTemplate(tpl, {
      leadName: lead.name.split(" ")[0],
      agentName: tcm?.name ?? "Gharpayy TCM",
      agentPhone: phone || "(coming soon)",
      propertyName: property?.name ?? "Property",
      tourWhen: fmtWhen(tour.scheduledAt),
    });
  }, [lead, tour, property, tcm, phone]);

  const handleSend = () => {
    if (phone) setPhone(tour.tcmId, phone);
    openWhatsApp(lead.phone, message);
    toast.success("Confirmation ready");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1">
          <Send className="h-3 w-3" /> Confirm tour
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-sm">Confirm tour to {lead.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">TCM phone (saved for next time)</Label>
            <Input className="h-8 text-xs" placeholder="+91 9xxxxxxxxx" value={phone}
              onChange={(e) => setPhoneLocal(e.target.value)} />
          </div>
          <div className="rounded-lg p-3" style={{ background: "#075E54" }}>
            <div className="rounded-xl px-3 py-2 text-[12px] whitespace-pre-wrap font-mono"
              style={{ background: "#DCF8C6", color: "#111", borderRadius: "12px 12px 2px 12px" }}>
              {message}
            </div>
          </div>
          <Button className="w-full h-8 text-xs gap-1" onClick={handleSend}>
            <ExternalLink className="h-3 w-3" /> Send via WhatsApp
          </Button>
          <ReminderRow tour={tour} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReminderRow({ tour }: { tour: Tour }) {
  const addFollowUp = useApp((s) => s.addFollowUp);
  const opts = [
    { label: "2 h before", min: 120 },
    { label: "1 h before", min: 60 },
    { label: "30 m before", min: 30 },
  ];
  const set = (min: number) => {
    const due = new Date(+new Date(tour.scheduledAt) - min * 60_000).toISOString();
    addFollowUp({
      leadId: tour.leadId, tourId: tour.id, tcmId: tour.tcmId,
      dueAt: due, priority: "high", reason: `Tour reminder · ${opts.find((o) => o.min === min)?.label}`,
    });
    toast.success("Reminder set");
  };
  return (
    <div className="border-t border-border pt-2">
      <div className="text-[10px] uppercase text-muted-foreground font-semibold mb-1 flex items-center gap-1">
        <Timer className="h-2.5 w-2.5" /> Reminder
      </div>
      <div className="flex gap-1">
        {opts.map((o) => (
          <Button key={o.min} size="sm" variant="outline" className="h-7 text-[10px] flex-1" onClick={() => set(o.min)}>
            {o.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Quotation dialog                                                  */
/* ================================================================== */

function QuotationDialog({
  lead, label = "Send quotation", variant = "default",
}: { lead: Lead; label?: string; variant?: "default" | "ghost" }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={variant === "ghost" ? "ghost" : "default"} className="h-7 text-[10px] gap-1">
          <FileText className="h-3 w-3" /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-sm">Quotation · {lead.name}</DialogTitle></DialogHeader>
        <QuotationBuilder lead={lead} />
      </DialogContent>
    </Dialog>
  );
}

/* ================================================================== */
/*  Booking dialog (from quote) + Direct book                         */
/* ================================================================== */

function BookingDialog({
  lead, quote, openTour,
}: { lead: Lead; quote: Quotation; openTour?: Tour }) {
  const closeDeal = useApp((s) => s.closeDeal);
  const upsertCheckin = useCheckins((s) => s.upsert);
  const [open, setOpen] = useState(false);
  const [amt, setAmt] = useState(quote.discountedPrice);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-7 text-[10px] gap-1 bg-success text-success-foreground hover:bg-success/90">
          <CheckCircle2 className="h-3 w-3" /> Book
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="text-sm">Close booking · {lead.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-[11px] text-muted-foreground">
            {quote.propertyName} · {quote.roomType}{quote.roomNumber ? ` #${quote.roomNumber}` : ""}
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Monthly rent</Label>
            <Input type="number" className="h-8 text-xs" value={amt} onChange={(e) => setAmt(Number(e.target.value))} />
          </div>
          <div className="text-[10px] text-muted-foreground">
            Prebook collected: {formatINR(quote.prebook)} · Deposit: {formatINR(quote.deposit)}
          </div>
          <Button className="w-full h-8 text-xs"
            onClick={() => {
              closeDeal({
                leadId: lead.id,
                tourId: openTour?.id ?? "manual",
                propertyId: quote.propertyId ?? openTour?.propertyId ?? "",
                tcmId: lead.assignedTcmId,
                amount: amt,
              });
              upsertCheckin({
                leadId: lead.id,
                rent: amt,
                deposit: quote.deposit,
                propertyId: quote.propertyId ?? openTour?.propertyId,
                propertyName: quote.propertyName,
              });
              toast.success("Booking closed");
              setOpen(false);
            }}>
            Confirm booking
          </Button>
          {!openTour && (
            <div className="text-[10px] text-warning">
              No tour found — booking will be marked as direct.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---- Direct Book — single-shot for any lead at any stage --------- */

function DirectBookButton({ lead, openTour }: { lead: Lead; openTour?: Tour }) {
  const properties = useApp((s) => s.properties);
  const closeDeal = useApp((s) => s.closeDeal);
  const addProperty = useApp((s) => s.addProperty);
  const upsertCheckin = useCheckins((s) => s.upsert);
  const patchCheckin = useCheckins((s) => s.patch);

  const focus = useLeadFocus(lead);
  const [open, setOpen] = useState(false);
  const [propQuery, setPropQuery] = useState(focus.propertyName ?? "");
  const [propId, setPropId] = useState(focus.propertyId ?? openTour?.propertyId ?? "");
  const [rent, setRent] = useState(focus.amount || lead.budget);
  const [moveIn, setMoveIn] = useState(
    focus.checkin?.checkInDate
      ? focus.checkin.checkInDate.slice(0, 10)
      : todayISO(),
  );
  const [mode, setMode] = useState<"upi" | "card" | "cash" | "bank">("upi");

  // Re-seed when the dialog opens or upstream data (quote/tour/check-in) changes.
  useEffect(() => {
    if (!open) return;
    if (focus.propertyId) setPropId((cur) => cur || focus.propertyId!);
    if (focus.propertyName) setPropQuery((cur) => cur || focus.propertyName!);
    if (focus.amount) setRent((cur) => cur || focus.amount);
  }, [open, focus.propertyId, focus.propertyName, focus.amount]);

  const filtered = useMemo(() => {
    const q = propQuery.trim().toLowerCase();
    if (!q) return properties.slice(0, 6);
    return properties
      .filter((p) => p.name.toLowerCase().includes(q) || p.area.toLowerCase().includes(q))
      .slice(0, 6);
  }, [properties, propQuery]);

  const submit = () => {
    let pid = propId;
    if (!pid && propQuery.trim()) {
      const created = addProperty({
        name: propQuery.trim(), area: lead.preferredArea, pricePerBed: rent,
        totalBeds: 1, vacantBeds: 1,
      });
      pid = created.id;
    }
    if (!pid) return toast.error("Pick or add a property");
    closeDeal({
      leadId: lead.id,
      tourId: openTour?.id ?? "direct",
      propertyId: pid,
      tcmId: lead.assignedTcmId,
      amount: rent,
    });
    const prop = properties.find((p) => p.id === pid);
    const ci = upsertCheckin({ leadId: lead.id, rent, propertyId: pid, propertyName: prop?.name ?? propQuery.trim() });
    if (moveIn) patchCheckin(ci.id, { checkInDate: new Date(moveIn).toISOString() });
    toast.success(`Direct booking · ${lead.name} · ${formatINR(rent)}`);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1">
          <Wallet className="h-3 w-3" /> Direct book
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-sm">Direct book · {lead.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-[10px] text-muted-foreground">
            Skip the funnel. Use this when the lead is ready right now.
          </p>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Property</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="h-8 pl-7 text-xs" placeholder="Search or type new"
                value={propQuery}
                onChange={(e) => { setPropQuery(e.target.value); setPropId(""); }}
              />
            </div>
            <div className="max-h-32 overflow-y-auto mt-1 space-y-1">
              {filtered.map((p) => (
                <button key={p.id}
                  onClick={() => { setPropId(p.id); setPropQuery(p.name); setRent(p.pricePerBed); }}
                  className={`w-full text-left text-xs px-2 py-1.5 rounded border ${propId === p.id ? "bg-primary/10 border-primary/40" : "border-border hover:bg-muted/50"}`}>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-[10px] text-muted-foreground">{p.area} · {formatINR(p.pricePerBed)}/bed</div>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Monthly rent">
              <Input type="number" className="h-8 text-xs" value={rent} onChange={(e) => setRent(Number(e.target.value))} />
            </Field>
            <Field label="Move-in">
              <Input type="date" className="h-8 text-xs" value={moveIn} onChange={(e) => setMoveIn(e.target.value)} />
            </Field>
          </div>
          <Field label="Payment mode">
            <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="upi" className="text-xs">UPI</SelectItem>
                <SelectItem value="card" className="text-xs">Card</SelectItem>
                <SelectItem value="cash" className="text-xs">Cash</SelectItem>
                <SelectItem value="bank" className="text-xs">Bank transfer</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Button className="w-full h-8 text-xs" onClick={submit}>
            Confirm direct booking
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CheckInOpsButton({
  lead, property, quote, existing,
}: { lead: Lead; property?: Property; quote?: Quotation; existing?: CheckIn }) {
  const properties = useApp((s) => s.properties);
  const upsert = useCheckins((s) => s.upsert);
  const patch = useCheckins((s) => s.patch);
  const setStage = useCheckins((s) => s.setStage);
  const addDelay = useCheckins((s) => s.addDelay);
  const [open, setOpen] = useState(false);
  const [room, setRoom] = useState(existing?.roomNumber ?? quote?.roomNumber ?? "");
  const [date, setDate] = useState(existing?.checkInDate?.slice(0, 10) ?? lead.moveInDate.slice(0, 10));
  const [reason, setReason] = useState<DelayReason>("finance");
  const activeProperty = property ?? properties.find((p) => p.id === existing?.propertyId || p.id === quote?.propertyId) ?? properties[0];
  const checkin = existing;

  const ensure = () => upsert({
    leadId: lead.id,
    rent: quote?.discountedPrice ?? lead.budget,
    deposit: quote?.deposit,
    propertyId: activeProperty?.id,
    propertyName: activeProperty?.name,
  });

  const copyNext = (ci: CheckIn) => {
    const msg = ci.stage === "booked"
      ? waBookingConfirm(lead.name, ci.propertyName)
      : ci.stage === "ack_received"
        ? waTokenRequest(Math.min(5000, Math.max(1000, Math.round(ci.rent * 0.25))))
        : waDateConfirm(ci);
    copyText(msg);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={checkin ? "default" : "outline"} className="h-7 text-[10px] gap-1">
          <KeyRound className="h-3 w-3" /> Check-in
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-sm">Check-in command · {lead.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" className="h-8 text-xs gap-1" onClick={() => { const ci = ensure(); copyNext(ci); toast.success("Check-in wired + WhatsApp text ready"); }}>
              <Sparkles className="h-3 w-3" /> Wire + copy WA
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => { const ci = ensure(); setStage(ci.id, "ack_received"); copyText(waTokenRequest(5000)); }}>
              <MessageSquare className="h-3 w-3" /> Ack received
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Room assign">
              <Input className="h-8 text-xs" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Room #" />
            </Field>
            <Field label="Check-in date">
              <Input className="h-8 text-xs" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <Button size="sm" className="w-full h-8 text-xs gap-1" onClick={() => {
            const ci = ensure();
            patch(ci.id, { roomNumber: room || ci.roomNumber, checkInDate: new Date(date).toISOString(), propertyId: activeProperty?.id, propertyName: activeProperty?.name });
            setStage(ci.id, room ? "room_assigned" : "date_set");
            copyText(waDateConfirm({ ...ci, roomNumber: room || ci.roomNumber, checkInDate: new Date(date).toISOString(), propertyName: activeProperty?.name ?? ci.propertyName }));
            toast.success("Room/date saved");
          }}>
            <CheckCircle2 className="h-3 w-3" /> Save room/date + copy WA
          </Button>
          {checkin?.checkInDate && (
            <div className="rounded-md border border-border p-2 space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Delay control</div>
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" className="h-8 text-xs" value={date} onChange={(e) => setDate(e.target.value)} />
                <Select value={reason} onValueChange={(v) => setReason(v as DelayReason)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{DELAY_REASONS.map((r) => <SelectItem key={r.id} value={r.id} className="text-xs">{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1" onClick={() => {
                addDelay(checkin.id, new Date(date).toISOString(), reason);
                const next = { ...checkin, checkInDate: new Date(date).toISOString(), delays: [...checkin.delays, { to: new Date(date).toISOString(), reason, at: new Date().toISOString() }] };
                copyText(waRescheduleCheckIn(next, DELAY_REASONS.find((r) => r.id === reason)?.label));
                toast.warning("Delay logged · risk updated");
              }}>
                <RotateCcw className="h-3 w-3" /> Log delay + copy WA
              </Button>
            </div>
          )}
          {checkin && <CheckInAuditReport checkin={checkin} lead={lead} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CheckInAuditReport({ checkin, lead, compact = false }: { checkin: CheckIn; lead: Lead; compact?: boolean }) {
  const risk = riskLevel(checkin);
  return (
    <div className="rounded-md border border-border bg-card/70 p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1.5">
          <ScrollText className="h-3 w-3" /> Check-in audit report
        </div>
        <Badge variant="outline" className={`text-[9px] ${RISK_CLASS[risk]}`}>{RISK_LABEL[risk]}</Badge>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
        <AuditMetric label="Stage" value={STAGE_LABEL[checkin.stage]} />
        <AuditMetric label="Room" value={checkin.roomNumber || "Pending"} />
        <AuditMetric label="Balance" value={formatINR(checkin.balanceDue)} />
        <AuditMetric label="Delays" value={String(checkin.delays.length)} danger={checkin.delays.length >= 2} />
      </div>
      {!compact && (
        <div className="space-y-1 max-h-36 overflow-y-auto">
          {checkin.history.slice().reverse().map((h, i) => (
            <div key={`${h.at}-${i}`} className="flex items-start gap-2 text-[10px] rounded border border-border/70 p-1.5">
              <span className="font-mono text-muted-foreground shrink-0">{fmtWhen(h.at)}</span>
              <span className="flex-1">{h.note ?? `${lead.name}: ${STAGE_LABEL[h.stage]}`}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AuditMetric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return <div className={`rounded border p-1.5 ${danger ? "border-danger/40 bg-danger/5 text-danger" : "border-border bg-muted/20"}`}><div className="text-muted-foreground">{label}</div><div className="font-semibold truncate">{value}</div></div>;
}

/* ================================================================== */
/*  Focus Inventory Strip — what each TCM is pushing TODAY             */
/* ================================================================== */

function FocusInventoryStrip({ tcmFilter }: { tcmFilter: string }) {
  const tcms = useApp((s) => s.tcms);
  const properties = useApp((s) => s.properties);
  const focusProps = useTcmContacts((s) => s.focusProps);
  const [manageOpen, setManageOpen] = useState(false);

  const activeTcm =
    tcmFilter !== "all" ? tcms.find((t) => t.id === tcmFilter) : undefined;

  const rows = useMemo(() => {
    const list = activeTcm ? [activeTcm] : tcms;
    return list.map((t) => {
      const ids = focusProps[t.id] ?? [];
      const props = ids
        .map((id) => properties.find((p) => p.id === id))
        .filter(Boolean) as Property[];
      const vacant = props.reduce((a, p) => a + p.vacantBeds, 0);
      return { tcm: t, props, vacant };
    });
  }, [activeTcm, tcms, focusProps, properties]);

  const allEmpty = rows.every((r) => r.props.length === 0);

  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Pin className="h-3.5 w-3.5 text-accent" />
          <span className="text-[11px] uppercase tracking-wider font-semibold">
            Today's focus inventory
          </span>
          <span className="text-[10px] text-muted-foreground">
            · what to push first
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[10px] gap-1"
          onClick={() => setManageOpen(true)}
        >
          <Home className="h-3 w-3" /> Manage focus
        </Button>
      </div>

      {allEmpty ? (
        <p className="text-[11px] text-muted-foreground italic">
          No focus properties yet. Click <span className="font-semibold">Manage focus</span> to pin 3–5 properties per teammate so they know exactly what to push first today.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map(({ tcm, props, vacant }) => (
            <div key={tcm.id} className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="w-6 h-6 rounded-full bg-accent/20 text-accent text-[10px] font-bold flex items-center justify-center">
                  {tcm.initials}
                </div>
                <span className="text-[11px] font-semibold">{tcm.name.split(" ")[0]}</span>
                <Badge variant="outline" className="text-[9px] uppercase">
                  {vacant} beds free
                </Badge>
              </div>
              {props.length === 0 ? (
                <span className="text-[10px] text-muted-foreground italic">No focus set</span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {props.map((p) => (
                    <div
                      key={p.id}
                      className={`text-[10px] rounded-md border px-2 py-1 flex items-center gap-1.5 ${
                        p.vacantBeds === 0
                          ? "border-danger/40 bg-danger/5 text-muted-foreground"
                          : "border-border bg-card"
                      }`}
                    >
                      <span className="font-semibold">{p.name}</span>
                      <span className="text-muted-foreground">· {p.area}</span>
                      <Badge
                        variant="outline"
                        className={`text-[9px] ${
                          p.vacantBeds > 0
                            ? "bg-success/10 text-success border-success/40"
                            : "bg-danger/10 text-danger border-danger/40"
                        }`}
                      >
                        {p.vacantBeds}/{p.totalBeds}
                      </Badge>
                      <span className="text-muted-foreground">{formatINR(p.pricePerBed)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ManageFocusDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        defaultTcmId={activeTcm?.id ?? tcms[0]?.id ?? ""}
      />
    </div>
  );
}

function ManageFocusDialog({
  open, onOpenChange, defaultTcmId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultTcmId: string;
}) {
  const tcms = useApp((s) => s.tcms);
  const properties = useApp((s) => s.properties);
  const focusProps = useTcmContacts((s) => s.focusProps);
  const toggleFocusProp = useTcmContacts((s) => s.toggleFocusProp);
  const clearFocus = useTcmContacts((s) => s.clearFocus);
  const [tcmId, setTcmId] = useState(defaultTcmId);
  const [query, setQuery] = useState("");

  const focused = focusProps[tcmId] ?? [];
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? properties.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.area.toLowerCase().includes(q),
        )
      : properties;
    return [...base].sort((a, b) => {
      const af = focused.includes(a.id) ? 0 : 1;
      const bf = focused.includes(b.id) ? 0 : 1;
      if (af !== bf) return af - bf;
      return b.vacantBeds - a.vacantBeds;
    });
  }, [properties, query, focused]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Pin className="h-4 w-4" /> Manage focus inventory
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">TCM</Label>
              <Select value={tcmId} onValueChange={setTcmId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {tcms.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="text-xs">
                      {t.name} · {t.zone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Search</Label>
              <Input
                className="h-8 text-xs"
                placeholder="Property name or area"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {focused.length} property{focused.length === 1 ? "" : "ies"} pinned
            </span>
            {focused.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[10px] gap-1 text-danger"
                onClick={() => { clearFocus(tcmId); toast("Focus cleared"); }}
              >
                <X className="h-3 w-3" /> Clear all
              </Button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto space-y-1 border border-border rounded-md p-2">
            {list.map((p) => {
              const on = focused.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggleFocusProp(tcmId, p.id)}
                  className={`w-full text-left text-xs px-2 py-1.5 rounded border flex items-center gap-2 transition ${
                    on
                      ? "bg-accent/10 border-accent/50"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center ${on ? "bg-accent border-accent text-accent-foreground" : "border-border"}`}>
                    {on && <CheckCircle2 className="h-3 w-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {p.area} · {formatINR(p.pricePerBed)}/bed
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[9px] ${
                      p.vacantBeds > 0
                        ? "bg-success/10 text-success border-success/40"
                        : "bg-danger/10 text-danger border-danger/40"
                    }`}
                  >
                    {p.vacantBeds}/{p.totalBeds}
                  </Badge>
                </button>
              );
            })}
            {list.length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center py-4">
                No properties match.
              </p>
            )}
          </div>

          <Button className="w-full h-8 text-xs" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ================================================================== */
/*  Message Lab — preview every template variant, copy/send each        */
/* ================================================================== */

function MessageLabButton({ tcms }: { tcms: TCM[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="h-6 px-2 rounded-full text-[10px] uppercase tracking-wider font-semibold border border-accent/50 text-accent bg-accent/10 hover:bg-accent/20 flex items-center gap-1"
      >
        <Beaker className="h-3 w-3" /> Message Lab
      </button>
      <MessageLabSheet open={open} onOpenChange={setOpen} tcms={tcms} />
    </>
  );
}

function MessageLabSheet({
  open, onOpenChange, tcms,
}: { open: boolean; onOpenChange: (v: boolean) => void; tcms: TCM[] }) {
  const properties = useApp((s) => s.properties);
  const phones = useTcmContacts((s) => s.phones);

  const [tcmId, setTcmId] = useState(tcms[0]?.id ?? "");
  const [propId, setPropId] = useState(properties[0]?.id ?? "");
  const [leadName, setLeadName] = useState("Aakash");
  const [leadPhone, setLeadPhone] = useState("");
  const [tourWhen, setTourWhen] = useState("Tomorrow, 11:00 AM");
  const [price, setPrice] = useState<number>(12000);
  const [altPrice, setAltPrice] = useState<number>(10500);
  const [budget, setBudget] = useState<number>(13000);

  const tcm = tcms.find((t) => t.id === tcmId);
  const property = properties.find((p) => p.id === propId);

  const ctx: ImpactTplCtx = useMemo(() => ({
    leadName,
    agentName: tcm?.name,
    agentPhone: phones[tcmId] ?? "",
    propertyName: property?.name,
    propertyAddress: property?.area,
    tourWhen,
    roomType: "Shared · Triple",
    price,
    altPrice,
    area: property?.area,
    budget,
    moveIn: fmtDate(new Date().toISOString()),
  }), [leadName, tcm, phones, tcmId, property, tourWhen, price, altPrice, budget]);

  const scenarios = Object.keys(IMPACT_TEMPLATES) as ImpactScenario[];

  const scenarioLabel: Record<ImpactScenario, string> = {
    "first-touch": "First touch",
    "tour-confirm": "Tour confirm",
    "tour-reminder": "Tour reminder",
    "tour-noshow": "No-show recovery",
    "quote-followup": "Quote follow-up",
    "negotiate-hold": "Negotiate · hold",
    "negotiate-alt": "Negotiate · alt room",
    "negotiate-floor": "Negotiate · floor",
    "booking-confirm": "Booking confirm",
    revival: "Revival",
  };

  const copy = (text: string) => copyText(text);
  const send = (text: string) => {
    if (!leadPhone.trim()) {
      copy(text);
      toast("No lead phone — copied to clipboard instead");
      return;
    }
    openWhatsApp(leadPhone, text);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col gap-0 overflow-hidden">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border space-y-2">
          <SheetTitle className="text-base font-display flex items-center gap-2">
            <Beaker className="h-4 w-4 text-accent" /> Message Lab
          </SheetTitle>
          <SheetDescription className="text-[11px]">
            Every template, every variant. Tweak the context, then copy or send each one.
          </SheetDescription>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Lead name</Label>
              <Input className="h-8 text-xs" value={leadName} onChange={(e) => setLeadName(e.target.value)} />
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Lead phone (for Send)</Label>
              <Input className="h-8 text-xs" placeholder="+91 9xxxxxxxxx" value={leadPhone} onChange={(e) => setLeadPhone(e.target.value)} />
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">TCM</Label>
              <Select value={tcmId} onValueChange={setTcmId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {tcms.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Property</Label>
              <Select value={propId} onValueChange={setPropId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Tour when</Label>
              <Input className="h-8 text-xs" value={tourWhen} onChange={(e) => setTourWhen(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-1">
              <div>
                <Label className="text-[9px] uppercase text-muted-foreground">Price</Label>
                <Input className="h-8 text-xs" type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-[9px] uppercase text-muted-foreground">Alt</Label>
                <Input className="h-8 text-xs" type="number" value={altPrice} onChange={(e) => setAltPrice(Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-[9px] uppercase text-muted-foreground">Budget</Label>
                <Input className="h-8 text-xs" type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {scenarios.map((sc) => (
            <div key={sc} className="border border-border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold">{scenarioLabel[sc]}</div>
                <Badge variant="outline" className="text-[9px] uppercase">
                  {IMPACT_TEMPLATES[sc].length} variants
                </Badge>
              </div>
              <div className="space-y-2">
                {IMPACT_TEMPLATES[sc].map((tpl) => {
                  const msg = renderImpactTemplate(tpl, ctx);
                  return (
                    <div key={tpl.id} className="rounded-md bg-muted/40 p-2 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[9px] uppercase">{tpl.label}</Badge>
                          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{tpl.vibe}</span>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1" onClick={() => copy(msg)}>
                            <ClipboardCopy className="h-3 w-3" /> Copy
                          </Button>
                          <Button size="sm" className="h-6 text-[10px] gap-1" onClick={() => send(msg)}>
                            <Send className="h-3 w-3" /> Send
                          </Button>
                        </div>
                      </div>
                      <div className="text-[11px] whitespace-pre-wrap font-mono leading-relaxed">{msg}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ================================================================== */
/*  Interested Properties — favourites for a lead (max 3 suggested)    */
/* ================================================================== */

function LeadInterestedPropertiesPicker({ lead }: { lead: Lead }) {
  const properties = useApp((s) => s.properties);
  const allInterests = useLeadInterests((s) => s.interests);
  const interests = allInterests[lead.id] ?? [];
  const toggle = useLeadInterests((s) => s.toggleInterest);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const liked = interests
    .map((id) => properties.find((p) => p.id === id))
    .filter(Boolean) as Property[];

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? properties.filter(
          (p) => p.name.toLowerCase().includes(q) || p.area.toLowerCase().includes(q),
        )
      : properties.slice(0, 12);
    return [...base].sort((a, b) => {
      const af = interests.includes(a.id) ? 0 : 1;
      const bf = interests.includes(b.id) ? 0 : 1;
      if (af !== bf) return af - bf;
      return b.vacantBeds - a.vacantBeds;
    });
  }, [properties, query, interests]);

  return (
    <div className="rounded-lg border border-border bg-gradient-to-br from-card via-card to-accent/5 p-3 space-y-2 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Heart className="h-3.5 w-3.5 text-danger" />
          <span className="text-[11px] uppercase tracking-wider font-semibold">
            Interested properties
          </span>
          <span className="text-[10px] text-muted-foreground">
            · pin 2–3 the lead is leaning toward
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-[10px] gap-1"
          onClick={() => setOpen((v) => !v)}
        >
          <Plus className="h-3 w-3" /> {open ? "Close" : "Add"}
        </Button>
      </div>

      {liked.length === 0 && !open && (
        <p className="text-[11px] text-muted-foreground italic">
          No favourites yet — tap <span className="font-semibold">Add</span> to pin the rooms they liked.
        </p>
      )}

      {liked.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {liked.map((p, i) => (
            <div
              key={p.id}
              className="group text-[10px] rounded-md border border-accent/40 bg-accent/10 px-2 py-1 flex items-center gap-1.5"
            >
              <Star className="h-3 w-3 text-accent" />
              <span className="font-semibold">#{i + 1} {p.name}</span>
              <span className="text-muted-foreground">· {p.area} · {formatINR(p.pricePerBed)}</span>
              <Badge
                variant="outline"
                className={`text-[9px] ${
                  p.vacantBeds > 0
                    ? "bg-success/10 text-success border-success/40"
                    : "bg-danger/10 text-danger border-danger/40"
                }`}
              >
                {p.vacantBeds}/{p.totalBeds}
              </Badge>
              <button
                onClick={() => toggle(lead.id, p.id)}
                className="opacity-40 hover:opacity-100 hover:text-danger"
                aria-label="Remove"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="space-y-1.5 pt-1">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              className="h-7 pl-7 text-xs"
              placeholder="Search property…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="max-h-44 overflow-y-auto space-y-1 rounded-md border border-border p-1">
            {list.map((p) => {
              const on = interests.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggle(lead.id, p.id)}
                  className={`w-full text-left text-[11px] px-2 py-1 rounded border flex items-center gap-2 transition ${
                    on
                      ? "bg-accent/10 border-accent/50"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                      on ? "bg-accent border-accent text-accent-foreground" : "border-border"
                    }`}
                  >
                    {on && <Heart className="h-2 w-2" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {p.area} · {formatINR(p.pricePerBed)}/bed
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[9px] ${
                      p.vacantBeds > 0
                        ? "bg-success/10 text-success border-success/40"
                        : "bg-danger/10 text-danger border-danger/40"
                    }`}
                  >
                    {p.vacantBeds}/{p.totalBeds}
                  </Badge>
                </button>
              );
            })}
            {list.length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center py-3">
                No matches.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  10x Command Bar — live recompute pulse, streak, SLA, digest        */
/* ================================================================== */

function TenXCommandBar({
  lastRerank, escalations, counters, targets, stackSorted, tick,
}: {
  lastRerank: number;
  escalations: number;
  counters: { toursToday: number; quotesWeek: number; bookingsMonth: number };
  targets: { toursToday: number; quotesWeek: number; bookingsMonth: number };
  stackSorted: Array<{ lead: { id: string; name: string }; score: number; nba: { label: string; pressure: string }; column: string }>;
  tick: number;
}) {
  // Streak = leads with action moved today (proxy: tours + quotes + bookings done today)
  const streak = counters.toursToday + counters.quotesWeek + counters.bookingsMonth;
  const breach = escalations;
  const top5 = stackSorted.slice(0, 5);
  const stalled = stackSorted.filter((e) => e.nba.pressure === "escalate" || e.nba.pressure === "overdue").slice(0, 5);
  const moved = Math.min(streak, 99);

  // "X seconds ago" — recompute on tick. Skip until mounted (lastRerank===0).
  const ago = lastRerank === 0 ? 0 : Math.max(0, Math.floor((Date.now() - lastRerank) / 1000));
  const agoLabel = lastRerank === 0 ? "—" : ago < 60 ? `${ago}s ago` : `${Math.floor(ago / 60)}m ago`;
  void tick;

  const progress = Math.min(100, Math.round(((counters.bookingsMonth / Math.max(targets.bookingsMonth, 1)) * 100)));

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-accent/10 via-card to-primary/5 backdrop-blur-xl">
      <div className="h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
      <div className="flex flex-wrap items-center gap-4 p-3">
        {/* Live pulse */}
        <div className="flex items-center gap-2">
          <div className="relative h-2.5 w-2.5">
            <span className="absolute inset-0 rounded-full bg-success animate-ping opacity-60" />
            <span className="absolute inset-0 rounded-full bg-success" />
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">Live re-rank</div>
            <div className="text-xs font-mono">{agoLabel} · auto 60s</div>
          </div>
        </div>

        <Separator />

        {/* Streak */}
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-md bg-success/15 text-success flex items-center justify-center">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">Streak</div>
            <div className="text-base font-display font-semibold leading-none">{moved}<span className="text-[10px] text-muted-foreground ml-1">moved</span></div>
          </div>
        </div>

        <Separator />

        {/* SLA breach pulse */}
        <div className="flex items-center gap-2">
          <div className={`relative h-9 w-9 rounded-md flex items-center justify-center ${breach > 0 ? "bg-danger/15 text-danger" : "bg-muted text-muted-foreground"}`}>
            <Bell className="h-4 w-4" />
            {breach > 0 && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-danger animate-pulse" />}
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">SLA breach</div>
            <div className={`text-base font-display font-semibold leading-none ${breach > 0 ? "text-danger" : ""}`}>{breach}<span className="text-[10px] text-muted-foreground ml-1">leads</span></div>
          </div>
        </div>

        <Separator />

        {/* Bookings progress */}
        <div className="flex items-center gap-2 min-w-[160px]">
          <div className="h-9 w-9 rounded-md bg-primary/15 text-primary flex items-center justify-center">
            <Activity className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">Month target</div>
              <div className="text-[10px] font-mono text-muted-foreground">{counters.bookingsMonth}/{targets.bookingsMonth}</div>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1">
              <div className="h-full bg-gradient-to-r from-primary to-accent transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>

        {/* Daily digest */}
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="ml-auto gap-1.5 text-xs">
              <Sunrise className="h-3.5 w-3.5" /> Daily digest
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Sunrise className="h-4 w-4 text-accent" /> Today's digest</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md border border-border p-2 text-center">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Moved</div>
                  <div className="text-xl font-display font-semibold">{moved}</div>
                </div>
                <div className="rounded-md border border-border p-2 text-center">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Stalled</div>
                  <div className="text-xl font-display font-semibold text-danger">{stalled.length}</div>
                </div>
                <div className="rounded-md border border-border p-2 text-center">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Booked</div>
                  <div className="text-xl font-display font-semibold text-success">{counters.bookingsMonth}</div>
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Tomorrow's top 5</div>
                <ol className="space-y-1">
                  {top5.length === 0 && <li className="text-xs text-muted-foreground italic">Queue clear.</li>}
                  {top5.map((e, i) => (
                    <li key={e.lead.id} className="flex items-center gap-2 text-xs rounded-md border border-border bg-card p-2">
                      <span className="h-5 w-5 rounded-full bg-accent/15 text-accent text-[10px] font-semibold flex items-center justify-center">{i + 1}</span>
                      <span className="font-medium truncate flex-1">{e.lead.name}</span>
                      <Badge variant="outline" className="text-[9px]">{e.nba.label}</Badge>
                    </li>
                  ))}
                </ol>
              </div>

              {stalled.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-danger font-semibold mb-1">Stalled — escalate</div>
                  <ul className="space-y-1">
                    {stalled.map((e) => (
                      <li key={e.lead.id} className="flex items-center gap-2 text-xs rounded-md border border-danger/30 bg-danger/5 p-2">
                        <Zap className="h-3 w-3 text-danger" />
                        <span className="font-medium truncate flex-1">{e.lead.name}</span>
                        <Badge variant="outline" className="text-[9px] border-danger/40 text-danger">{e.nba.label}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Button
                size="sm"
                className="w-full gap-1.5"
                onClick={() => {
                  const txt = `*Daily digest*\nMoved: ${moved}  ·  Stalled: ${stalled.length}  ·  Booked: ${counters.bookingsMonth}\n\nTomorrow's top 5:\n${top5.map((e, i) => `${i + 1}. ${e.lead.name} — ${e.nba.label}`).join("\n")}`;
                  navigator.clipboard?.writeText(txt);
                  toast.success("Digest copied — paste into WhatsApp");
                }}
              >
                <ClipboardCopy className="h-3.5 w-3.5" /> Copy digest for WhatsApp
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function Separator() {
  return <div className="h-8 w-px bg-border" />;
}