import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { LeadCreateSheet } from "@/components/leads/LeadCreateSheet";
import { useApp } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import type { LeadStage } from "@/lib/types";
import { ConfidenceBar, IntentChip, StageBadge } from "@/components/atoms";
import { calculateLeadTemperature, liveConfidence } from "@/lib/engine";
import { MessageSquare, Plus } from "lucide-react";

const PIPELINE_STAGES: Array<{ key: LeadStage; label: string }> = [
  { key: "new", label: "NEW" },
  { key: "contacted", label: "CONTACTED" },
  { key: "tour-scheduled", label: "VISIT SCHEDULED" },
  { key: "tour-done", label: "VISIT DONE" },
  { key: "negotiation", label: "NEGOTIATION" },
  { key: "booked", label: "BOOKED" },
  { key: "dropped", label: "LOST" },
];

export const Route = createFileRoute("/leads")({
  head: () => ({
    meta: [{ title: "Leads — Gharpayy" }, { name: "description", content: "Direct lead entry, active pipeline, and live outreach metrics." }],
  }),
  component: LeadsPage,
});

function LeadsPage() {
  const { leads, tcms, setLeadStage, selectLead, tours } = useApp();
  const [q, setQ] = useState("");
  const [stageFilter, setStageFilter] = useState<LeadStage | "all">("all");
  const [sortMode, setSortMode] = useState<"confidence" | "updated">("confidence");
  const [leadCreateOpen, setLeadCreateOpen] = useState(false);

  const filteredLeads = useMemo(() => {
    const list = leads.filter((lead) => {
      const searchText = `${lead.name} ${lead.phone}`.toLowerCase();
      const matchesQuery = !q.trim() || searchText.includes(q.trim().toLowerCase());
      const matchesStage = stageFilter === "all" || lead.stage === stageFilter;
      return matchesQuery && matchesStage;
    });

    return list.sort((a, b) => {
      if (sortMode === "updated") {
        return +new Date(b.updatedAt) - +new Date(a.updatedAt);
      }
      return b.confidence - a.confidence;
    });
  }, [leads, q, stageFilter, sortMode]);

  const totalLeads = leads.length;
  const activeSiteVisits = leads.filter((lead) => lead.stage === "tour-scheduled").length;
  const bookedLeads = leads.filter((lead) => lead.stage === "booked").length;
  const bookingConversionRate = totalLeads ? Math.round((bookedLeads / totalLeads) * 100) : 0;

  return (
    <AppShell>
      <div className="space-y-4">
        <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight">Leads</h1>
            <p className="text-sm text-muted-foreground">Table view for lead management, direct entry, and immediate store updates.</p>
          </div>
          <Button onClick={() => setLeadCreateOpen(true)} className="h-9 gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </header>

        <section className="grid gap-3 md:grid-cols-3">
          <MetricCard label="Total Leads" value={String(totalLeads)} />
          <MetricCard label="Active Site Visits Scheduled" value={String(activeSiteVisits)} />
          <MetricCard label="Booking Conversion Rate (%)" value={`${bookingConversionRate}%`} />
        </section>

        <section className="rounded-xl border border-border bg-card p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone..." className="h-9 min-w-[240px] flex-1 text-sm" />
            <Select value={stageFilter} onValueChange={(value) => setStageFilter(value as LeadStage | "all")}>
              <SelectTrigger className="h-9 w-[180px] text-sm"><SelectValue placeholder="All stages" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {PIPELINE_STAGES.map((stage) => <SelectItem key={stage.key} value={stage.key}>{stage.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sortMode} onValueChange={(value) => setSortMode(value as "confidence" | "updated")}>
              <SelectTrigger className="h-9 w-[200px] text-sm"><SelectValue placeholder="Sort: Confidence" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="confidence">Sort: Confidence</SelectItem>
                <SelectItem value="updated">Sort: Updated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Intent Score</TableHead>
                <TableHead>Area / Budget</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.map((lead) => {
                const tcm = tcms.find((member) => member.id === lead.assignedTcmId);
                const intent = calculateLeadTemperature(lead, tours, Date.now());
                const confidence = liveConfidence(lead, tours, Date.now());
                const openWhatsApp = () => {
                  const phoneDigits = lead.phone.replace(/\D/g, "");
                  const message = `Hi ${lead.name}, thanks for connecting with Gharpayy! We have great PG options matching your budget.`;
                  window.open(`https://wa.me/91${phoneDigits}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
                };
                return (
                  <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/40" onClick={() => selectLead(lead.id, "impact")}>
                    <TableCell className="min-w-[220px]">
                      <div className="flex items-start gap-2">
                        <div className="space-y-0.5">
                          <div className="font-medium text-sm">{lead.name}</div>
                          <div className="text-[11px] text-muted-foreground">{lead.phone}</div>
                          <div className="text-[10px] text-muted-foreground">{lead.source}</div>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="ml-auto h-7 gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            openWhatsApp();
                          }}
                          title="Open WhatsApp"
                        >
                          <MessageSquare className="h-3.5 w-3.5" /> WA
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <StageBadge stage={lead.stage} />
                        <Select value={lead.stage} onValueChange={(value) => setLeadStage(lead.id, value as LeadStage)} onClick={(e) => e.stopPropagation()}>
                          <SelectTrigger className="h-8 w-[160px] text-[11px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PIPELINE_STAGES.map((stage) => <SelectItem key={stage.key} value={stage.key}>{stage.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1.5">
                        <IntentChip intent={intent} />
                        <ConfidenceBar value={confidence} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5 text-[11px] text-muted-foreground">
                        <div>{lead.preferredArea}</div>
                        <div>₹{lead.budget.toLocaleString("en-IN")}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5 text-[11px]">
                        <div className="font-medium">{tcm?.name ?? "Unassigned"}</div>
                        <div className="text-muted-foreground">{tcm?.zone ?? "—"}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(lead.updatedAt), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredLeads.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-sm text-muted-foreground">
                    No matching leads found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
      </div>
      <LeadCreateSheet open={leadCreateOpen} onOpenChange={setLeadCreateOpen} />
    </AppShell>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

