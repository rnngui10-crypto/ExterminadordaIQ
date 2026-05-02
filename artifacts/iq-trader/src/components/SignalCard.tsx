import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Signal } from "@workspace/api-client-react";
import { TrendingUp, TrendingDown, Minus, Zap, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface SignalCardProps {
  signal: Signal;
  compact?: boolean;
}

function ConfidenceBar({ value, direction }: { value: number; direction: string }) {
  const color = direction === "CALL" ? "bg-emerald-500" : direction === "PUT" ? "bg-red-500" : "bg-muted-foreground";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-[11px] font-mono text-muted-foreground w-8 text-right">{value.toFixed(0)}%</span>
    </div>
  );
}

export default function SignalCard({ signal, compact }: SignalCardProps) {
  const isCall = signal.directionFinal === "CALL";
  const isPut = signal.directionFinal === "PUT";
  const isNeutro = signal.directionFinal === "NEUTRO";
  const isStrong = signal.confidenceFinal >= 80;
  const isConsensus = signal.justification.startsWith("CONSENSO TOTAL");

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      data-testid={`card-signal-${signal.asset}`}
      className={cn(
        "bg-card border rounded-lg p-4 transition-all",
        isCall && isStrong && "signal-call-strong",
        isCall && !isStrong && "signal-call",
        isPut && isStrong && "signal-put-strong",
        isPut && !isStrong && "signal-put",
        isNeutro && "border-card-border"
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={cn(
              "w-8 h-8 rounded flex items-center justify-center shrink-0",
              isCall ? "bg-emerald-500/15" : isPut ? "bg-red-500/15" : "bg-muted"
            )}
          >
            {isCall ? (
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            ) : isPut ? (
              <TrendingDown className="w-4 h-4 text-red-400" />
            ) : (
              <Minus className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <p data-testid={`text-asset-${signal.asset}`} className="font-mono font-semibold text-sm text-foreground leading-none">{signal.asset}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">{signal.price?.toFixed(5)}</p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-1.5">
            {isConsensus && <Zap className="w-3 h-3 text-yellow-400" />}
            <span
              data-testid={`text-direction-${signal.asset}`}
              className={cn(
                "text-xs font-bold font-mono px-2 py-0.5 rounded",
                isCall ? "bg-emerald-500/20 text-emerald-400" : isPut ? "bg-red-500/20 text-red-400" : "bg-muted text-muted-foreground"
              )}
            >
              {signal.directionFinal}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0 h-4 font-mono",
                signal.mode === "OTC" ? "border-yellow-500/40 text-yellow-500" : "border-accent/40 text-accent"
              )}
            >
              {signal.mode}
            </Badge>
          </div>
        </div>
      </div>

      {!compact && (
        <>
          <div className="space-y-1.5 mb-3">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
              <span>Price Action</span>
              <span className={cn("font-mono", signal.directionPA === "CALL" ? "text-emerald-400" : signal.directionPA === "PUT" ? "text-red-400" : "text-muted-foreground")}>
                {signal.directionPA}
              </span>
            </div>
            <ConfidenceBar value={signal.confidencePA} direction={signal.directionPA} />

            <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-2 mb-1">
              <span>Machine Learning</span>
              <span className={cn("font-mono", signal.directionML === "CALL" ? "text-emerald-400" : signal.directionML === "PUT" ? "text-red-400" : "text-muted-foreground")}>
                {signal.directionML}
              </span>
            </div>
            <ConfidenceBar value={signal.confidenceML} direction={signal.directionML} />

            <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-2 mb-1">
              <span>RSI</span>
              <span className={cn("font-mono", signal.directionRSI === "CALL" ? "text-emerald-400" : signal.directionRSI === "PUT" ? "text-red-400" : "text-muted-foreground")}>
                {signal.directionRSI}
              </span>
            </div>
            <ConfidenceBar value={signal.confidenceRSI} direction={signal.directionRSI} />
          </div>

          {signal.confidenceFinal > 0 && (
            <div className={cn(
              "flex items-center justify-between text-xs rounded px-2.5 py-1.5 font-mono",
              isCall ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
            )}>
              <div className="flex items-center gap-1.5">
                <Radio className="w-3 h-3" />
                <span>Confiança Final</span>
              </div>
              <span className="font-bold">{signal.confidenceFinal.toFixed(1)}%</span>
            </div>
          )}
        </>
      )}

      {compact && signal.confidenceFinal > 0 && (
        <div className="mt-2">
          <ConfidenceBar value={signal.confidenceFinal} direction={signal.directionFinal} />
        </div>
      )}

      <p className="text-[10px] text-muted-foreground mt-2 leading-snug truncate" title={signal.justification}>
        {signal.justification}
      </p>

      <p className="text-[10px] text-muted-foreground/50 mt-1 font-mono">
        {new Date(signal.timestamp).toLocaleTimeString("pt-BR")}
      </p>
    </motion.div>
  );
}
