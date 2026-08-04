import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertCircle, CheckCircle2, Mail, MapPin, Phone, Sparkles, User, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import type { LeadStage } from "@/lib/types";

const LOCATION_OPTIONS = ["Koramangala", "HSR Layout", "Indiranagar", "Silk Board"] as const;
const STATUS_OPTIONS: LeadStage[] = ["new", "contacted", "tour-scheduled", "booked", "dropped"];
const STATUS_LABELS: Record<LeadStage, string> = {
  new: "NEW",
  contacted: "CONTACTED",
  "tour-scheduled": "VISIT SCHEDULED",
  "tour-done": "VISIT DONE",
  negotiation: "NEGOTIATION",
  booked: "BOOKED",
  dropped: "LOST",
};

const phoneOk = (v: string) => v.replace(/\D/g, "").length >= 10;

export function LeadCreateSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const addLead = useApp((s) => s.addLead);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [location, setLocation] = useState<string>(LOCATION_OPTIONS[0]);
  const [budget, setBudget] = useState("");
  const [status, setStatus] = useState<LeadStage>("new");
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const errors = useMemo(() => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Name is required";
    if (!phone.trim()) next.phone = "Phone is required";
    else if (!phoneOk(phone)) next.phone = "Enter a valid 10-digit phone";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = "Invalid email";
    return next;
  }, [name, phone, email]);

  const reset = () => {
    setName("");
    setPhone("");
    setEmail("");
    setLocation(LOCATION_OPTIONS[0]);
    setBudget("");
    setStatus("new");
    setTouched({});
  };

  const submit = () => {
    setTouched({ name: true, phone: true, email: true });
    if (Object.keys(errors).length > 0) {
      toast.error("Fix the highlighted fields first");
      return;
    }

    addLead({
      name,
      phone,
      email,
      budget: Number(budget || 0),
      preferredArea: location,
      source: "Direct",
      status,
    });

    toast.success("Lead added successfully");
    reset();
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <SheetTitle className="text-sm">Create lead</SheetTitle>
              <SheetDescription className="text-[11px]">Structured direct entry saves into the shared CRM store immediately.</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField icon={User} label="Name" error={touched.name ? errors.name : undefined}>
              <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setTouched((t) => ({ ...t, name: true }))} placeholder="Rahul Sharma" className="h-10 text-sm" />
            </FormField>
            <FormField icon={Phone} label="Phone" error={touched.phone ? errors.phone : undefined}>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => setTouched((t) => ({ ...t, phone: true }))} placeholder="9876543210" inputMode="tel" className="h-10 text-sm" />
            </FormField>
            <FormField icon={Mail} label="Email (optional)" error={touched.email ? errors.email : undefined}>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouched((t) => ({ ...t, email: true }))} placeholder="rahul@example.com" type="email" className="h-10 text-sm" />
            </FormField>
            <FormField icon={MapPin} label="Location">
              <Select value={location} onValueChange={setLocation}>
                <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOCATION_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField icon={Wallet} label="Budget (₹)">
              <Input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="15000" type="number" min="0" className="h-10 text-sm" />
            </FormField>
            <FormField label="Status">
              <Select value={status} onValueChange={(v) => setStatus(v as LeadStage)}>
                <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{STATUS_LABELS[opt]}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
          </div>
        </div>

        <div className="border-t border-border px-5 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-9">Cancel</Button>
          <Button onClick={submit} className="h-9 gap-2">
            <CheckCircle2 className="h-4 w-4" /> Save lead
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FormField({ label, error, icon: Icon, children }: { label: string; error?: string; icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium flex items-center gap-1.5 text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </Label>
      {children}
      {error && <p className="text-[10px] text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</p>}
    </div>
  );
}
