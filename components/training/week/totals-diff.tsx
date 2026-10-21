import type { WeekTotals } from "@/lib/training-week/editWeek";
import { formatKm } from "@/lib/utils";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * The week before and after an edit (SPEC §7.6: totals shown before save). A changed
 * figure says so in words and with its difference, not by colour alone.
 */
export function TotalsDiff({ before, after }: { before: WeekTotals; after: WeekTotals }) {
  const rows = [
    {
      label: "Planned distance",
      before: formatKm(before.plannedKm),
      after: formatKm(after.plannedKm),
      delta: after.plannedKm - before.plannedKm,
      unit: " km",
    },
    {
      label: "Sessions",
      before: String(before.sessions),
      after: String(after.sessions),
      delta: after.sessions - before.sessions,
      unit: "",
    },
    {
      label: "Hard sessions",
      before: String(before.hardSessions),
      after: String(after.hardSessions),
      delta: after.hardSessions - before.hardSessions,
      unit: "",
    },
  ];
  return (
    <table className="w-full text-sm">
      <caption className="mb-2 text-left text-sm font-semibold text-foreground">
        This week, after the change
      </caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Measure</th>
          <th scope="col">Now</th>
          <th scope="col">After</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--border-subtle)]">
        {rows.map((r) => {
          const delta = Math.round(r.delta * 10) / 10;
          return (
            <tr key={r.label}>
              <th scope="row" className="py-2 pr-3 text-left font-normal text-muted-foreground">
                {r.label}
              </th>
              <td className="py-2 pr-3 tabular-nums text-muted-foreground">{r.before}</td>
              <td className="py-2 tabular-nums">
                {delta === 0 ? (
                  <span className="text-foreground">
                    {r.after} <span className="text-muted-foreground">(unchanged)</span>
                  </span>
                ) : (
                  <span className="font-semibold text-foreground">
                    {r.after}{" "}
                    <span className="font-normal text-muted-foreground">
                      ({delta > 0 ? "+" : "−"}
                      {fmt(Math.abs(delta))}
                      {r.unit})
                    </span>
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
