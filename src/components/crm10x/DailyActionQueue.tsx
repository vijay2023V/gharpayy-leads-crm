import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useApp } from "@/lib/store";
import { useCRM10x } from "@/lib/crm10x/store";
import { buildDoNextQueue } from "@/lib/engine";
import { useMountedNow } from "@/hooks/use-now";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Phone, MessageSquare, ClipboardCheck, AlertTriangle,
  Flame, Snowflake, ChevronRight, Target, Zap, Sun, Calendar as CalendarIcon,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { waLink } from "@/lib/impact/copy-formats";
import { calculateLeadTemperature } from "@/lib/engine";

/**
 * Mandatory Daily Action Queue.
 *
 * Single-screen, non-skippable queue per agent, sorted by hard scoring.
 * Bands:
 *   1. FIRE — never-called urgent (24h+) and post-visit ghosts
 *   2. CONFIRM — visits today/tomorrow that need confirmation
 *   3. RECOVER — overdue follow-ups
 *   4. NURTURE — follow-ups due today
 *   5. PROSPECT — leads with no follow-up at all (SLA breach)
 *
 * Each row = one decision. No browsing. The queue blocks when empty.
 */

type Band = "fire" | "confirm" | "recover" | "nurture" | "prospect";

const BAND_META: Record<Band, { label: string; tone: string; icon: typeof Flame; desc: string }> = {
  fire: {
    label: "🔥 FIRE",
    tone: "border-destructive bg-destructive/10 text-destructive",
    icon: Flame,
    desc: "Top priority — every minute costs revenue.",
  },
  confirm: {
    label: "📞 CONFIRM",
    tone: "border-warning bg-warning/10 text-warning",
    icon: Phone,
    desc: "Visits today/tomorrow — call to confirm.",
  },
  recover: {
    label: "⚡ RECOVER",
    tone: "border-accent bg-accent/10 text-accent",
    icon: Zap,
    desc: "Overdue follow-ups — re-engage now.",
  },
  nurture: {
    label: "🌱 NURTURE",
    tone: "border-info bg-info/10 text-info",
    icon: Sun,
    desc: "Follow-ups due today.",
  },
  prospect: {
    label: "📋 PROSPECT",
    tone: "border-border bg-muted/50 text-muted-foreground",
    icon: ClipboardCheck,
    desc: "Leads without a follow-up — set one.",
  },
};

export function DailyActionQueue() {
  const { leads, tours, followUps, role, currentTcmId, tcms, selectLead, logCall, sendMessage } = useApp();
  const [now, mounted] = useMountedNow();
  const callAttempts = useCRM10x((s) => s.calls);
  const messageOutcomes = useCRM10x((s) => s.messageOutcomes);
  // Bands expanded by default; user collapse choice persists per browser.
  const [collapsed, setCollapsed] = useState<Record<Band, boolean>>(() => {
    if (typeof window === "undefined") return { fire: false, confirm: false, recover: false, nurture: false, prospect: false };
    try {
      const raw = window.localStorage.getItem("daq:collapsed");
      if (raw) return { fire: false, confirm: false, recover: false, nurture: false, prospect: false, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return { fire: false, confirm: false, recover: false, nurture: false, prospect: false };
  });
  useEffect(() => {
    try { window.localStorage.setItem("daq:collapsed", JSON.stringify(collapsed)); } catch { /* ignore */ }
  }, [collapsed]);

  const filterTcm = role === "tcm" ? currentTcmId : undefined;
  const queue = useMemo(
    () => (mounted ? buildDoNextQueue(leads, tours, followUps, now, filterTcm) : []),
    [leads, tours, followUps, now, filterTcm, mounted],
  );

  // Band classification
  const bands = useMemo(() => {
    const map: Record<Band, typeof queue> = {
      fire: [], confirm: [], recover: [], nurture: [], prospect: [],
    };
    queue.forEach((a) => {
      if (a.kind === "post-tour-overdue" || a.kind === "first-response") map.fire.push(a);
      else if (a.kind === "tour-today") map.confirm.push(a);
      else if (a.kind === "follow-up-overdue") map.recover.push(a);
      else if (a.kind === "follow-up-today") map.nurture.push(a);
      else map.prospect.push(a);
    });
    return map;
  }, [queue]);

  const totalToDo = queue.length;
  const fireCount = bands.fire.length;
  const completedToday = mounted
    ? (() => {
        const today = new Date(now).toDateString();
        const calls = callAttempts.filter((c) => {
          if (filterTcm && c.loggedBy !== filterTcm) return false;
          return new Date(c.ts).toDateString() === today;
        }).length;
        const msgs = messageOutcomes.filter((m) => {
          if (filterTcm && m.loggedBy !== filterTcm) return false;
          return new Date(m.ts).toDateString() === today;
        }).length;
        return calls + msgs;
      })()
    : 0;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Daily Action Queue</h1>
          <p className="text-sm text-muted-foreground">
            {role === "tcm"
              ? `Your queue · ${tcms.find((t) => t.id === currentTcmId)?.name ?? "—"}`
              : "Team queue · all agents"}
            {" · "}{mounted ? format(new Date(now), "EEEE, MMM d") : "\u00a0"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Stat label="To do" value={totalToDo} tone={totalToDo > 0 ? "default" : "success"} />
          <Stat label="🔥 Fire" value={fireCount} tone={fireCount > 0 ? "danger" : "success"} />
          <Stat label="Logged" value={completedToday} tone="success" />
        </div>
      </header>

      {totalToDo === 0 && (
        <Card className="p-12 text-center space-y-3">
          <div className="text-5xl">🎯</div>
          <h2 className="font-display text-xl">Inbox zero — all clear.</h2>
          <p className="text-sm text-muted-foreground">
            No pending actions. Use this time to add fresh leads or coach the team.
          </p>
          <Link to="/leads">
            <Button variant="outline" size="sm">Browse leads</Button>
          </Link>
        </Card>
      )}

      {(["fire", "confirm", "recover", "nurture", "prospect"] as Band[]).map((band) => {
        const items = bands[band];
        if (items.length === 0) return null;
        const meta = BAND_META[band];
        const Icon = meta.icon;
        const isCollapsed = collapsed[band];
        return (
          <section
            key={band}
            className={`rounded-xl border-2 ${meta.tone} overflow-hidden`}
          >
            <button
              onClick={() => setCollapsed((c) => ({ ...c, [band]: !c[band] }))}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-foreground/5 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5" />
                <div className="text-left">
                  <div className="font-display font-bold text-sm">{meta.label}</div>
                  <div className="text-[11px] opacity-80">{meta.desc}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-background text-foreground font-mono">{items.length}</Badge>
                <ChevronRight
                  className={`h-4 w-4 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                />
              </div>
            </button>

            {!isCollapsed && (
              <div className="bg-card divide-y divide-border">
                {items.map((a) => {
                  const lead = leads.find((l) => l.id === a.leadId);
                  if (!lead) return null;
                  const tcm = tcms.find((t) => t.id === lead.assignedTcmId);
                  return (
                    <div
                      key={`${a.leadId}-${a.kind}`}
                      className="px-4 py-3 hover:bg-muted/30 transition-colors flex items-center gap-3"
                    >
                      <button
                        onClick={() => selectLead(lead.id)}
                        className="flex-1 text-left min-w-0"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{lead.name}</span>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            score {Math.round(a.score)}
                          </span>
                          {calculateLeadTemperature(lead, tours, now) === "hot" && (
                            <Badge className="bg-destructive/15 text-destructive text-[10px]">HOT</Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {a.reason} · {tcm?.initials ?? "—"} · {lead.preferredArea}
                        </div>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => {
                            logCall(lead.id);
                            toast.success(`Call logged · ${lead.name}`);
                          }}
                          title="Log call"
                        >
                          <Phone className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => {
                            const text = `Hi ${lead.name}, following up on your search in ${lead.preferredArea}. Free for a quick chat?`;
                            sendMessage(lead.id, text);
                            if (typeof window !== "undefined" && lead.phone) {
                              window.open(waLink(lead.phone, text), "_blank", "noopener");
                            }
                            toast.success(`WA opened · ${lead.name}`);
                          }}
                          title="WhatsApp"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => selectLead(lead.id)}
                          title="Open"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Stat({
  label, value, tone,
}: { label: string; value: number; tone: "default" | "danger" | "success" }) {
  const cls =
    tone === "danger"
      ? "border-destructive/40 bg-destructive/5 text-destructive"
      : tone === "success"
        ? "border-success/40 bg-success/5 text-success"
        : "border-border bg-card";
  return (
    <div className={`rounded-lg border px-3 py-1.5 text-xs ${cls}`}>
      <div className="text-[9px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-lg font-display font-bold">{value}</div>
    </div>
  );
}
