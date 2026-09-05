function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

export function DangerLegend({ className }: { className?: string }) {
  return (
    <div className={className ?? "flex gap-3 text-[11px]"}>
      <LegendItem color="#22c55e" label="Normal" />
      <LegendItem color="#f59e0b" label="Alert" />
      <LegendItem color="#ef4444" label="Danger" />
    </div>
  );
}
