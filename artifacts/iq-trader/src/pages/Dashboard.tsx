import { useState, useEffect, useRef, useCallback } from "react";
import { useGetAuthStatus, useGetBalance, getGetAuthStatusQueryKey, getGetBalanceQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLogout } from "@workspace/api-client-react";
import LoginForm from "@/components/LoginForm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LogOut, TrendingUp, TrendingDown, Activity, Search,
  ChevronDown, Clock, Target, Wifi, WifiOff, RefreshCw,
  PlayCircle, StopCircle, AlertTriangle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import type { Signal } from "@workspace/api-zod";

const ALL_ASSETS: Record<string, string[]> = {
  "Forex Principais": ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD"],
  "Forex Crosses": ["EURGBP", "EURJPY", "GBPJPY", "AUDJPY", "CADJPY", "EURCAD", "EURAUD", "GBPCAD"],
  "Forex Exóticos": ["USDBRL", "USDTRY", "USDZAR", "USDMXN"],
  "Criptomoedas": ["BTCUSD", "ETHUSD", "DOGEUSD", "SOLUSD", "XRPUSD"],
  "Índices": ["US30", "US500", "NAS100", "GER30", "UK100", "JP225"],
  "Commodities": ["XAUUSD", "XAGUSD", "USOUSD"],
};

const TIMEFRAMES = [
  { label: "1 minuto", value: 60, short: "M1" },
  { label: "5 minutos", value: 300, short: "M5" },
  { label: "15 minutos", value: 900, short: "M15" },
];

type AnalysisState = "idle" | "searching" | "found" | "conflict";

interface SignalWithRealData extends Signal {
  usingRealData?: boolean;
}

export default function Dashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const authStatus = useGetAuthStatus({ query: { refetchInterval: 15000 } });
  const connected = authStatus.data?.connected ?? false;
  const balance = useGetBalance({ query: { enabled: connected, refetchInterval: 15000, queryKey: getGetBalanceQueryKey() } });
  const logoutMutation = useLogout();

  const [selectedAsset, setSelectedAsset] = useState("EURUSD");
  const [selectedTF, setSelectedTF] = useState(TIMEFRAMES[0]);
  const [assetSearch, setAssetSearch] = useState("");
  const [assetDropdown, setAssetDropdown] = useState(false);
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [signal, setSignal] = useState<SignalWithRealData | null>(null);
  const [analysisCount, setAnalysisCount] = useState(0);
  const [lastAnalyzed, setLastAnalyzed] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [history, setHistory] = useState<SignalWithRealData[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopAnalysis = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setAnalysisState("idle");
    setCountdown(0);
  }, []);

  const runAnalysis = useCallback(async () => {
    try {
      const res = await fetch(`/api/signals/${selectedAsset}?duration=${selectedTF.value}`);
      if (!res.ok) return;
      const data = (await res.json()) as SignalWithRealData;
      setLastAnalyzed(new Date().toLocaleTimeString("pt-BR"));
      setAnalysisCount((c) => c + 1);

      if (data.directionFinal === "CALL" || data.directionFinal === "PUT") {
        setSignal(data);
        setAnalysisState("found");
        setHistory((prev) => [data, ...prev.slice(0, 19)]);

        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        const secs = selectedTF.value;
        setCountdown(secs);
        countdownRef.current = setInterval(() => {
          setCountdown((c) => {
            if (c <= 1) {
              if (countdownRef.current) clearInterval(countdownRef.current);
              return 0;
            }
            return c - 1;
          });
        }, 1000);
      } else if (data.justification.startsWith("CONFLITO")) {
        setSignal(data);
        setAnalysisState("conflict");
      } else {
        setAnalysisState("searching");
        setSignal(null);
      }
    } catch {
      // ignore
    }
  }, [selectedAsset, selectedTF]);

  const startAnalysis = useCallback(() => {
    setAnalysisState("searching");
    setSignal(null);
    setAnalysisCount(0);
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }

    runAnalysis();
    intervalRef.current = setInterval(runAnalysis, 5000);
  }, [runAnalysis]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  useEffect(() => {
    if (analysisState === "searching" || analysisState === "found") {
      stopAnalysis();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAsset, selectedTF]);

  if (!connected && !authStatus.isLoading) {
    return <LoginForm />;
  }

  const handleLogout = () => {
    stopAnalysis();
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAuthStatusQueryKey() });
        toast({ title: "Desconectado", description: "Sessão encerrada com sucesso" });
      },
    });
  };

  const filteredAssets = Object.entries(ALL_ASSETS).reduce<Record<string, string[]>>((acc, [cat, assets]) => {
    const f = assets.filter((a) => a.toLowerCase().includes(assetSearch.toLowerCase()));
    if (f.length > 0) acc[cat] = f;
    return acc;
  }, {});

  const isSearching = analysisState === "searching";
  const isFound = analysisState === "found";
  const isConflict = analysisState === "conflict";
  const isIdle = analysisState === "idle";

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="border-b border-border px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {authStatus.data?.accountType && (
            <Badge className={cn(
              "text-[10px] font-mono px-2 py-0.5",
              authStatus.data.accountType === "REAL"
                ? "bg-red-500/15 text-red-400 border border-red-500/30"
                : "bg-accent/15 text-accent border border-accent/30"
            )}>
              {authStatus.data.accountType}
            </Badge>
          )}
          {balance.data && (
            <span className="font-mono text-sm font-bold text-foreground">
              ${balance.data.balance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          )}
          <span className="text-xs text-muted-foreground font-mono hidden sm:inline">
            {authStatus.data?.email}
          </span>
        </div>
        <Button
          variant="ghost" size="sm"
          onClick={handleLogout}
          className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1.5"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sair
        </Button>
      </div>

      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {/* Asset & Timeframe selector */}
        <div className="bg-card border border-card-border rounded-xl p-4 space-y-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Selecione o ativo para operar</p>

          <div className="relative">
            <button
              onClick={() => { setAssetDropdown(!assetDropdown); setAssetSearch(""); }}
              className="w-full bg-background border border-input rounded-lg px-4 py-3 flex items-center justify-between hover:border-primary/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold",
                  "bg-primary/10 text-primary border border-primary/20"
                )}>
                  {selectedAsset.slice(0, 2)}
                </div>
                <div className="text-left">
                  <p className="font-mono font-bold text-foreground text-sm">{selectedAsset}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {Object.entries(ALL_ASSETS).find(([, v]) => v.includes(selectedAsset))?.[0] ?? ""}
                  </p>
                </div>
              </div>
              <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", assetDropdown && "rotate-180")} />
            </button>

            <AnimatePresence>
              {assetDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full mt-1 left-0 right-0 z-50 bg-card border border-card-border rounded-xl shadow-2xl overflow-hidden"
                >
                  <div className="p-2 border-b border-border">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <input
                        autoFocus
                        value={assetSearch}
                        onChange={(e) => setAssetSearch(e.target.value)}
                        placeholder="Buscar ativo..."
                        className="w-full bg-background border border-input rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-primary/50"
                      />
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {Object.entries(filteredAssets).map(([cat, assets]) => (
                      <div key={cat}>
                        <p className="px-3 py-1.5 text-[10px] text-muted-foreground uppercase tracking-wider font-medium bg-muted/30">{cat}</p>
                        {assets.map((asset) => (
                          <button
                            key={asset}
                            onClick={() => { setSelectedAsset(asset); setAssetDropdown(false); stopAnalysis(); }}
                            className={cn(
                              "w-full text-left px-3 py-2 text-sm font-mono hover:bg-muted/50 transition-colors flex items-center gap-2",
                              selectedAsset === asset && "bg-primary/10 text-primary"
                            )}
                          >
                            {asset}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Timeframe */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Expiração</p>
            <div className="flex gap-2">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf.value}
                  onClick={() => { setSelectedTF(tf); stopAnalysis(); }}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-xs font-mono font-bold transition-colors border",
                    selectedTF.value === tf.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-input hover:border-primary/50 hover:text-foreground"
                  )}
                >
                  <span className="block text-sm">{tf.short}</span>
                  <span className="block text-[10px] font-normal opacity-70">{tf.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Action button */}
          {isIdle ? (
            <Button
              onClick={startAnalysis}
              className="w-full bg-primary text-primary-foreground font-bold text-sm py-5 hover:bg-primary/90 gap-2"
            >
              <PlayCircle className="w-4 h-4" />
              Iniciar Analise — {selectedAsset} {selectedTF.short}
            </Button>
          ) : (
            <Button
              onClick={stopAnalysis}
              variant="outline"
              className="w-full font-bold text-sm py-5 gap-2 border-muted-foreground/30 text-muted-foreground hover:text-foreground"
            >
              <StopCircle className="w-4 h-4" />
              Parar Analise
            </Button>
          )}
        </div>

        {/* Analysis State Panel */}
        <AnimatePresence mode="wait">
          {isSearching && (
            <motion.div
              key="searching"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className="bg-card border border-card-border rounded-xl p-6 text-center"
            >
              <div className="relative mx-auto mb-4 w-16 h-16">
                <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping" />
                <div className="absolute inset-1 rounded-full border-2 border-primary/40 animate-ping" style={{ animationDelay: "0.3s" }} />
                <div className="relative w-16 h-16 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
                  <Activity className="w-7 h-7 text-primary animate-pulse" />
                </div>
              </div>
              <h2 className="text-lg font-bold text-foreground mb-1">Analisando {selectedAsset}...</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Aguardando entrada de alta confiança no {selectedTF.label}
              </p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-muted/30 rounded-lg p-2">
                  <p className="text-xs text-muted-foreground">Analises</p>
                  <p className="font-mono font-bold text-foreground text-lg">{analysisCount}</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-2">
                  <p className="text-xs text-muted-foreground">Ativo</p>
                  <p className="font-mono font-bold text-primary text-lg">{selectedAsset}</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-2">
                  <p className="text-xs text-muted-foreground">Ultima</p>
                  <p className="font-mono font-bold text-foreground text-sm">{lastAnalyzed ?? "--:--"}</p>
                </div>
              </div>
              {signal && (
                <div className="mt-3 text-xs text-muted-foreground bg-muted/20 rounded-lg p-2 font-mono">
                  {signal.justification}
                </div>
              )}
            </motion.div>
          )}

          {isConflict && signal && (
            <motion.div
              key="conflict"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className="bg-card border border-yellow-500/20 rounded-xl p-6 text-center"
            >
              <div className="w-14 h-14 rounded-full bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center mx-auto mb-3">
                <AlertTriangle className="w-7 h-7 text-yellow-400" />
              </div>
              <h2 className="text-base font-bold text-yellow-400 mb-1">Conflito de Sinais</h2>
              <p className="text-xs text-muted-foreground mb-3">{signal.justification}</p>
              <IndicatorGrid signal={signal} />
            </motion.div>
          )}

          {isFound && signal && (
            <motion.div
              key="signal"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
            >
              <SignalAlert signal={signal} countdown={countdown} timeframe={selectedTF} onReanalyze={() => { startAnalysis(); }} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* History */}
        {history.length > 0 && (
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Historico desta sessao</p>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => setHistory([])}>
                Limpar
              </Button>
            </div>
            <div className="divide-y divide-border/50">
              {history.slice(0, 10).map((s, i) => (
                <div key={i} className="px-4 py-2.5 flex items-center gap-3 hover:bg-muted/20 transition-colors">
                  <div className={cn(
                    "w-12 text-center py-0.5 rounded text-xs font-bold font-mono",
                    s.directionFinal === "CALL" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                  )}>
                    {s.directionFinal}
                  </div>
                  <span className="font-mono text-sm font-bold text-foreground flex-1">{s.asset}</span>
                  <span className="text-xs text-muted-foreground font-mono">{s.confidenceFinal.toFixed(0)}%</span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {new Date(s.timestamp).toLocaleTimeString("pt-BR")}
                  </span>
                  {s.usingRealData ? (
                    <Wifi className="w-3 h-3 text-accent" />
                  ) : (
                    <WifiOff className="w-3 h-3 text-muted-foreground/40" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SignalAlert({ signal, countdown, timeframe, onReanalyze }: {
  signal: SignalWithRealData;
  countdown: number;
  timeframe: typeof TIMEFRAMES[0];
  onReanalyze: () => void;
}) {
  const isCall = signal.directionFinal === "CALL";
  const pct = countdown / timeframe.value;

  return (
    <div className={cn(
      "rounded-xl border-2 overflow-hidden",
      isCall ? "border-emerald-500/50 bg-emerald-950/30" : "border-red-500/50 bg-red-950/30"
    )}>
      {/* Direction banner */}
      <div className={cn(
        "px-6 py-5 text-center",
        isCall ? "bg-emerald-500/10" : "bg-red-500/10"
      )}>
        <div className={cn(
          "inline-flex items-center gap-3 px-6 py-3 rounded-xl text-4xl font-black font-mono tracking-widest mb-2",
          isCall
            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
            : "bg-red-500/20 text-red-400 border border-red-500/30"
        )}>
          {isCall ? <TrendingUp className="w-8 h-8" /> : <TrendingDown className="w-8 h-8" />}
          {signal.directionFinal}
        </div>
        <div className="flex items-center justify-center gap-4 mt-2">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Ativo</p>
            <p className={cn("font-mono font-black text-xl", isCall ? "text-emerald-400" : "text-red-400")}>{signal.asset}</p>
          </div>
          <div className="w-px h-8 bg-border" />
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Confianca</p>
            <p className={cn("font-mono font-black text-xl", isCall ? "text-emerald-400" : "text-red-400")}>{signal.confidenceFinal.toFixed(0)}%</p>
          </div>
          <div className="w-px h-8 bg-border" />
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Expiracao</p>
            <p className="font-mono font-black text-xl text-foreground">{timeframe.short}</p>
          </div>
        </div>
      </div>

      {/* Countdown bar */}
      {countdown > 0 && (
        <div className="px-4 py-3 border-t border-border/30">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span>Tempo restante de operacao</span>
            </div>
            <span className="font-mono text-sm font-bold text-foreground">
              {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
            </span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <motion.div
              className={cn("h-full rounded-full", isCall ? "bg-emerald-500" : "bg-red-500")}
              animate={{ width: `${pct * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
      )}

      {/* Justification */}
      <div className="px-4 py-3 border-t border-border/30">
        <div className="flex items-center gap-2 text-xs">
          <Target className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">{signal.justification}</span>
          {signal.usingRealData && (
            <Badge className="ml-auto text-[9px] bg-accent/15 text-accent border-accent/30 gap-1">
              <Wifi className="w-2.5 h-2.5" />REAL
            </Badge>
          )}
        </div>
      </div>

      {/* Indicators */}
      <div className="px-4 pb-4 pt-1">
        <IndicatorGrid signal={signal} />
      </div>

      {/* Re-analyze button */}
      <div className="px-4 pb-4">
        <Button
          onClick={onReanalyze}
          variant="outline"
          size="sm"
          className="w-full gap-2 text-xs border-border text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Analisar Novamente
        </Button>
      </div>
    </div>
  );
}

function IndicatorGrid({ signal }: { signal: Signal }) {
  const ind = signal.indicators;
  const rows = [
    {
      label: "RSI (14)",
      value: ind.rsi?.toFixed(1) ?? "--",
      direction: signal.directionRSI,
      confidence: signal.confidenceRSI,
      note: ind.rsi !== undefined ? (ind.rsi > 70 ? "Sobrecomprado" : ind.rsi < 30 ? "Sobrevendido" : "Neutro") : "",
    },
    {
      label: "Machine Learning",
      value: `${signal.confidenceML.toFixed(0)}%`,
      direction: signal.directionML,
      confidence: signal.confidenceML,
      note: `Score baseado em MACD + BB + MA`,
    },
    {
      label: "Price Action",
      value: signal.directionPA === "NEUTRO" ? "Neutro" : `${signal.confidencePA.toFixed(0)}%`,
      direction: signal.directionPA,
      confidence: signal.confidencePA,
      note: "Padroes de velas japonesas",
    },
  ];

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="bg-background/50 rounded-lg p-2.5 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">{row.label}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-foreground">{row.value}</span>
                {row.direction !== "NEUTRO" && (
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded font-mono",
                    row.direction === "CALL" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                  )}>
                    {row.direction}
                  </span>
                )}
              </div>
            </div>
            {row.confidence > 0 && (
              <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full", row.direction === "CALL" ? "bg-emerald-500" : "bg-red-500")}
                  style={{ width: `${Math.min(100, row.confidence)}%` }}
                />
              </div>
            )}
          </div>
        </div>
      ))}

      {ind.rsi !== undefined && (
        <div className="grid grid-cols-3 gap-2 mt-1">
          {[
            { label: "Preco", value: signal.price.toFixed(5) },
            { label: "BB Upper", value: ind.bbUpper?.toFixed(5) ?? "--" },
            { label: "BB Lower", value: ind.bbLower?.toFixed(5) ?? "--" },
          ].map(({ label, value }) => (
            <div key={label} className="bg-background/50 rounded p-2 text-center">
              <p className="text-[9px] text-muted-foreground mb-0.5">{label}</p>
              <p className="font-mono text-[11px] text-foreground font-semibold truncate">{value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
