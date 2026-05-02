import { useState } from "react";
import { useGetAuthStatus, useGetSignals, getGetSignalsQueryKey, useGetBalance, getGetBalanceQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLogout } from "@workspace/api-client-react";
import SignalCard from "@/components/SignalCard";
import LoginForm from "@/components/LoginForm";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, LogOut, TrendingUp, TrendingDown, Activity, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

export default function Dashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const authStatus = useGetAuthStatus({ query: { refetchInterval: 10000 } });
  const connected = authStatus.data?.connected ?? false;

  const signals = useGetSignals(undefined, {
    query: {
      enabled: connected,
      refetchInterval: 5000,
      queryKey: getGetSignalsQueryKey(),
    },
  });

  const balance = useGetBalance({
    query: {
      enabled: connected,
      refetchInterval: 10000,
      queryKey: getGetBalanceQueryKey(),
    },
  });

  const logoutMutation = useLogout();
  const [filter, setFilter] = useState<"all" | "call" | "put">("all");

  if (!connected && !authStatus.isLoading) {
    return <LoginForm />;
  }

  const allSignals = signals.data?.signals ?? [];
  const strongSignals = allSignals.filter((s) => s.directionFinal !== "NEUTRO" && s.confidenceFinal >= 75);
  const filteredSignals = strongSignals.filter((s) => {
    if (filter === "call") return s.directionFinal === "CALL";
    if (filter === "put") return s.directionFinal === "PUT";
    return true;
  });

  const callCount = allSignals.filter((s) => s.directionFinal === "CALL").length;
  const putCount = allSignals.filter((s) => s.directionFinal === "PUT").length;
  const consensusCount = allSignals.filter((s) => s.justification.startsWith("CONSENSO TOTAL")).length;

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSignalsQueryKey() });
        toast({ title: "Desconectado", description: "Sessão encerrada com sucesso" });
      },
    });
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="border-b border-border px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {authStatus.data?.email && (
              <span className="font-mono">{authStatus.data.email} · </span>
            )}
            <span className={cn(
              "font-medium",
              authStatus.data?.accountType === "REAL" ? "text-destructive" : "text-accent"
            )}>
              {authStatus.data?.accountType}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {balance.data && (
            <div className="text-right mr-2">
              <p className="text-xs text-muted-foreground">Saldo</p>
              <p className="font-mono font-semibold text-sm text-foreground">
                ${balance.data.balance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </div>
          )}
          <Button
            data-testid="button-refresh"
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: getGetSignalsQueryKey() })}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", signals.isFetching && "animate-spin")} />
            Atualizar
          </Button>
          <Button
            data-testid="button-logout"
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
          >
            <LogOut className="w-3.5 h-3.5 mr-1.5" />
            Sair
          </Button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Analisados"
            value={signals.data?.totalAnalyzed ?? 0}
            icon={<Activity className="w-4 h-4 text-muted-foreground" />}
          />
          <StatCard
            label="CALL"
            value={callCount}
            icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
            valueClass="text-emerald-400"
          />
          <StatCard
            label="PUT"
            value={putCount}
            icon={<TrendingDown className="w-4 h-4 text-red-400" />}
            valueClass="text-red-400"
          />
          <StatCard
            label="Consenso"
            value={consensusCount}
            icon={<Zap className="w-4 h-4 text-yellow-400" />}
            valueClass="text-yellow-400"
          />
        </div>

        {/* Update info */}
        {signals.data?.lastUpdate && (
          <p className="text-[11px] text-muted-foreground font-mono">
            Última atualização: {new Date(signals.data.lastUpdate).toLocaleTimeString("pt-BR")} · Atualiza automaticamente a cada 5s
          </p>
        )}

        {/* Filter tabs */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground mr-1">Filtrar:</span>
          {[
            { key: "all", label: "Todos" },
            { key: "call", label: "CALL" },
            { key: "put", label: "PUT" },
          ].map(({ key, label }) => (
            <button
              key={key}
              data-testid={`filter-${key}`}
              onClick={() => setFilter(key as typeof filter)}
              className={cn(
                "text-xs px-3 py-1 rounded font-mono transition-colors",
                filter === key
                  ? key === "call"
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : key === "put"
                    ? "bg-red-500/20 text-red-400 border border-red-500/30"
                    : "bg-muted text-foreground border border-border"
                  : "text-muted-foreground hover:text-foreground border border-transparent"
              )}
            >
              {label}
              {key === "call" && callCount > 0 && (
                <Badge className="ml-1.5 h-4 px-1 text-[9px] bg-emerald-500/20 text-emerald-400 border-0">{callCount}</Badge>
              )}
              {key === "put" && putCount > 0 && (
                <Badge className="ml-1.5 h-4 px-1 text-[9px] bg-red-500/20 text-red-400 border-0">{putCount}</Badge>
              )}
            </button>
          ))}
        </div>

        {/* Signals grid */}
        {signals.isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-lg" />
            ))}
          </div>
        ) : filteredSignals.length > 0 ? (
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
          >
            {filteredSignals.map((signal) => (
              <SignalCard key={signal.asset} signal={signal} />
            ))}
          </motion.div>
        ) : (
          <div className="py-16 text-center">
            <Activity className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Aguardando sinais de alta confiança...</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Sinais aparecem quando PA, ML e RSI concordam</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, valueClass }: { label: string; value: number; icon: React.ReactNode; valueClass?: string }) {
  return (
    <div className="bg-card border border-card-border rounded-lg p-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p data-testid={`stat-${label.toLowerCase()}`} className={cn("text-xl font-bold font-mono", valueClass ?? "text-foreground")}>{value}</p>
      </div>
    </div>
  );
}
