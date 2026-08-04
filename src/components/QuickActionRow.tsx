import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Phone, MessageSquare, ClipboardCheck, ChevronRight } from "lucide-react";
import { ConfidenceBar, IntentChip, StageBadge } from "./atoms";
import { toast } from "sonner";
import type { Lead } from "@/lib/types";
import { calculateLeadTemperature, liveConfidence } from "@/lib/engine";
import { useMountedNow } from "@/hooks/use-now";

/**
 * One row, one decision. Inline call/WA/done without opening a drawer.
 * Clicking the body opens the full Lead Control Panel.
 */
export function QuickActionRow({
  lead, reason, accent, dueLabel, onDone,
}: {
  lead: Lead;
  reason?: string;
  accent?: "destructive" | "accent" | "warning" | "default";
  dueLabel?: string;
  onDone?: () => void;
}) {
  const { selectLead, logCall, sendMessage, tcms, tours } = useApp();
  const [now, mounted] = useMountedNow();
  const tcm = tcms.find((t) => t.id === lead.assignedTcmId);
  // Use static lead values until mounted to avoid SSR mismatch
  const live = mounted ? liveConfidence(lead, tours, now) : lead.confidence;
  const liveIntent = mounted ? calculateLeadTemperature(lead, tours, now) : lead.intent;

  const ring = {
    destructive: "border-l-destructive",
    accent: "border-l-accent",
    warning: "border-l-warning",
    default: "border-l-transparent",
  }[accent ?? "default"];

  return (
    <div className={`group grid grid-cols-12 items-center gap-2 px-3 py-2.5 border-l-2 ${ring} hover:bg-accent/5 transition-colors`}>
      <button onClick={() => selectLead(lead.id)} className="col-span-4 text-left min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{lead.name}</span>
          <IntentChip intent={liveIntent} />
        </div>
        <div className="text-[11px] text-muted-foreground truncate">
          {reason ?? `${lead.phone} · ${lead.preferredArea}`}
        </div>
      </button>

      <div className="col-span-2 hidden md:block"><StageBadge stage={lead.stage} /></div>
      <div className="col-span-2"><ConfidenceBar value={live} /></div>
      <div className="col-span-1 hidden md:block text-[11px] text-muted-foreground truncate">
        {tcm?.initials}
      </div>
      <div className="col-span-1 hidden md:block text-[11px] font-mono text-muted-foreground truncate">
        {dueLabel ?? ""}
      </div>

      <div className="col-span-12 md:col-span-2 flex items-center justify-end gap-1">
        <Button
          size="icon" variant="ghost" className="h-7 w-7"
          onClick={(e) => { e.stopPropagation(); logCall(lead.id); toast.success(`Call logged · ${lead.name}`); }}
          title="Log call"
        >
          <Phone className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon" variant="ghost" className="h-7 w-7"
          onClick={(e) => { e.stopPropagation(); sendMessage(lead.id, "WhatsApp template sent"); toast.success(`WA sent · ${lead.name}`); }}
          title="WhatsApp"
        >
          <MessageSquare className="h-3.5 w-3.5" />
        </Button>
        {onDone && (
          <Button
            size="icon" variant="ghost" className="h-7 w-7 text-success"
            onClick={(e) => { e.stopPropagation(); onDone(); }}
            title="Mark done"
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          size="icon" variant="ghost" className="h-7 w-7"
          onClick={() => selectLead(lead.id)}
          title="Open"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
