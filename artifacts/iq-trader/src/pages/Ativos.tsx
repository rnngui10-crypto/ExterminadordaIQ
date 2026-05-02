import { useState } from "react";
import { useGetAssets, useGetCandles, useGetSignalByAsset, getGetCandlesQueryKey, getGetSignalByAssetQueryKey } from "@workspace/api-client-react";
import CandleChart from "@/components/CandleChart";
import IndicatorGauge from "@/components/IndicatorGauge";
import SignalCard from "@/components/SignalCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronDown, RefreshCw, BarChart2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

const TIMEFRAMES = [
  { label: "1 minuto", value: 60 },
  { label: "5 minutos", value: 300 },
  { label: "15 minutos", value: 900 },
];

export default function Ativos() {
  const queryClient = useQueryClient();
  const [selectedAsset, setSelectedAsset] = useState("EURUSD");
  const [timeframe, setTimeframe] = useState(60);

  const assets = useGetAssets();
  const categories = assets.data?.categories ?? [];

  const candles = useGetCandles(
    selectedAsset,
    { timeframe, count: 60 },
    {
      query: {
        enabled: !!selectedAsset,
        refetchInterval: 10000,
        queryKey: getGetCandlesQueryKey(selectedAsset, { timeframe, count: 60 }),
      },
    }
  );

  const signal = useGetSignalByAsset(selectedAsset, {
    query: {
      enabled: !!selectedAsset,
      refetchInterval: 5000,
      queryKey: getGetSignalByAssetQueryKey(selectedAsset),
    },
  });

  const indicators = signal.data?.indicators;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="border-b border-border px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Explorador de Ativos</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Análise detalhada com indicadores técnicos</p>
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 font-mono" data-testid="select-asset">
                <BarChart2 className="w-3.5 h-3.5" />
                {selectedAsset}
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto min-w-[180px]">
              {categories.map((cat) => (
                <div key={cat.name}>
                  <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">{cat.name}</DropdownMenuLabel>
                  {cat.assets.map((a) => (
                    <DropdownMenuItem
                      key={a}
                      onClick={() => setSelectedAsset(a)}
                      className={cn("font-mono text-xs", selectedAsset === a && "text-primary")}
                    >
                      {a}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" data-testid="select-timeframe">
                {TIMEFRAMES.find((t) => t.value === timeframe)?.label}
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {TIMEFRAMES.map((t) => (
                <DropdownMenuItem key={t.value} onClick={() => setTimeframe(t.value)} className={cn(timeframe === t.value && "text-primary")}>
                  {t.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            data-testid="button-refresh-asset"
            variant="ghost"
            size="sm"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: getGetCandlesQueryKey(selectedAsset) });
              queryClient.invalidateQueries({ queryKey: getGetSignalByAssetQueryKey(selectedAsset) });
            }}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", (candles.isFetching || signal.isFetching) && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-card border border-card-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono font-semibold text-foreground">{selectedAsset}</span>
              {candles.data?.candles && (
                <span className="text-xs font-mono text-muted-foreground">
                  Último: {candles.data.candles[candles.data.candles.length - 1]?.close.toFixed(5)}
                </span>
              )}
            </div>
            {candles.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : candles.data?.candles ? (
              <CandleChart
                candles={candles.data.candles}
                bbUpper={indicators?.bbUpper}
                bbLower={indicators?.bbLower}
                ma5={indicators?.ma5}
                ma20={indicators?.ma20}
              />
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                Selecione um ativo para ver o gráfico
              </div>
            )}
            <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground font-mono">
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-px bg-[#00b0ff]" /> MA5</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-px bg-[#ff9100]" style={{borderTop: "1px dashed"}} /> MA20</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-px bg-[#4a5568]" style={{borderTop: "1px dashed"}} /> Bollinger</span>
            </div>
          </div>

          {/* Indicators */}
          <div className="bg-card border border-card-border rounded-lg p-4">
            <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-4">Indicadores Técnicos</h3>
            {signal.isLoading ? (
              <div className="grid grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <IndicatorGauge label="RSI (14)" value={indicators?.rsi} min={0} max={100} unit="" decimals={1} />
                <IndicatorGauge label="MACD" value={indicators?.macd} min={-0.01} max={0.01} decimals={5} />
                <IndicatorGauge label="Sinal MACD" value={indicators?.macdSignal} min={-0.01} max={0.01} decimals={5} />
                <IndicatorGauge label="Histograma MACD" value={indicators?.macdHistogram} min={-0.005} max={0.005} decimals={5} />
                <IndicatorGauge label="MA (5)" value={indicators?.ma5} min={(indicators?.ma20 ?? 1) * 0.99} max={(indicators?.ma20 ?? 1) * 1.01} decimals={5} />
                <IndicatorGauge label="MA (20)" value={indicators?.ma20} min={(indicators?.ma20 ?? 1) * 0.99} max={(indicators?.ma20 ?? 1) * 1.01} decimals={5} />
                <IndicatorGauge label="Bollinger Superior" value={indicators?.bbUpper} min={(indicators?.bbMiddle ?? 1) * 0.99} max={(indicators?.bbMiddle ?? 1) * 1.01} decimals={5} />
                <IndicatorGauge label="Bollinger Inferior" value={indicators?.bbLower} min={(indicators?.bbMiddle ?? 1) * 0.99} max={(indicators?.bbMiddle ?? 1) * 1.01} decimals={5} />
              </div>
            )}
          </div>
        </div>

        {/* Signal */}
        <div className="space-y-3">
          <h3 className="text-xs text-muted-foreground uppercase tracking-wider px-1">Sinal Atual</h3>
          {signal.isLoading ? (
            <Skeleton className="h-64 rounded-lg" />
          ) : signal.data ? (
            <SignalCard signal={signal.data} />
          ) : (
            <div className="bg-card border border-card-border rounded-lg p-6 text-center">
              <p className="text-sm text-muted-foreground">Sem sinal para este ativo</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
