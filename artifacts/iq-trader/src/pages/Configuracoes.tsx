import { useState } from "react";
import { useGetAuthStatus, getGetAuthStatusQueryKey, getGetBalanceQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Loader2, ShieldAlert, CheckCircle, Wifi, WifiOff } from "lucide-react";

export default function Configuracoes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const authStatus = useGetAuthStatus({ query: { refetchInterval: 10000, queryKey: getGetAuthStatusQueryKey() } });
  const [switching, setSwitching] = useState(false);

  const connected = authStatus.data?.connected ?? false;
  const currentType = authStatus.data?.accountType ?? "PRACTICE";

  const handleSwitch = async (type: "REAL" | "PRACTICE") => {
    if (switching || currentType === type) return;
    setSwitching(true);
    try {
      const res = await fetch("/api/account/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = (await res.json()) as { success?: boolean; accountType?: string };
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: getGetAuthStatusQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetBalanceQueryKey() });
        toast({ title: "Conta alterada", description: `Agora usando conta ${type}` });
      } else {
        toast({ title: "Erro", description: "Nao foi possivel alterar o tipo de conta", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro", description: "Falha na conexao com o servidor", variant: "destructive" });
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold text-foreground">Configuracoes</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Gerencie sua conta e preferencias da IA</p>
      </div>

      <div className="p-6 max-w-lg space-y-6">
        {/* Connection status */}
        <div className="bg-card border border-card-border rounded-lg p-5">
          <h2 className="text-sm font-medium text-foreground mb-4">Status da Conexao</h2>
          <div className="flex items-center gap-3 mb-4">
            {connected ? (
              <Wifi className="w-4 h-4 text-primary" />
            ) : (
              <WifiOff className="w-4 h-4 text-muted-foreground" />
            )}
            <span className={cn("text-sm font-medium", connected ? "text-primary" : "text-muted-foreground")}>
              {connected ? "Conectado a IQ Option" : "Nao conectado"}
            </span>
          </div>
          {connected && authStatus.data?.email && (
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between border-b border-border/50 pb-2">
                <span className="text-muted-foreground">Email</span>
                <span className="font-mono text-foreground">{authStatus.data.email}</span>
              </div>
              <div className="flex justify-between border-b border-border/50 pb-2">
                <span className="text-muted-foreground">Tipo de conta</span>
                <span className={cn("font-mono font-semibold", currentType === "REAL" ? "text-red-400" : "text-accent")}>
                  {currentType}
                </span>
              </div>
              {authStatus.data.balance !== undefined && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Saldo</span>
                  <span className="font-mono text-foreground font-semibold">
                    ${authStatus.data.balance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Account type */}
        {connected && (
          <div className="bg-card border border-card-border rounded-lg p-5">
            <h2 className="text-sm font-medium text-foreground mb-1">Tipo de Conta</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Escolha entre conta de pratica (virtual) ou conta real.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                data-testid="button-practice-account"
                onClick={() => handleSwitch("PRACTICE")}
                disabled={switching || currentType === "PRACTICE"}
                className={cn(
                  "flex flex-col items-start gap-1.5 p-4 rounded-lg border transition-all text-left",
                  currentType === "PRACTICE"
                    ? "bg-accent/10 border-accent/30"
                    : "bg-muted/30 border-border hover:border-accent/20"
                )}
              >
                <div className="flex items-center gap-1.5">
                  {currentType === "PRACTICE" && <CheckCircle className="w-3.5 h-3.5 text-accent" />}
                  <span className={cn("text-sm font-semibold", currentType === "PRACTICE" ? "text-accent" : "text-foreground")}>
                    PRATICA
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground leading-snug">
                  Conta virtual para testes. Sem risco de dinheiro real.
                </span>
              </button>

              <button
                data-testid="button-real-account"
                onClick={() => handleSwitch("REAL")}
                disabled={switching || currentType === "REAL"}
                className={cn(
                  "flex flex-col items-start gap-1.5 p-4 rounded-lg border transition-all text-left",
                  currentType === "REAL"
                    ? "bg-red-500/10 border-red-500/30"
                    : "bg-muted/30 border-border hover:border-red-500/20"
                )}
              >
                <div className="flex items-center gap-1.5">
                  {currentType === "REAL" && <CheckCircle className="w-3.5 h-3.5 text-red-400" />}
                  <span className={cn("text-sm font-semibold", currentType === "REAL" ? "text-red-400" : "text-foreground")}>
                    REAL
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground leading-snug">
                  Conta com dinheiro real. Use com cautela.
                </span>
              </button>
            </div>

            {switching && (
              <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Alterando tipo de conta...
              </div>
            )}
          </div>
        )}

        {/* About IA */}
        <div className="bg-card border border-card-border rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-medium text-foreground">Sobre a IA de Sinais</h2>
          <div className="space-y-3 text-xs text-muted-foreground leading-relaxed">
            <div className="flex gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
              <p><span className="text-foreground font-medium">Price Action (PA):</span> Analisa padroes de velas como Engulfing, Pin Bar, Martelo e Estrela Cadente para detectar reversoes.</p>
            </div>
            <div className="flex gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
              <p><span className="text-foreground font-medium">Machine Learning (ML):</span> Usa RSI, MACD, Bollinger Bands e medias moveis em conjunto para calcular probabilidade de alta ou baixa.</p>
            </div>
            <div className="flex gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 mt-1.5 shrink-0" />
              <p><span className="text-foreground font-medium">RSI Extremos:</span> Detecta sobrecompra (RSI acima de 70) e sobrevenda (RSI abaixo de 30) para sinais de reversao.</p>
            </div>
            <div className="flex gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
              <p><span className="text-foreground font-medium">Modo de analise:</span> Escolha um ativo no Dashboard, clique em "Iniciar Analise" e a IA fica monitorando ate encontrar uma entrada de alta confianca.</p>
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="flex items-start gap-3 p-4 border border-red-500/20 rounded-lg bg-red-500/5">
          <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            <span className="text-red-400 font-medium">Aviso de risco:</span> Trading envolve risco significativo de perda. Esta ferramenta e apenas informativa — os sinais nao garantem lucro. Nunca opere com valores que nao pode perder.
          </p>
        </div>
      </div>
    </div>
  );
}
