import { useState, useEffect, useRef, useCallback } from "react";
import {
  useGetAuthStatus,
  useGetBalance,
  getGetAuthStatusQueryKey,
  getGetBalanceQueryKey,
  useLogout,
} from "@workspace/api-client-react";
import type { Signal } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import LoginForm from "@/components/LoginForm";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Search, LogOut, MoreVertical, Wifi, WifiOff, Activity } from "lucide-react";

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
type AnalysisState = "searching" | "found" | "waiting";

interface TradeEntry {
  asset: string;
  direction: "COMPRA" | "VENDA";
  confidence: number;
  time: string;
  timeframe: string;
  result?: "WIN" | "LOSS" | "PENDING";
}

interface SignalWithExtra extends Signal {
  usingRealData?: boolean;
}

const SCAN_INTERVAL_MS = 8000;

export default function Dashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const authStatus = useGetAuthStatus({ query: { refetchInterval: 30000, queryKey: getGetAuthStatusQueryKey() } });
  const connected = authStatus.data?.connected ?? false;
  const balance = useGetBalance({
    query: { enabled: connected, refetchInterval: 30000, queryKey: getGetBalanceQueryKey() },
  });
  const logoutMutation = useLogout();

  const [activeTab, setActiveTab] = useState<Tab>("SINAL");
  const [selectedAsset, setSelectedAsset] = useState("GBPUSD-OTC");
  const [selectedTF, setSelectedTF] = useState(TIMEFRAMES[0]);
  const [assetDropdown, setAssetDropdown] = useState(false);
  const [assetSearch, setAssetSearch] = useState("");
  const [analysisState, setAnalysisState] = useState<AnalysisState>("searching");
  const [signal, setSignal] = useState<SignalWithExtra | null>(null);
  const [trades, setTrades] = useState<TradeEntry[]>([]);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<"up" | "down" | "same">("same");
  const [menuOpen, setMenuOpen] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [dots, setDots] = useState(".");
  const [usingRealDataLive, setUsingRealDataLive] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const priceRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dotsRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevPriceRef = useRef<number | null>(null);

  const totalEntries = trades.length;
  const assertividade = totalEntries > 0 ? Math.round((wins / totalEntries) * 100) : 0;

  // ── Dots animation while searching ──────────────────────
  useEffect(() => {
    dotsRef.current = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "." : d + "."));
    }, 500);
    return () => { if (dotsRef.current) clearInterval(dotsRef.current); };
  }, []);

  // ── Real-time price polling (every 2s) ───────────────────
  const fetchPrice = useCallback(async (asset: string) => {
    try {
      const res = await fetch(`/api/price/${asset}`);
      if (!res.ok) return;
      const data = await res.json() as { price: number; usingRealData: boolean };
      setUsingRealDataLive(!!data.usingRealData);
      setCurrentPrice((prev) => {
        prevPriceRef.current = prev;
        if (prev !== null && data.price !== prev) {
          setPriceChange(data.price > prev ? "up" : "down");
          setTimeout(() => setPriceChange("same"), 800);
        }
        return data.price;
      });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!connected) return;
    fetchPrice(selectedAsset);
    priceRef.current = setInterval(() => fetchPrice(selectedAsset), 2000);
    return () => { if (priceRef.current) clearInterval(priceRef.current); };
  }, [connected, selectedAsset, fetchPrice]);

  // ── Analysis engine ──────────────────────────────────────
  const runScan = useCallback(async () => {
    setScanCount((c) => c + 1);
    try {
      const res = await fetch(`/api/signals/${selectedAsset}?duration=${selectedTF.value}`);
      if (!res.ok) return;
      const data = await res.json() as SignalWithExtra;

      if (data.currentPrice) setCurrentPrice(data.currentPrice);

      if (data.directionFinal === "CALL" || data.directionFinal === "PUT") {
        setSignal(data);
        setAnalysisState("found");

        const entry: TradeEntry = {
          asset: selectedAsset,
          direction: data.directionFinal === "CALL" ? "COMPRA" : "VENDA",
          confidence: data.confidenceFinal,
          time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
          timeframe: selectedTF.short,
          result: "PENDING",
        };
        setTrades((prev) => [entry, ...prev.slice(0, 49)]);

        // Stop scanning while signal is active
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }

        // Start countdown
        const secs = selectedTF.value;
        setCountdown(secs);
        countdownRef.current = setInterval(() => {
          setCountdown((c) => {
            if (c <= 1) {
              if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
              return 0;
            }
            return c - 1;
          });
        }, 1000);

        toast({
          title: `📡 SINAL: ${data.directionFinal === "CALL" ? "COMPRA" : "VENDA"} — ${selectedAsset}`,
          description: `Confiança: ${data.confidenceFinal.toFixed(0)}% · ${selectedTF.short}`,
        });
      }
    } catch { /* ignore */ }
  }, [selectedAsset, selectedTF, toast]);

  const startSearching = useCallback(() => {
    setAnalysisState("searching");
    setSignal(null);
    setCountdown(0);
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    runScan();
    intervalRef.current = setInterval(runScan, SCAN_INTERVAL_MS);
  }, [runScan]);

  // Auto-start on login
  useEffect(() => {
    if (connected) {
      startSearching();
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [connected]);

  // Auto-restart after countdown finishes
  useEffect(() => {
    if (countdown === 0 && analysisState === "found") {
      const t = setTimeout(() => {
        startSearching();
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [countdown, analysisState, startSearching]);

  // Restart when asset or timeframe changes
  useEffect(() => {
    if (!connected) return;
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setCurrentPrice(null);
    startSearching();
  }, [selectedAsset, selectedTF.value]);

  const handleLogout = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (priceRef.current) clearInterval(priceRef.current);
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
    if (!p) return "— — —";
    if (p > 1000) return p.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return p.toLocaleString("pt-BR", { minimumFractionDigits: 5, maximumFractionDigits: 5 });
  };

  if (!connected && !authStatus.isLoading) return <LoginForm />;

  const isCall = signal?.directionFinal === "CALL";
  const usingReal = usingRealDataLive;

  return (
    <div className="w-full max-w-sm font-mono select-none">
      <div
        className="rounded-xl overflow-hidden shadow-2xl border"
        style={{ background: "#0d0d18", borderColor: "rgba(255,255,255,0.07)" }}
      >
        {/* ── BANNER DADOS SIMULADOS ── */}
        <AnimatePresence>
          {!usingReal && connected && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div
                className="flex items-center justify-between px-3 py-2"
                style={{ background: "rgba(255,23,68,0.12)", borderBottom: "1px solid rgba(255,23,68,0.25)" }}
              >
                <div className="flex items-center gap-2">
                  <WifiOff className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <div>
                    <p className="text-red-400 text-[10px] font-black uppercase tracking-wider">DADOS SIMULADOS</p>
                    <p className="text-red-500/60 text-[9px]">Conexão com IQ Option perdida</p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="text-[9px] font-black px-2.5 py-1.5 rounded-lg uppercase tracking-widest transition-all active:scale-95"
                  style={{ background: "rgba(255,23,68,0.2)", color: "#ff4444", border: "1px solid rgba(255,23,68,0.4)" }}
                >
                  Reconectar
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── HEADER ── */}
        <div
          className="flex items-center justify-between px-3 py-2.5"
          style={{ background: "#12122a", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center text-sm" style={{ background: "#3a5cff" }}>⚡</div>
            <span className="text-white font-black text-[11px] tracking-widest uppercase">EXTERMINADOR DA PORRA</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded-full"
              style={{
                background: usingReal ? "rgba(0,230,118,0.1)" : "rgba(255,23,68,0.1)",
                border: `1px solid ${usingReal ? "rgba(0,230,118,0.3)" : "rgba(255,23,68,0.3)"}`,
              }}
            >
              {usingReal
                ? <Wifi className="w-2.5 h-2.5 text-green-400" />
                : <WifiOff className="w-2.5 h-2.5 text-red-400" />}
              <span
                className="text-[9px] font-black uppercase tracking-wider"
                style={{ color: usingReal ? "#4ade80" : "#ff4444" }}
              >
                {usingReal ? "REAL" : "SIMULADO"}
              </span>
            </div>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setMenuOpen(!menuOpen)}
              onKeyDown={(e) => e.key === "Enter" && setMenuOpen(!menuOpen)}
              className="text-gray-500 hover:text-white transition-colors relative p-0.5 cursor-pointer"
            >
              <MoreVertical className="w-4 h-4" />
              {menuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 rounded-lg overflow-hidden z-50 w-40 shadow-xl"
                  style={{ background: "#1c1c30", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <div className="px-3 py-2 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <p className="text-[9px] text-gray-600 uppercase tracking-wider">Saldo</p>
                    <p className="text-white text-xs font-bold">
                      {balance.data?.currency} {balance.data?.balance?.toFixed(2) ?? "0.00"}
                    </p>
                    <p className="text-[9px] text-gray-600 mt-0.5">{authStatus.data?.accountType}</p>
                  </div>
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

        {/* ── ATIVO + PREÇO ── */}
        <div
          className="flex items-center justify-between px-3 py-2.5"
          style={{ background: "#0f0f24", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
        >
          <div className="relative">
            <button
              onClick={() => { setAssetDropdown(!assetDropdown); setAssetSearch(""); }}
              className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
            >
              <span className="text-white font-black text-xl tracking-wide">{selectedAsset}</span>
              <ChevronDown className={cn("w-4 h-4 text-gray-500 transition-transform", assetDropdown && "rotate-180")} />
            </button>

            <AnimatePresence>
              {assetDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.1 }}
                  className="absolute top-full mt-1 left-0 z-50 w-56 rounded-xl overflow-hidden shadow-2xl"
                  style={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <div className="p-2 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                      <input
                        autoFocus
                        value={assetSearch}
                        onChange={(e) => setAssetSearch(e.target.value)}
                        placeholder="Buscar ativo..."
                        className="w-full bg-white/5 rounded-lg pl-7 pr-2 py-1.5 text-xs text-white focus:outline-none placeholder:text-gray-600"
                      />
                    </div>
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    {Object.entries(filteredAssets).map(([cat, assets]) => (
                      <div key={cat}>
                        <p className="px-3 py-1 text-[9px] text-gray-600 uppercase tracking-widest font-bold">{cat}</p>
                        {assets.map((asset) => (
                          <button
                            key={asset}
                            onClick={() => { setSelectedAsset(asset); setAssetDropdown(false); }}
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

          {/* Preço em tempo real */}
          <div className="text-right">
            <p
              className={cn(
                "font-black text-base tabular-nums transition-colors duration-300",
                priceChange === "up" ? "text-green-400" : priceChange === "down" ? "text-red-400" : "text-white"
              )}
            >
              {formatPrice(currentPrice)}
            </p>
            <div className="flex items-center justify-end gap-1 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <p className="text-gray-600 text-[9px]">preço ao vivo</p>
            </div>
          </div>
        </div>

        {/* ── TIMEFRAME ── */}
        <div
          className="flex gap-0 px-3 py-2"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
        >
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              onClick={() => setSelectedTF(tf)}
              className={cn(
                "flex-1 py-1.5 text-xs font-bold transition-all rounded",
                selectedTF.value === tf.value ? "text-white" : "text-gray-600 hover:text-gray-400"
              )}
              style={selectedTF.value === tf.value ? { background: "rgba(58,92,255,0.15)", color: "#6e8fff" } : {}}
            >
              {tf.short}
            </button>
          ))}
        </div>

        {/* ── STATS ── */}
        <div
          className="grid grid-cols-3 px-3 py-3 gap-2"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "#0b0b1e" }}
        >
          <div className="text-center">
            <p className="text-white font-black text-2xl leading-none">{totalEntries}</p>
            <p className="text-gray-700 text-[9px] mt-1 uppercase tracking-wider">ENTRADAS</p>
          </div>
          <div
            className="text-center"
            style={{ borderLeft: "1px solid rgba(255,255,255,0.05)", borderRight: "1px solid rgba(255,255,255,0.05)" }}
          >
            <p className="text-white font-black text-2xl leading-none">{wins}</p>
            <p className="text-gray-700 text-[9px] mt-1 uppercase tracking-wider">ACERTOS</p>
          </div>
          <div className="text-center">
            <p
              className={cn(
                "font-black text-2xl leading-none",
                assertividade >= 70 ? "text-green-400" : assertividade >= 50 ? "text-yellow-400" : totalEntries === 0 ? "text-gray-600" : "text-red-400"
              )}
            >
              {assertividade}%
            </p>
            <p className="text-gray-700 text-[9px] mt-1 uppercase tracking-wider">ASSERTIVIDADE</p>
          </div>
        </div>

        {/* ── TABS ── */}
        <div
          className="flex"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "#0b0b1e" }}
        >
          {(["SINAL", "HISTÓRICO", "GERENCIAMENTO"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 py-2 text-[9px] font-bold uppercase tracking-widest transition-colors relative",
                activeTab === tab ? "text-white" : "text-gray-600 hover:text-gray-500"
              )}
            >
              {tab}
              {activeTab === tab && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5"
                  style={{ background: "#3a5cff" }}
                />
              )}
            </button>
          ))}
        </div>

        {/* ── TAB CONTENT ── */}
        <div className="min-h-[260px]">
          {activeTab === "SINAL" && (
            <SinalTab
              analysisState={analysisState}
              signal={signal}
              countdown={countdown}
              timeframe={selectedTF}
              selectedAsset={selectedAsset}
              scanCount={scanCount}
              dots={dots}
            />
          )}
          {activeTab === "HISTÓRICO" && (
            <HistoricoTab
              trades={trades}
              onClear={() => { setTrades([]); setWins(0); setLosses(0); }}
              onMarkResult={(idx, result) => {
                setTrades((prev) => prev.map((t, i) => i === idx ? { ...t, result } : t));
                if (result === "WIN") setWins((w) => w + 1);
                if (result === "LOSS") setLosses((l) => l + 1);
              }}
            />
          )}
          {activeTab === "GERENCIAMENTO" && (
            <GerenciamentoTab
              email={authStatus.data?.email ?? ""}
              accountType={authStatus.data?.accountType ?? "PRACTICE"}
              balance={balance.data?.balance ?? 0}
              currency={balance.data?.currency ?? "USD"}
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
  analysisState,
  signal,
  countdown,
  timeframe,
  selectedAsset,
  scanCount,
  dots,
}: {
  analysisState: AnalysisState;
  signal: (Signal & { usingRealData?: boolean }) | null;
  countdown: number;
  timeframe: (typeof TIMEFRAMES)[0];
  selectedAsset: string;
  scanCount: number;
  dots: string;
}) {
  const isCall = signal?.directionFinal === "CALL";

  if (analysisState === "searching") {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 gap-4">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-2 border-blue-500/20 animate-ping" />
          <div className="absolute inset-1 rounded-full border-2 border-blue-400/30 animate-ping" style={{ animationDelay: "0.15s" }} />
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center relative"
            style={{ background: "radial-gradient(circle, rgba(58,92,255,0.15), transparent)", border: "1px solid rgba(58,92,255,0.3)" }}
          >
            <Activity className="w-7 h-7 text-blue-400 animate-pulse" />
          </div>
        </div>

        <div className="text-center space-y-1">
          <p className="text-blue-400 font-black text-sm tracking-wider">
            ANALISANDO{dots}
          </p>
          <p className="text-gray-400 text-xs font-bold">{selectedAsset} · {timeframe.short}</p>
          <p className="text-gray-700 text-[10px]">
            Aguardando confluência de sinais — {scanCount} verificações
          </p>
        </div>

        <div
          className="w-full px-4 py-3 rounded-lg text-center"
          style={{ background: "rgba(58,92,255,0.05)", border: "1px solid rgba(58,92,255,0.15)" }}
        >
          <p className="text-gray-600 text-[9px] uppercase tracking-widest mb-1.5">VERIFICANDO</p>
          <div className="flex justify-center gap-3 flex-wrap">
            {["RSI", "MACD", "Bollinger", "Estocástico", "Price Action", "Tendência"].map((s) => (
              <span key={s} className="text-[9px] text-blue-500/60 font-mono">
                {s}
              </span>
            ))}
          </div>
        </div>

        <p className="text-gray-700 text-[9px] text-center leading-relaxed">
          A IA analisa automaticamente · Você será avisado<br />quando encontrar uma entrada boa
        </p>
      </div>
    );
  }

  if ((analysisState === "found" || analysisState === "waiting") && signal) {
    const pct = countdown > 0 ? countdown / timeframe.value : 0;
    const mins = Math.floor(countdown / 60);
    const secs = countdown % 60;
    const expired = countdown === 0;

    return (
      <div className="px-3 py-3 space-y-3">
        {/* Direção */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="rounded-xl p-4 text-center"
          style={{
            background: isCall
              ? "linear-gradient(135deg, rgba(0,200,83,0.10), rgba(0,200,83,0.03))"
              : "linear-gradient(135deg, rgba(255,23,68,0.10), rgba(255,23,68,0.03))",
            border: `1px solid ${isCall ? "rgba(0,200,83,0.3)" : "rgba(255,23,68,0.3)"}`,
          }}
        >
          <p
            className="font-black text-5xl tracking-widest"
            style={{ color: isCall ? "#00e676" : "#ff1744" }}
          >
            {isCall ? "COMPRA" : "VENDA"}
          </p>
          <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
            <span className="text-gray-500 text-[10px] font-mono">{signal.asset}</span>
            <span className="text-gray-700">·</span>
            <span className="text-gray-500 text-[10px] font-mono">{timeframe.short}</span>
            <span className="text-gray-700">·</span>
            <span
              className="font-black text-sm"
              style={{ color: isCall ? "#00e676" : "#ff1744" }}
            >
              {signal.confidenceFinal.toFixed(0)}%
            </span>
          </div>

          {/* Mini indicadores */}
          <div className="flex justify-center gap-2 mt-3 flex-wrap">
            {[
              { label: "RSI", dir: signal.directionRSI },
              { label: "MACD", dir: signal.directionML },
              { label: "PA", dir: signal.directionPA },
            ].map(({ label, dir }) => (
              <span
                key={label}
                className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                style={{
                  background: dir === "CALL"
                    ? "rgba(0,230,118,0.12)"
                    : dir === "PUT"
                    ? "rgba(255,23,68,0.12)"
                    : "rgba(255,255,255,0.05)",
                  color: dir === "CALL" ? "#00e676" : dir === "PUT" ? "#ff1744" : "#555",
                }}
              >
                {label}: {dir === "CALL" ? "↑" : dir === "PUT" ? "↓" : "–"}
              </span>
            ))}
          </div>
        </motion.div>

        {/* Countdown */}
        {!expired ? (
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-gray-600 text-[9px] uppercase tracking-widest">Expiração</span>
              <span className="font-mono font-black text-sm" style={{ color: isCall ? "#00e676" : "#ff1744" }}>
                {mins}:{String(secs).padStart(2, "0")}
              </span>
            </div>
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: isCall ? "#00e676" : "#ff1744" }}
                animate={{ width: `${pct * 100}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        ) : (
          <div className="text-center py-2">
            <p className="text-gray-600 text-xs animate-pulse">Retomando análise em instantes...</p>
          </div>
        )}

        {/* Justificativa */}
        <div
          className="px-3 py-2 rounded-lg"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
        >
          <p className="text-gray-500 text-[10px] leading-relaxed text-center">{signal.justification}</p>
        </div>

        {/* Indicadores detalhados */}
        {signal.indicators?.rsi && (
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { label: "RSI", value: signal.indicators.rsi.toFixed(1) },
              { label: "BB%", value: signal.indicators.bbMiddle ? ((signal.price - signal.indicators.bbLower!) / ((signal.indicators.bbUpper! - signal.indicators.bbLower!) || 1) * 100).toFixed(0) + "%" : "—" },
              { label: "HIST", value: signal.indicators.macdHistogram ? (signal.indicators.macdHistogram > 0 ? "+" : "") + signal.indicators.macdHistogram.toFixed(5) : "—" },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="text-center py-1.5 rounded"
                style={{ background: "rgba(255,255,255,0.03)" }}
              >
                <p className="text-gray-600 text-[8px] uppercase">{label}</p>
                <p className="text-gray-300 text-[10px] font-mono font-bold">{value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}

function HistoricoTab({
  trades,
  onClear,
  onMarkResult,
}: {
  trades: TradeEntry[];
  onClear: () => void;
  onMarkResult: (idx: number, result: "WIN" | "LOSS") => void;
}) {
  if (trades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center px-4">
        <span className="text-3xl mb-2">📋</span>
        <p className="text-gray-600 text-xs">Nenhuma entrada ainda</p>
        <p className="text-gray-700 text-[10px] mt-1">A IA está analisando o mercado automaticamente</p>
      </div>
    );
  }
  return (
    <div>
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
      >
        <span className="text-gray-600 text-[9px] uppercase tracking-widest">Histórico · {trades.length} entradas</span>
        <button onClick={onClear} className="text-gray-700 hover:text-red-400 text-[9px] transition-colors uppercase tracking-wider">Limpar</button>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {trades.map((t, i) => (
          <div
            key={i}
            className="flex items-center px-3 py-2 gap-2"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
          >
            <span className="text-gray-400 text-[10px] font-bold w-24 shrink-0">{t.asset}</span>
            <span className="text-gray-700 text-[9px] font-mono">{t.time}</span>
            <span
              className="text-[10px] font-black px-1.5 py-0.5 rounded shrink-0"
              style={{
                background: t.direction === "COMPRA" ? "rgba(0,200,83,0.1)" : "rgba(255,23,68,0.1)",
                color: t.direction === "COMPRA" ? "#00e676" : "#ff1744",
              }}
            >
              {t.direction}
            </span>
            <span className="text-gray-600 text-[9px] shrink-0">{t.confidence.toFixed(0)}%</span>
            {t.result === "PENDING" ? (
              <div className="flex gap-1 ml-auto shrink-0">
                <button
                  onClick={() => onMarkResult(i, "WIN")}
                  className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                  style={{ background: "rgba(0,200,83,0.1)", color: "#00e676" }}
                >WIN</button>
                <button
                  onClick={() => onMarkResult(i, "LOSS")}
                  className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                  style={{ background: "rgba(255,23,68,0.1)", color: "#ff1744" }}
                >LOSS</button>
              </div>
            ) : (
              <span
                className="text-[9px] font-black ml-auto shrink-0"
                style={{ color: t.result === "WIN" ? "#00e676" : "#ff1744" }}
              >{t.result}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function GerenciamentoTab({
  email, accountType, balance, currency, usingRealData, onLogout,
}: {
  email: string;
  accountType: string;
  balance: number;
  currency: string;
  usingRealData: boolean;
  onLogout: () => void;
}) {
  return (
    <div className="px-4 py-4 space-y-3">
      <div
        className="rounded-lg p-3 space-y-2"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <p className="text-gray-600 text-[9px] uppercase tracking-widest">Conta IQ Option</p>
        <p className="text-white text-xs font-bold">{email}</p>
        <div className="flex items-center justify-between">
          <span
            className="text-[9px] px-2 py-0.5 rounded font-bold"
            style={{
              background: accountType === "REAL" ? "rgba(0,200,83,0.1)" : "rgba(255,200,0,0.1)",
              color: accountType === "REAL" ? "#00e676" : "#ffd700",
            }}
          >
            {accountType}
          </span>
          <span className="text-white font-black text-sm">
            {currency} {balance.toFixed(2)}
          </span>
        </div>
      </div>

      <div
        className="rounded-lg p-3"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <p className="text-gray-600 text-[9px] uppercase tracking-widest mb-2">Status da IA</p>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <p className="text-green-400 text-xs font-bold">Analisando continuamente</p>
        </div>
        <p className="text-gray-600 text-[9px] mt-1">
          Dados: {usingRealData ? "Mercado real (IQ Option)" : "Dados simulados"}
        </p>
      </div>

      <button
        onClick={onLogout}
        className="w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all"
        style={{ background: "rgba(255,23,68,0.08)", color: "#ff4444", border: "1px solid rgba(255,23,68,0.2)" }}
      >
        Sair da Conta
      </button>
    </div>
  );
}
