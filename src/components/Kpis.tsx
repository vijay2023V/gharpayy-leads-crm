import type { Lead } from "../types";
import { intentTier } from "../lib/scoring";

export function Kpis({ leads }: { leads: Lead[] }) {
  const total = leads.length;
  const hot = leads.filter((l) => intentTier(l) === "HOT").length;
  const scheduled = leads.filter((l) => l.status === "Visit Scheduled").length;
  const booked = leads.filter((l) => l.status === "Booked").length;
  const conv = total ? Math.round((booked / total) * 100) : 0;

  const cards = [
    { n: total, l: "Total leads", c: "" },
    { n: hot, l: "🔥 Hot leads", c: "rose" },
    { n: scheduled, l: "Visits scheduled", c: "amber" },
    { n: booked, l: "Booked", c: "sage" },
    { n: `${conv}%`, l: "Conversion", c: "sage" },
  ];

  return (
    <div className="kpis">
      {cards.map((c) => (
        <div className={`kpi ${c.c}`} key={c.l}>
          <div className="n">{c.n}</div>
          <div className="l">{c.l}</div>
        </div>
      ))}
    </div>
  );
}
