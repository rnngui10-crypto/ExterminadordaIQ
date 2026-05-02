import { useGetSignalHistory, getGetSignalHistoryQueryKey } from "@workspace/api-client-react";
import SignalTable from "@/components/SignalTable";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Zap, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Historico() {
  const history = useGetSignalHistory({
    query: { refetchInterval: 15000, queryKey: getGetSignalHistoryQueryKey() },
  });

  const allHistory = history.data?.history ?? [];
  const callSignals = allHistory.filter((s) => s.directionFinal === "CALL");
  const putSignals = allHistory.filter((s) => s.directionFinal === "PUT");
  const consensusSignals = allHistory.filter((s) => s.justification.startsWith("CONSENSO TOTAL"));
  const avgConfidence = allHistory.length > 0
    ? allHistory.filter(s => s.confidenceFinal > 0).reduce((sum, s) => sum + s.confidenceFinal, 0) / Math.max(1, allHistory.filter(s => s.confidenceFinal > 0).length)
    : 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold text-foreground">Histórico de Sinais</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Registro dos últimos sinais gerados pelo sistema
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-card border border-card-border rounded-lg p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p data-testid="stat-total-history" className="text-xl font-bold font-mono text-foreground">{allHistory.length}</p>
            </div>
          </div>
          <div className="bg-card border border-card-border rounded-lg p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-emerald-500/10 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">CALL</p>
              <p data-testid="stat-call-history" className="text-xl font-bold font-mono text-emerald-400">{callSignals.length}</p>
            </div>
          </div>
          <div className="bg-card border border-card-border rounded-lg p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-red-500/10 flex items-center justify-center">
              <TrendingDown className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">PUT</p>
              <p data-testid="stat-put-history" className="text-xl font-bold font-mono text-red-400">{putSignals.length}</p>
            </div>
          </div>
          <div className="bg-card border border-card-border rounded-lg p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-yellow-500/10 flex items-center justify-center">
              <Zap className="w-4 h-4 text-yellow-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Consenso</p>
              <p data-testid="stat-consensus-history" className="text-xl font-bold font-mono text-yellow-400">{consensusSignals.length}</p>
            </div>
          </div>
        </div>

        {avgConfidence > 0 && (
          <div className="bg-card border border-card-border rounded-lg px-4 py-3 flex items-center gap-3">
            <div className="text-xs text-muted-foreground">Confiança média dos sinais:</div>
            <span className={cn(
              "font-mono font-semibold text-sm",
              avgConfidence >= 80 ? "text-emerald-400" : avgConfidence >= 70 ? "text-yellow-400" : "text-muted-foreground"
            )}>
              {avgConfidence.toFixed(1)}%
            </span>
          </div>
        )}

        {/* Table */}
        <div className="bg-card border border-card-border rounded-lg overflow-hidden">
          {history.isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : allHistory.length > 0 ? (
            <SignalTable signals={allHistory} />
          ) : (
            <div className="py-16 text-center">
              <BarChart3 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum histórico disponível ainda</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Os sinais aparecem aqui conforme o sistema analisa os ativos</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
