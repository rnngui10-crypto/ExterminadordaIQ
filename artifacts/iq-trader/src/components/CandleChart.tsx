import { useMemo } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { Candle } from "@workspace/api-client-react";

interface CandleChartProps {
  candles: Candle[];
  bbUpper?: number;
  bbMiddle?: number;
  bbLower?: number;
  ma5?: number;
  ma20?: number;
}

function CustomCandlestick(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: { open: number; close: number; high: number; low: number; midY: number; range: number };
}) {
  const { x = 0, y = 0, width = 0, payload } = props;
  if (!payload) return null;

  const { open, close, high, low, midY, range } = payload;
  const isUp = close >= open;
  const color = isUp ? "#00e676" : "#ff1744";
  const candleHeight = Math.max(1, Math.abs(close - open) / range * 120);
  const bodyY = isUp ? midY - candleHeight / 2 : midY + candleHeight / 2;
  const wickHighY = midY - ((high - Math.max(open, close)) / range) * 120;
  const wickLowY = midY + ((Math.min(open, close) - low) / range) * 120;
  const cx = x + width / 2;

  return (
    <g>
      <line x1={cx} y1={wickHighY} x2={cx} y2={bodyY} stroke={color} strokeWidth={1} />
      <rect
        x={x + 1}
        y={isUp ? bodyY - candleHeight : bodyY}
        width={Math.max(1, width - 2)}
        height={Math.max(1, candleHeight)}
        fill={color}
        opacity={0.85}
      />
      <line x1={cx} y1={isUp ? bodyY : bodyY + candleHeight} x2={cx} y2={wickLowY} stroke={color} strokeWidth={1} />
    </g>
  );
}

export default function CandleChart({ candles, bbUpper, bbLower, ma5, ma20 }: CandleChartProps) {
  const data = useMemo(() => {
    if (!candles || candles.length === 0) return [];
    const prices = candles.flatMap((c) => [c.high, c.low]);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const range = maxP - minP || 1;

    return candles.slice(-50).map((c) => ({
      time: new Date(c.time * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      open: c.open,
      close: c.close,
      high: c.high,
      low: c.low,
      midY: 60 + ((maxP - (c.open + c.close) / 2) / range) * 120,
      range,
      closeNorm: c.close,
    }));
  }, [candles]);

  if (data.length === 0) return <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">Carregando candles...</div>;

  const closes = data.map((d) => d.closeNorm);
  const minC = Math.min(...closes);
  const maxC = Math.max(...closes);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
        <XAxis
          dataKey="time"
          tick={{ fill: "#4a5568", fontSize: 9, fontFamily: "JetBrains Mono" }}
          tickLine={false}
          axisLine={false}
          interval={9}
        />
        <YAxis
          domain={[minC * 0.9998, maxC * 1.0002]}
          tick={{ fill: "#4a5568", fontSize: 9, fontFamily: "JetBrains Mono" }}
          tickLine={false}
          axisLine={false}
          width={60}
          tickFormatter={(v: number) => v.toFixed(4)}
        />
        <Tooltip
          contentStyle={{ background: "#0f1117", border: "1px solid #1e2433", borderRadius: "6px", fontSize: 11, fontFamily: "JetBrains Mono" }}
          labelStyle={{ color: "#6b7280" }}
          formatter={(value: number) => [value.toFixed(5), ""]}
        />
        {bbUpper && <ReferenceLine y={bbUpper} stroke="#4a5568" strokeDasharray="3 3" strokeWidth={1} />}
        {bbLower && <ReferenceLine y={bbLower} stroke="#4a5568" strokeDasharray="3 3" strokeWidth={1} />}
        {ma5 && <ReferenceLine y={ma5} stroke="#00b0ff" strokeDasharray="4 2" strokeWidth={1} />}
        {ma20 && <ReferenceLine y={ma20} stroke="#ff9100" strokeDasharray="4 2" strokeWidth={1} />}
        <Bar dataKey="closeNorm" shape={<CustomCandlestick />} isAnimationActive={false} />
        <Line type="monotone" dataKey="closeNorm" stroke="transparent" dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
