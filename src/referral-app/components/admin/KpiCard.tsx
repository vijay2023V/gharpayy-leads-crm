import React from "react";
import type { LucideIcon } from "lucide-react";
import { Phone, MessageSquare, ChevronRight, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { calculateLeadTemperature } from "@/lib/engine";
import { formatINR } from "@/lib/crm10x/quotations";
import { intentChip, pressureColor } from "@/lib/crm10x/impact-scoring";
import type { Lead } from "@/lib/types";

export function KpiCard({
  title,
  value,
  hint,
  icon: Icon,
  tone = "slate",
}: {
  title: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: "slate" | "blue" | "amber" | "green" | "orange" | "red" | "primary";
}) {
  const toneMap: Record<string, { bg: string; fg: string }> = {
    slate: { bg: "bg-slate-50", fg: "text-slate-600" },
    blue: { bg: "bg-blue-50", fg: "text-blue-600" },
    amber: { bg: "bg-amber-50", fg: "text-amber-600" },
    green: { bg: "bg-green-50", fg: "text-green-600" },
    orange: { bg: "bg-orange-50", fg: "text-orange-600" },
    red: { bg: "bg-red-50", fg: "text-red-600" },
    primary: { bg: "bg-primary/10", fg: "text-primary" },
  };
  const t = toneMap[tone] || toneMap.slate;
  return (
    <div className="bg-card p-4 md:p-5 rounded-xl border border-border shadow-sm flex items-start gap-3">
      {Icon && (
        <div className={`p-2.5 rounded-xl ${t.bg} shrink-0`}>
          <Icon className={`w-5 h-5 ${t.fg}`} />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider truncate">{title}</p>
        <p className="text-2xl md:text-[28px] font-black text-foreground leading-tight tracking-tight mt-0.5">{value}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{hint}</p>}
      </div>
    </div>
  );
}

export function LeadCard({
  lead,
  onSelect,
  onStageChange,
}: {
  lead: Lead;
  onSelect?: (lead: Lead) => void;
  onStageChange?: (leadId: string, newStage: Lead["stage"]) => void;
}) {
  const temperature = calculateLeadTemperature(lead, [], Date.now());

  const handleWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    const phoneDigits = lead.phone.replace(/\D/g, "");
    const text = `Hi ${lead.name}, thanks for reaching out to Gharpayy!`;
    window.open(`https://wa.me/91${phoneDigits}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      onClick={() => onSelect?.(lead)}
      className="p-3 bg-card border border-border rounded-lg shadow-sm hover:border-accent/60 transition-colors cursor-pointer space-y-2"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-xs text-foreground truncate">{lead.name}</span>
        <Badge variant="outline" className={`text-[9px] uppercase ${intentChip(temperature)}`}>
          {temperature}
        </Badge>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Phone className="h-3 w-3" />
        <span className="font-mono text-foreground">{lead.phone}</span>
        <span>·</span>
        <span>{formatINR(lead.budget)}</span>
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-border/50">
        <span className="text-[10px] uppercase font-semibold text-muted-foreground">{lead.stage}</span>
        <button
          onClick={handleWhatsApp}
          className="flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 hover:bg-emerald-100"
        >
          <MessageSquare className="h-3 w-3" /> WhatsApp
        </button>
      </div>
    </div>
  );
}