import { cn } from "@/lib/utils";
import type { Signal } from "@workspace/api-client-react";
import { TrendingUp, TrendingDown, Minus, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";

interface SignalTableProps {
  signals: Signal[];
}

export default function SignalTable({ signals }: SignalTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 px-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Ativo</th>
            <th className="text-left py-2 px-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Categoria</th>
            <th className="text-center py-2 px-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Modo</th>
            <th className="text-center py-2 px-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">PA</th>
            <th className="text-center py-2 px-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">ML</th>
            <th className="text-center py-2 px-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">RSI</th>
            <th className="text-center py-2 px-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Sinal</th>
            <th className="text-right py-2 px-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Confiança</th>
            <th className="text-right py-2 px-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Preço</th>
            <th className="text-right py-2 px-3 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Hora</th>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {signals.map((signal) => {
              const isCall = signal.directionFinal === "CALL";
              const isPut = signal.directionFinal === "PUT";
              const isStrong = signal.confidenceFinal >= 80;
              const isConsensus = signal.justification.startsWith("CONSENSO TOTAL");

              return (
                <motion.tr
                  key={signal.asset}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.15 }}
                  data-testid={`row-signal-${signal.asset}`}
                  className={cn(
                    "border-b border-border/50 hover:bg-muted/30 transition-colors",
                    isCall && isStrong && "bg-emerald-950/20",
                    isPut && isStrong && "bg-red-950/20"
                  )}
                >
                  <td className="py-2.5 px-3">
                    <span className="font-mono font-semibold text-xs text-foreground">{signal.asset}</span>
                    {isConsensus && <Zap className="inline w-3 h-3 text-yellow-400 ml-1" />}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="text-xs text-muted-foreground">{signal.category}</span>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] px-1.5 font-mono",
                        signal.mode === "OTC" ? "border-yellow-500/40 text-yellow-500" : "border-accent/40 text-accent"
                      )}
                    >
                      {signal.mode}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <DirectionBadge direction={signal.directionPA} confidence={signal.confidencePA} />
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <DirectionBadge direction={signal.directionML} confidence={signal.confidenceML} />
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <DirectionBadge direction={signal.directionRSI} confidence={signal.confidenceRSI} />
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <div className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold font-mono",
                      isCall ? "bg-emerald-500/15 text-emerald-400" : isPut ? "bg-red-500/15 text-red-400" : "bg-muted text-muted-foreground"
                    )}>
                      {isCall ? <TrendingUp className="w-3 h-3" /> : isPut ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                      {signal.directionFinal}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <span className={cn(
                      "font-mono text-xs font-semibold",
                      signal.confidenceFinal >= 80 ? (isCall ? "text-emerald-400" : "text-red-400") : "text-muted-foreground"
                    )}>
                      {signal.confidenceFinal > 0 ? `${signal.confidenceFinal.toFixed(0)}%` : "—"}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <span className="font-mono text-xs text-muted-foreground">{signal.price?.toFixed(5)}</span>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <span className="font-mono text-[10px] text-muted-foreground/60">
                      {new Date(signal.timestamp).toLocaleTimeString("pt-BR")}
                    </span>
                  </td>
                </motion.tr>
              );
            })}
          </AnimatePresence>
        </tbody>
      </table>
      {signals.length === 0 && (
        <div className="py-12 text-center text-muted-foreground text-sm">
          Nenhum sinal encontrado para os filtros selecionados
        </div>
      )}
    </div>
  );
}

function DirectionBadge({ direction, confidence }: { direction: string; confidence: number }) {
  const isCall = direction === "CALL";
  const isPut = direction === "PUT";
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={cn(
        "text-[10px] font-mono font-medium",
        isCall ? "text-emerald-400" : isPut ? "text-red-400" : "text-muted-foreground/50"
      )}>
        {direction}
      </span>
      {confidence > 0 && (
        <span className="text-[9px] font-mono text-muted-foreground/50">{confidence.toFixed(0)}%</span>
      )}
    </div>
  );
}
