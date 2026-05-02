import { useGetAuthStatus, useSwitchAccountType, getGetAuthStatusQueryKey, getGetBalanceQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Loader2, ShieldAlert, CheckCircle } from "lucide-react";

export default function Configuracoes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const authStatus = useGetAuthStatus({ query: { refetchInterval: 10000 } });
  const switchAccount = useSwitchAccountType();

  const connected = authStatus.data?.connected ?? false;
  const currentType = authStatus.data?.accountType ?? "PRACTICE";

  const handleSwitch = (type: "REAL" | "PRACTICE") => {
    switchAccount.mutate(
      { data: { accountType: type } },
      {
        onSuccess: (result) => {
          queryClient.invalidateQueries({ queryKey: getGetAuthStatusQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetBalanceQueryKey() });
          toast({ title: "Conta alterada", description: result.message });
        },
        onError: () => {
          toast({ title: "Erro", description: "Não foi possível alterar o tipo de conta", variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold text-foreground">Configurações</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Gerencie sua conta e preferências da IA</p>
      </div>

      <div className="p-6 max-w-lg space-y-6">
        {/* Connection status */}
        <div className="bg-card border border-card-border rounded-lg p-5">
          <h2 className="text-sm font-medium text-foreground mb-4">Status da Conexão</h2>
          <div className="flex items-center gap-3 mb-4">
            <div className={cn(
              "w-2.5 h-2.5 rounded-full",
              connected ? "bg-primary shadow-[0_0_8px_rgba(0,230,118,0.6)]" : "bg-muted-foreground"
            )} />
            <span className={cn("text-sm font-medium", connected ? "text-primary" : "text-muted-foreground")}>
              {connected ? "Conectado à IQ Option" : "Não conectado"}
            </span>
          </div>
          {connected && authStatus.data?.email && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs">Email</span>
                <span className="font-mono text-xs text-foreground">{authStatus.data.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs">Tipo de conta</span>
                <span className={cn("font-mono text-xs font-semibold", currentType === "REAL" ? "text-destructive" : "text-accent")}>
                  {currentType}
                </span>
              </div>
              {authStatus.data.balance !== undefined && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-xs">Saldo</span>
                  <span className="font-mono text-xs text-foreground">
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
              Escolha entre conta de prática (virtual) ou conta real.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                data-testid="button-practice-account"
                onClick={() => handleSwitch("PRACTICE")}
                disabled={switchAccount.isPending || currentType === "PRACTICE"}
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
                    PRÁTICA
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground leading-snug">
                  Conta virtual para testes. Sem risco de dinheiro real.
                </span>
              </button>

              <button
                data-testid="button-real-account"
                onClick={() => handleSwitch("REAL")}
                disabled={switchAccount.isPending || currentType === "REAL"}
                className={cn(
                  "flex flex-col items-start gap-1.5 p-4 rounded-lg border transition-all text-left",
                  currentType === "REAL"
                    ? "bg-destructive/10 border-destructive/30"
                    : "bg-muted/30 border-border hover:border-destructive/20"
                )}
              >
                <div className="flex items-center gap-1.5">
                  {currentType === "REAL" && <CheckCircle className="w-3.5 h-3.5 text-destructive" />}
                  <span className={cn("text-sm font-semibold", currentType === "REAL" ? "text-destructive" : "text-foreground")}>
                    REAL
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground leading-snug">
                  Conta com dinheiro real. Use com cautela.
                </span>
              </button>
            </div>

            {switchAccount.isPending && (
              <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Alterando tipo de conta...
              </div>
            )}
          </div>
        )}

        {/* Info section */}
        <div className="bg-card border border-card-border rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-medium text-foreground">Sobre a IA de Sinais</h2>
          <div className="space-y-3 text-xs text-muted-foreground leading-relaxed">
            <div className="flex gap-2.5">
              <div className="w-1 h-1 rounded-full bg-primary mt-1.5 shrink-0" />
              <p><span className="text-foreground font-medium">Price Action (PA):</span> Analisa padrões de velas como Engulfing, Pin Bar, Martelo e Estrela Cadente para detectar reversões.</p>
            </div>
            <div className="flex gap-2.5">
              <div className="w-1 h-1 rounded-full bg-accent mt-1.5 shrink-0" />
              <p><span className="text-foreground font-medium">Machine Learning (ML):</span> Usa RSI, MACD, Bollinger Bands e médias móveis em conjunto para calcular probabilidade de alta ou baixa.</p>
            </div>
            <div className="flex gap-2.5">
              <div className="w-1 h-1 rounded-full bg-yellow-400 mt-1.5 shrink-0" />
              <p><span className="text-foreground font-medium">RSI Extremos:</span> Detecta sobrecompra (RSI &gt; 70) e sobrevenda (RSI &lt; 30) para sinais de reversão.</p>
            </div>
            <div className="flex gap-2.5">
              <div className="w-1 h-1 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
              <p><span className="text-foreground font-medium">Consenso Total:</span> Sinal mais forte — todas as 3 estratégias concordam. Confiança mínima de 75% (85% em OTC).</p>
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="flex items-start gap-3 p-4 border border-destructive/20 rounded-lg bg-destructive/5">
          <ShieldAlert className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            <span className="text-destructive font-medium">Aviso de risco:</span> Trading envolve risco significativo de perda. Esta ferramenta é apenas informativa — os sinais não garantem lucro. Nunca opere com valores que não pode perder.
          </p>
        </div>
      </div>
    </div>
  );
}
