import { useState, useEffect, useRef, useCallback } from "react";
import { useGetAuthStatus, useGetBalance, getGetAuthStatusQueryKey, getGetBalanceQueryKey, useLogout } from "@workspace/api-client-react";
import type { Signal } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import LoginForm from "@/components/LoginForm";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Search, LogOut, MoreVertical, Wifi, WifiOff } from "lucide-react";

const ALL_ASSETS: Record<string, string[]> = {
  "Forex": ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD", "EURGBP", "EURJPY", "GBPJPY", "AUDJPY", "CADJPY"],
  "OTC": ["EURUSD-OTC", "GBPUSD-OTC", "USDJPY-OTC", "EURGBP-OTC", "EURJPY-OTC", "GBPJPY-OTC", "AUDUSD-OTC", "USDCAD-OTC"],
  "Cripto": ["BTCUSD", "ETHUSD", "DOGEUSD", "XRPUSD"],
  "Índices": ["US30", "US500", "NAS100", "GER30"],
  "Commodities": ["XAUUSD", "XAGUSD"],
};

const TIMEFRAMES = [
  { label: "1 min", value: 60, short: "M1" },
  { label: "5 min", value: 300, short: "M5" },
  { label: "15 min", value: 900, short: "M15" },
];

type Tab = "SINAL" | "HISTÓRICO" | "GERENCIAMENTO";
type AnalysisState = "idle" | "searching" | "found" | "conflict";

interface TradeEntry {
  asset: string;
  direction: "COMPRA" | "VENDA";
  confidence: number;
  time: string;
  timeframe: string;
  usingRealData?: boolean;
}

interface SignalWithExtra extends Signal {
  usingRealData?: boolean;
  currentPrice?: number;
}

export default function Dashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const authStatus = useGetAuthStatus({ query: { refetchInterval: 20000, queryKey: getGetAuthStatusQueryKey() } });
  const connected = authStatus.data?.connected ?? false;
  const balance = useGetBalance({
    query: { enabled: connected, refetchInterval: 20000, queryKey: getGetBalanceQueryKey() },
  });
  const logoutMutation = useLogout();

  const [activeTab, setActiveTab] = useState<Tab>("SINAL");
  const [selectedAsset, setSelectedAsset] = useState("EURUSD");
  const [selectedTF, setSelectedTF] = useState(TIMEFRAMES[0]);
  const [assetDropdown, setAssetDropdown] = useState(false);
  const [assetSearch, setAssetSearch] = useState("");
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [signal, setSignal] = useState<SignalWithExtra | null>(null);
  const [trades, setTrades] = useState<TradeEntry[]>([]);
  const [analysisCount, setAnalysisCount] = useState(0);
  const [wins, setWins] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const assertividade = analysisCount > 0 ? Math.round((wins / analysisCount) * 100) : 0;

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
      const data = (await res.json()) as SignalWithExtra;

      if (data.currentPrice) setCurrentPrice(data.currentPrice);

      const dir = data.directionFinal;
      if (dir === "CALL" || dir === "PUT") {
        const entry: TradeEntry = {
          asset: selectedAsset,
          direction: dir === "CALL" ? "COMPRA" : "VENDA",
          confidence: data.confidenceFinal,
          time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
          timeframe: selectedTF.short,
          usingRealData: data.usingRealData,
        };

        setSignal(data);
        setAnalysisState("found");
        setAnalysisCount((c) => c + 1);
        setTrades((prev) => [entry, ...prev.slice(0, 49)]);
        if (data.confidenceFinal >= 75) setWins((w) => w + 1);
        setActiveTab("SINAL");

        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }

        const secs = selectedTF.value;
        setCountdown(secs);
        countdownRef.current = setInterval(() => {
          setCountdown((c) => {
            if (c <= 1) {
              if (countdownRef.current) clearInterval(countdownRef.current);
              countdownRef.current = null;
              return 0;
            }
            return c - 1;
          });
        }, 1000);
      } else {
        setAnalysisState("searching");
        if (!signal || signal.asset !== selectedAsset) setSignal(null);
      }
    } catch {
      // ignore
    }
  }, [selectedAsset, selectedTF, signal]);

  const startAnalysis = useCallback(() => {
    setAnalysisState("searching");
    setSignal(null);
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    runAnalysis();
    intervalRef.current = setInterval(runAnalysis, 5000);
  }, [runAnalysis]);

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  useEffect(() => { stopAnalysis(); }, [selectedAsset, selectedTF.value]);

  const handleLogout = () => {
    stopAnalysis();
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAuthStatusQueryKey() });
        toast({ title: "Desconectado" });
      },
    });
  };

  const filteredAssets = Object.entries(ALL_ASSETS).reduce<Record<string, string[]>>((acc, [cat, assets]) => {
    const f = assets.filter((a) => a.toLowerCase().includes(assetSearch.toLowerCase()));
    if (f.length > 0) acc[cat] = f;
    return acc;
  }, {});

  const formatPrice = (p: number | null) => {
    if (!p) return "---,-----";
    return p.toLocaleString("pt-BR", { minimumFractionDigits: 5, maximumFractionDigits: 5 });
  };

  if (!connected && !authStatus.isLoading) {
    return <LoginForm />;
  }

  const isCall = signal?.directionFinal === "CALL";
  const signalDir = isCall ? "COMPRA" : "VENDA";
  const usingReal = authStatus.data?.usingRealData ?? false;

  return (
    <div className="w-full max-w-sm font-mono select-none">
      {/* Robot Panel */}
      <div
        className="rounded-xl overflow-hidden shadow-2xl border"
        style={{
          background: "#10101a",
          borderColor: "rgba(255,255,255,0.08)",
        }}
      >
        {/* ===== HEADER ===== */}
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{ background: "#1a1a2e", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded flex items-center justify-center text-[10px]"
              style={{ background: "#4d79ff" }}
            >
              ⚡
            </div>
            <span className="text-white font-bold text-xs tracking-wide uppercase">
              EXTERMINADOR DA PORRA
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {usingReal ? (
              <Wifi className="w-3 h-3 text-green-400" />
            ) : (
              <WifiOff className="w-3 h-3 text-gray-500" />
            )}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setMenuOpen(!menuOpen)}
              onKeyDown={(e) => e.key === "Enter" && setMenuOpen(!menuOpen)}
              className="text-gray-400 hover:text-white transition-colors relative p-0.5 cursor-pointer"
            >
              <MoreVertical className="w-4 h-4" />
              {menuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 rounded-lg overflow-hidden z-50 w-36 shadow-xl"
                  style={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-3 py-2.5 text-xs text-red-400 hover:bg-white/5 flex items-center gap-2"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sair da conta
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ===== ASSET + PRICE ===== */}
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{ background: "#13132a", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          {/* Asset dropdown */}
          <div className="relative">
            <button
              onClick={() => { setAssetDropdown(!assetDropdown); setAssetSearch(""); }}
              className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
            >
              <span className="text-white font-black text-lg tracking-wide">{selectedAsset}</span>
              <ChevronDown className={cn("w-3.5 h-3.5 text-gray-400 transition-transform", assetDropdown && "rotate-180")} />
            </button>

            <AnimatePresence>
              {assetDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute top-full mt-1 left-0 z-50 w-52 rounded-xl overflow-hidden shadow-2xl"
                  style={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <div className="p-2 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                      <input
                        autoFocus
                        value={assetSearch}
                        onChange={(e) => setAssetSearch(e.target.value)}
                        placeholder="Buscar..."
                        className="w-full bg-white/5 rounded-lg pl-7 pr-2 py-1.5 text-xs text-white focus:outline-none placeholder:text-gray-600"
                      />
                    </div>
                  </div>
                  <div className="max-h-52 overflow-y-auto">
                    {Object.entries(filteredAssets).map(([cat, assets]) => (
                      <div key={cat}>
                        <p className="px-3 py-1 text-[9px] text-gray-600 uppercase tracking-widest font-bold bg-white/2">{cat}</p>
                        {assets.map((asset) => (
                          <button
                            key={asset}
                            onClick={() => { setSelectedAsset(asset); setAssetDropdown(false); stopAnalysis(); }}
                            className={cn(
                              "w-full text-left px-3 py-2 text-xs font-bold hover:bg-white/5 transition-colors",
                              selectedAsset === asset ? "text-blue-400" : "text-gray-300"
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

          {/* Price */}
          <div className="text-right">
            <p className="text-white font-bold text-sm tabular-nums">{formatPrice(currentPrice)}</p>
            <p className="text-gray-600 text-[9px]">preço atual</p>
          </div>
        </div>

        {/* ===== TIMEFRAME SELECTOR ===== */}
        <div
          className="flex gap-0 px-3 py-2"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              onClick={() => { setSelectedTF(tf); stopAnalysis(); }}
              className={cn(
                "flex-1 py-1 text-xs font-bold transition-colors rounded",
                selectedTF.value === tf.value
                  ? "text-white"
                  : "text-gray-600 hover:text-gray-400"
              )}
              style={selectedTF.value === tf.value ? { background: "rgba(77,121,255,0.15)", color: "#4d79ff" } : {}}
            >
              {tf.short}
            </button>
          ))}
        </div>

        {/* ===== STATS ROW ===== */}
        <div
          className="grid grid-cols-3 px-3 py-3 gap-2"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "#0e0e1c" }}
        >
          <div className="text-center">
            <p className="text-white font-black text-2xl leading-none">{trades.length}</p>
            <p className="text-gray-600 text-[9px] mt-1 uppercase tracking-wider">ENTRADAS</p>
          </div>
          <div className="text-center" style={{ borderLeft: "1px solid rgba(255,255,255,0.06)", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-white font-black text-2xl leading-none">{wins}</p>
            <p className="text-gray-600 text-[9px] mt-1 uppercase tracking-wider">ACERTOS</p>
          </div>
          <div className="text-center">
            <p className={cn("font-black text-2xl leading-none", assertividade >= 70 ? "text-green-400" : assertividade >= 50 ? "text-yellow-400" : "text-red-400")}>
              {assertividade}%
            </p>
            <p className="text-gray-600 text-[9px] mt-1 uppercase tracking-wider">ASSERTIVIDADE</p>
          </div>
        </div>

        {/* ===== TAB BAR ===== */}
        <div
          className="flex"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "#0e0e1c" }}
        >
          {(["SINAL", "HISTÓRICO", "GERENCIAMENTO"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors relative",
                activeTab === tab ? "text-white" : "text-gray-600 hover:text-gray-400"
              )}
            >
              {tab}
              {activeTab === tab && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5"
                  style={{ background: "#4d79ff" }}
                />
              )}
            </button>
          ))}
        </div>

        {/* ===== TAB CONTENT ===== */}
        <div className="min-h-[240px]">
          {activeTab === "SINAL" && (
            <SinalTab
              analysisState={analysisState}
              signal={signal}
              countdown={countdown}
              timeframe={selectedTF}
              onStart={startAnalysis}
              onStop={stopAnalysis}
              selectedAsset={selectedAsset}
              analysisCount={analysisCount}
            />
          )}
          {activeTab === "HISTÓRICO" && (
            <HistoricoTab
              trades={trades}
              onClear={() => { setTrades([]); setAnalysisCount(0); setWins(0); }}
            />
          )}
          {activeTab === "GERENCIAMENTO" && (
            <GerenciamentoTab
              email={authStatus.data?.email ?? ""}
              accountType={authStatus.data?.accountType ?? "PRACTICE"}
              balance={balance.data?.balance ?? 0}
              usingRealData={usingReal}
              onLogout={handleLogout}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SinalTab({
  analysisState, signal, countdown, timeframe, onStart, onStop, selectedAsset, analysisCount,
}: {
  analysisState: AnalysisState;
  signal: (Signal & { usingRealData?: boolean }) | null;
  countdown: number;
  timeframe: typeof TIMEFRAMES[0];
  onStart: () => void;
  onStop: () => void;
  selectedAsset: string;
  analysisCount: number;
}) {
  const isCall = signal?.directionFinal === "CALL";

  if (analysisState === "idle") {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 gap-4">
        <div className="text-center">
          <p className="text-gray-500 text-xs mb-1">Pronto para analisar</p>
          <p className="text-gray-400 text-sm font-bold">{selectedAsset} · {timeframe.short}</p>
        </div>
        <button
          onClick={onStart}
          className="w-full py-3 rounded-lg text-sm font-black uppercase tracking-widest transition-all active:scale-95"
          style={{ background: "#4d79ff", color: "white" }}
        >
          ▶ INICIAR
        </button>
      </div>
    );
  }

  if (analysisState === "searching") {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 gap-3">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-2 border-blue-500/30 animate-ping absolute inset-0" />
          <div className="w-12 h-12 rounded-full border-2 border-blue-400/50 flex items-center justify-center relative" style={{ background: "rgba(77,121,255,0.1)" }}>
            <span className="text-xl animate-pulse">📡</span>
          </div>
        </div>
        <div className="text-center">
          <p className="text-blue-400 font-bold text-sm">Analisando {selectedAsset}...</p>
          <p className="text-gray-600 text-[10px] mt-0.5">Aguardando entrada — {analysisCount} análises</p>
        </div>
        <button
          onClick={onStop}
          className="px-6 py-1.5 rounded-lg text-xs font-bold border transition-colors"
          style={{ borderColor: "rgba(255,255,255,0.1)", color: "#888" }}
        >
          PARAR
        </button>
      </div>
    );
  }

  if ((analysisState === "found" || analysisState === "conflict") && signal) {
    const pct = timeframe.value > 0 ? countdown / timeframe.value : 0;
    const mins = Math.floor(countdown / 60);
    const secs = countdown % 60;

    return (
      <div className="px-3 py-3 space-y-3">
        {/* Big direction */}
        <div
          className="rounded-xl p-4 text-center"
          style={{
            background: isCall ? "rgba(0,200,83,0.08)" : "rgba(255,23,68,0.08)",
            border: `1px solid ${isCall ? "rgba(0,200,83,0.25)" : "rgba(255,23,68,0.25)"}`,
          }}
        >
          <p
            className="font-black text-5xl tracking-widest mb-1"
            style={{ color: isCall ? "#00c853" : "#ff1744" }}
          >
            {isCall ? "COMPRA" : "VENDA"}
          </p>
          <div className="flex items-center justify-center gap-3 mt-2">
            <span className="text-gray-500 text-xs">{signal.asset}</span>
            <span className="text-gray-700">·</span>
            <span className="text-gray-500 text-xs">{timeframe.short}</span>
            <span className="text-gray-700">·</span>
            <span
              className="font-bold text-xs"
              style={{ color: isCall ? "#00c853" : "#ff1744" }}
            >
              {signal.confidenceFinal.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Countdown bar */}
        {countdown > 0 && (
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-gray-600 text-[9px] uppercase tracking-wider">Expiração</span>
              <span className="text-gray-300 font-mono text-xs font-bold">
                {mins}:{String(secs).padStart(2, "0")}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: isCall ? "#00c853" : "#ff1744" }}
                animate={{ width: `${pct * 100}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        )}

        {/* Justification */}
        <p className="text-gray-600 text-[10px] text-center leading-relaxed">{signal.justification}</p>

        {/* Analisar de novo */}
        <button
          onClick={onStart}
          className="w-full py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
          style={{ background: "rgba(77,121,255,0.12)", color: "#4d79ff", border: "1px solid rgba(77,121,255,0.2)" }}
        >
          ↺ Nova Análise
        </button>
      </div>
    );
  }

  return null;
}

function HistoricoTab({ trades, onClear }: { trades: TradeEntry[]; onClear: () => void }) {
  if (trades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center px-4">
        <span className="text-3xl mb-2">📋</span>
        <p className="text-gray-600 text-xs">Nenhuma entrada registrada ainda</p>
        <p className="text-gray-700 text-[10px] mt-1">Inicie a análise na aba SINAL</p>
      </div>
    );
  }

  return (
    <div>
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
      >
        <span className="text-gray-600 text-[9px] uppercase tracking-wider">Histórico da sessão</span>
        <button onClick={onClear} className="text-gray-700 hover:text-red-400 text-[9px] transition-colors uppercase tracking-wider">
          Limpar
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
        {trades.map((t, i) => (
          <div
            key={i}
            className="flex items-center px-3 py-2 gap-2"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
          >
            <span className="text-gray-400 font-bold text-xs flex-1">{t.asset}</span>
            <span className="text-gray-600 text-[9px] font-mono">{t.time}</span>
            <span
              className={cn(
                "text-xs font-black px-2 py-0.5 rounded",
                t.direction === "COMPRA"
                  ? "text-green-400"
                  : "text-red-400"
              )}
              style={{
                background: t.direction === "COMPRA" ? "rgba(0,200,83,0.1)" : "rgba(255,23,68,0.1)",
              }}
            >
              {t.direction}
            </span>
            {t.usingRealData ? (
              <Wifi className="w-2.5 h-2.5 text-green-500 shrink-0" />
            ) : (
              <WifiOff className="w-2.5 h-2.5 text-gray-700 shrink-0" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function GerenciamentoTab({
  email, accountType, balance, usingRealData, onLogout,
}: {
  email: string;
  accountType: string;
  balance: number;
  usingRealData: boolean;
  onLogout: () => void;
}) {
  return (
    <div className="px-3 py-3 space-y-3">
      <div className="rounded-lg p-3 space-y-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex justify-between items-center">
          <span className="text-gray-600 text-[10px] uppercase tracking-wider">Email</span>
          <span className="text-gray-300 text-xs truncate max-w-[160px]">{email}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-600 text-[10px] uppercase tracking-wider">Conta</span>
          <span className={cn(
            "text-xs font-bold px-2 py-0.5 rounded",
            accountType === "REAL" ? "text-red-400" : "text-blue-400"
          )}
          style={{
            background: accountType === "REAL" ? "rgba(255,23,68,0.1)" : "rgba(77,121,255,0.1)",
          }}>
            {accountType}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-600 text-[10px] uppercase tracking-wider">Saldo</span>
          <span className="text-white font-bold text-sm">
            ${balance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-600 text-[10px] uppercase tracking-wider">Dados</span>
          <div className="flex items-center gap-1">
            {usingRealData ? (
              <>
                <Wifi className="w-3 h-3 text-green-400" />
                <span className="text-green-400 text-[10px] font-bold">REAL</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-yellow-500" />
                <span className="text-yellow-500 text-[10px] font-bold">SIMULADO</span>
              </>
            )}
          </div>
        </div>
      </div>

      <button
        onClick={onLogout}
        className="w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95"
        style={{ background: "rgba(255,23,68,0.1)", color: "#ff1744", border: "1px solid rgba(255,23,68,0.2)" }}
      >
        <LogOut className="w-3.5 h-3.5" />
        Sair da Conta
      </button>
    </div>
  );
}
