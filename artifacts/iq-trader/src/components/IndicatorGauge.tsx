import { cn } from "@/lib/utils";

interface IndicatorGaugeProps {
  label: string;
  value?: number;
  min?: number;
  max?: number;
  lowColor?: string;
  highColor?: string;
  unit?: string;
  decimals?: number;
}

export default function IndicatorGauge({
  label,
  value,
  min = 0,
  max = 100,
  unit = "",
  decimals = 1,
}: IndicatorGaugeProps) {
  if (value === undefined || value === null) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
        <span className="text-xs text-muted-foreground font-mono">—</span>
      </div>
    );
  }

  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  let barColor = "bg-accent";
  if (label === "RSI") {
    if (value < 30) barColor = "bg-emerald-500";
    else if (value > 70) barColor = "bg-red-500";
    else barColor = "bg-yellow-500";
  } else if (value >= 0) {
    barColor = "bg-emerald-500";
  } else {
    barColor = "bg-red-500";
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
        <span
          className={cn(
            "text-[11px] font-mono font-medium",
            label === "RSI" && value < 30 ? "text-emerald-400" :
            label === "RSI" && value > 70 ? "text-red-400" :
            value >= 0 ? "text-emerald-400" : "text-red-400"
          )}
        >
          {value.toFixed(decimals)}{unit}
        </span>
      </div>
      <div className="h-1 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {label === "RSI" && (
        <div className="flex justify-between text-[9px] text-muted-foreground/50 font-mono">
          <span>Sobrevenda</span>
          <span>30 — 70</span>
          <span>Sobrecompra</span>
        </div>
      )}
    </div>
  );
}
