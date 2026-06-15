import type { FloodStatus } from "@/lib/subay/types";
import { cn } from "@/lib/utils";

const styles: Record<FloodStatus, string> = {
  NORMAL: "bg-[var(--color-status-normal)]/15 text-[var(--color-status-normal)] ring-[var(--color-status-normal)]/30",
  ALERT: "bg-[var(--color-status-alert)]/20 text-[oklch(0.45_0.15_75)] ring-[var(--color-status-alert)]/40",
  DANGER: "bg-[var(--color-status-danger)]/15 text-[var(--color-status-danger)] ring-[var(--color-status-danger)]/30",
};

export function StatusBadge({ status, className }: { status: FloodStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide ring-1",
        styles[status],
        className,
      )}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{
          backgroundColor:
            status === "NORMAL"
              ? "var(--color-status-normal)"
              : status === "ALERT"
                ? "var(--color-status-alert)"
                : "var(--color-status-danger)",
        }}
      />
      {status}
    </span>
  );
}