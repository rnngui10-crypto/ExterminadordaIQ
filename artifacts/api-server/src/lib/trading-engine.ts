import type { Signal } from "@workspace/api-zod";

export const ASSETS: Record<string, string[]> = {
  "Forex Principais": ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD"],
  "Forex Crosses": ["EURGBP", "EURJPY", "GBPJPY", "AUDJPY", "CADJPY", "EURCAD", "EURAUD", "GBPCAD"],
  "Forex Exóticos": ["USDBRL", "USDTRY", "USDZAR", "USDMXN", "USDSEK", "USDNOK"],
  "Criptomoedas": ["BTCUSD", "ETHUSD", "DOGEUSD", "SOLUSD", "ADAUSD", "XRPUSD"],
  "Índices": ["US30", "US500", "NAS100", "GER30", "UK100", "JP225"],
  "Commodities": ["XAUUSD", "XAGUSD", "USOUSD"],
};

export const OTC_ASSETS = new Set([
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD",
  "EURGBP", "EURJPY", "GBPJPY", "BTCUSD", "ETHUSD",
  "DOGEUSD", "XAUUSD", "US30", "NAS100",
]);

function detectMarketMode(asset: string): "OTC" | "REAL" {
  const now = new Date();
  const dayUTC = now.getUTCDay();
  const hourUTC = now.getUTCHours();
  const isWeekend =
    dayUTC === 0 ||
    dayUTC === 6 ||
    (dayUTC === 5 && hourUTC >= 22) ||
    (dayUTC === 0 && hourUTC < 22);
  return isWeekend && OTC_ASSETS.has(asset) ? "OTC" : "REAL";
}

function getCategoryForAsset(asset: string): string {
  for (const [cat, assets] of Object.entries(ASSETS)) {
    if (assets.includes(asset)) return cat;
  }
  return "Outros";
}

interface Candle {
  time: number;
  open: number;
  close: number;
  high: number;
  low: number;
  volume?: number;
}

interface IndicatorResult {
  rsi?: number;
  macd?: number;
  macdSignal?: number;
  macdHistogram?: number;
  bbUpper?: number;
  bbMiddle?: number;
  bbLower?: number;
  ma5?: number;
  ma10?: number;
  ma20?: number;
}

function calcIndicators(candles: Candle[]): IndicatorResult {
  if (candles.length < 20) return {};
  const closes = candles.map((c) => c.close);

  const ma = (n: number) => {
    const slice = closes.slice(-n);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  };

  const ma5 = ma(5);
  const ma10 = ma(10);
  const ma20 = ma(20);

  const slice20 = closes.slice(-20);
  const mean = ma20;
  const std = Math.sqrt(slice20.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / 20);
  const bbUpper = mean + 2 * std;
  const bbLower = mean - 2 * std;

  const deltas = closes.slice(1).map((v, i) => v - closes[i]);
  const last14Gains = deltas.slice(-14).map((d) => (d > 0 ? d : 0));
  const last14Losses = deltas.slice(-14).map((d) => (d < 0 ? -d : 0));
  const avgGain = last14Gains.reduce((a, b) => a + b, 0) / 14;
  const avgLoss = last14Losses.reduce((a, b) => a + b, 0) / 14;
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);

  const ema = (data: number[], span: number) => {
    const k = 2 / (span + 1);
    let emaVal = data[0];
    for (let i = 1; i < data.length; i++) {
      emaVal = data[i] * k + emaVal * (1 - k);
    }
    return emaVal;
  };
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macd = ema12 - ema26;
  const macdSignal = ema([macd], 9);
  const macdHistogram = macd - macdSignal;

  return { rsi, macd, macdSignal, macdHistogram, bbUpper, bbMiddle: mean, bbLower, ma5, ma10, ma20 };
}

function priceActionSignal(candles: Candle[]): { direction: "CALL" | "PUT" | "NEUTRO"; confidence: number } {
  if (candles.length < 5) return { direction: "NEUTRO", confidence: 0 };

  const cur = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  const open = cur.open;
  const close = cur.close;
  const high = cur.high;
  const low = cur.low;
  const body = Math.abs(close - open);
  const upperShadow = high - Math.max(open, close);
  const lowerShadow = Math.min(open, close) - low;

  if (prev.close < prev.open && close > open && close > prev.open && open < prev.close) {
    return { direction: "CALL", confidence: 85 };
  }
  if (prev.close > prev.open && close < open && close < prev.close && open > prev.open) {
    return { direction: "PUT", confidence: 85 };
  }
  if (lowerShadow > body * 2 && upperShadow < body * 0.5 && close > open) {
    return { direction: "CALL", confidence: 80 };
  }
  if (upperShadow > body * 2 && lowerShadow < body * 0.5 && close < open) {
    return { direction: "PUT", confidence: 80 };
  }
  if (lowerShadow > body * 2 && upperShadow < body * 0.3) {
    return { direction: "CALL", confidence: 75 };
  }
  if (upperShadow > body * 2 && lowerShadow < body * 0.3) {
    return { direction: "PUT", confidence: 75 };
  }
  return { direction: "NEUTRO", confidence: 0 };
}

function mlSignal(indicators: IndicatorResult): { direction: "CALL" | "PUT" | "NEUTRO"; confidence: number } {
  if (indicators.rsi === undefined) return { direction: "NEUTRO", confidence: 0 };

  let score = 50;

  if (indicators.rsi !== undefined) {
    if (indicators.rsi < 30) score += 20;
    else if (indicators.rsi < 40) score += 10;
    else if (indicators.rsi > 70) score -= 20;
    else if (indicators.rsi > 60) score -= 10;
  }

  if (indicators.macdHistogram !== undefined) {
    score += indicators.macdHistogram > 0 ? 15 : -15;
  }

  if (indicators.ma5 !== undefined && indicators.ma20 !== undefined) {
    score += indicators.ma5 > indicators.ma20 ? 10 : -10;
  }

  if (indicators.bbUpper !== undefined && indicators.bbLower !== undefined && indicators.bbMiddle !== undefined) {
    const lastPrice = indicators.bbMiddle;
    if (lastPrice < indicators.bbLower) score += 10;
    else if (lastPrice > indicators.bbUpper) score -= 10;
  }

  if (score > 70) return { direction: "CALL", confidence: Math.min(95, score) };
  if (score < 30) return { direction: "PUT", confidence: Math.min(95, 100 - score) };
  return { direction: "NEUTRO", confidence: 0 };
}

function rsiSignal(rsi?: number): { direction: "CALL" | "PUT" | "NEUTRO"; confidence: number } {
  if (rsi === undefined) return { direction: "NEUTRO", confidence: 0 };
  if (rsi < 25) return { direction: "CALL", confidence: 88 };
  if (rsi < 30) return { direction: "CALL", confidence: 78 };
  if (rsi > 75) return { direction: "PUT", confidence: 88 };
  if (rsi > 70) return { direction: "PUT", confidence: 78 };
  return { direction: "NEUTRO", confidence: 0 };
}

export function generateMockCandles(asset: string, count = 100, durationSecs = 60): Candle[] {
  const assetSeed = asset.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const now = Math.floor(Date.now() / 1000);
  // Align to candle boundaries so candles are consistent within same minute
  const alignedNow = Math.floor(now / durationSecs) * durationSecs;

  // Base price keyed per asset
  const basePrices: Record<string, number> = {
    EURUSD: 1.0850, GBPUSD: 1.2650, USDJPY: 149.50, AUDUSD: 0.6530,
    USDCAD: 1.3620, USDCHF: 0.9050, NZDUSD: 0.6010,
    EURGBP: 0.8580, EURJPY: 162.30, GBPJPY: 189.20, AUDJPY: 97.60,
    EURCAD: 1.4780, EURAUD: 1.6610,
    BTCUSD: 62500, ETHUSD: 3150, DOGEUSD: 0.1520, SOLUSD: 148.0, XRPUSD: 0.5210,
    USDBRL: 5.0200, USDTRY: 32.40, USDZAR: 18.70, USDMXN: 16.80,
    US30: 38200, US500: 5100, NAS100: 17800, GER30: 17600, UK100: 7900, JP225: 38500,
    XAUUSD: 2310, XAGUSD: 27.40, USOUSD: 82.50,
  };

  let price = basePrices[asset] ?? (1.0 + (assetSeed % 200) / 100);
  const volatility = price > 1000 ? price * 0.0008 : price > 100 ? price * 0.001 : 0.0012;
  const candles: Candle[] = [];

  for (let i = count; i >= 0; i--) {
    const candleTime = alignedNow - i * durationSecs;
    // Mix asset seed + candle time slot for time-varying but reproducible-within-slot data
    const slot = Math.floor(candleTime / durationSecs);
    const s1 = Math.sin(assetSeed * 0.137 + slot * 0.7193) * 0.5 + 0.5;
    const s2 = Math.sin(assetSeed * 0.311 + slot * 1.3847 + 2.1) * 0.5 + 0.5;
    const s3 = Math.sin(assetSeed * 0.517 + slot * 0.4423 + 1.3) * 0.5 + 0.5;
    const s4 = Math.sin(assetSeed * 0.729 + slot * 2.1173 + 0.9) * 0.5 + 0.5;

    // Trending bias changes slowly over time
    const trend = Math.sin(assetSeed * 0.05 + slot * 0.02) * 0.3;
    const change = (s1 - 0.5 + trend * 0.1) * volatility;
    price = Math.max(price * 0.98, Math.min(price * 1.02, price + change));

    const bodySize = (s2 * 0.6 + 0.1) * volatility;
    const open = price;
    const close = price + (s3 - 0.5) * bodySize;
    const high = Math.max(open, close) + s4 * volatility * 0.4;
    const low = Math.min(open, close) - (1 - s4) * volatility * 0.4;

    const dp = price > 100 ? 2 : price > 1 ? 5 : 5;
    candles.push({
      time: candleTime,
      open: parseFloat(open.toFixed(dp)),
      close: parseFloat(close.toFixed(dp)),
      high: parseFloat(high.toFixed(dp)),
      low: parseFloat(low.toFixed(dp)),
      volume: Math.floor(s2 * 1200 + 200),
    });
    price = close;
  }
  return candles;
}

export function analyzeAsset(asset: string, candles: Candle[]): Signal {
  const mode = detectMarketMode(asset);
  const minConfidence = mode === "OTC" ? 80 : 75;
  const indicators = calcIndicators(candles);
  const pa = priceActionSignal(candles);
  const ml = mlSignal(indicators);
  const rsi = rsiSignal(indicators.rsi);

  let directionFinal: "CALL" | "PUT" | "NEUTRO" = "NEUTRO";
  let confidenceFinal = 0;
  let justification = "";

  const votes: Array<{ dir: string; conf: number }> = [];
  if (pa.direction !== "NEUTRO") votes.push({ dir: pa.direction, conf: pa.confidence });
  if (ml.direction !== "NEUTRO") votes.push({ dir: ml.direction, conf: ml.confidence });
  if (rsi.direction !== "NEUTRO") votes.push({ dir: rsi.direction, conf: rsi.confidence });

  const callVotes = votes.filter((v) => v.dir === "CALL");
  const putVotes = votes.filter((v) => v.dir === "PUT");

  if (votes.length === 3 && callVotes.length === 3) {
    directionFinal = "CALL";
    confidenceFinal = votes.reduce((a, v) => a + v.conf, 0) / 3;
    justification = "CONSENSO TOTAL: Todas as estratégias confirmam COMPRA";
  } else if (votes.length === 3 && putVotes.length === 3) {
    directionFinal = "PUT";
    confidenceFinal = votes.reduce((a, v) => a + v.conf, 0) / 3;
    justification = "CONSENSO TOTAL: Todas as estratégias confirmam VENDA";
  } else if (callVotes.length >= 2 && putVotes.length === 0) {
    directionFinal = "CALL";
    confidenceFinal = callVotes.reduce((a, v) => a + v.conf, 0) / callVotes.length;
    justification = `MAIORIA: ${callVotes.length} de ${votes.length} estratégias confirmam COMPRA`;
  } else if (putVotes.length >= 2 && callVotes.length === 0) {
    directionFinal = "PUT";
    confidenceFinal = putVotes.reduce((a, v) => a + v.conf, 0) / putVotes.length;
    justification = `MAIORIA: ${putVotes.length} de ${votes.length} estratégias confirmam VENDA`;
  } else if (callVotes.length > 0 && putVotes.length > 0) {
    justification = `CONFLITO: Estratégias em desacordo — PA=${pa.direction}, ML=${ml.direction}, RSI=${rsi.direction}`;
  } else if (pa.direction !== "NEUTRO" && confidenceFinal === 0) {
    if (pa.confidence >= minConfidence) {
      directionFinal = pa.direction;
      confidenceFinal = pa.confidence;
      justification = `Sinal Price Action (${pa.confidence.toFixed(0)}%)`;
    }
  } else {
    justification = "Nenhum sinal detectado neste momento";
  }

  if (confidenceFinal > 0 && confidenceFinal < minConfidence) {
    justification = `Confiança (${confidenceFinal.toFixed(0)}%) abaixo do mínimo para ${mode} (${minConfidence}%)`;
    directionFinal = "NEUTRO";
    confidenceFinal = 0;
  }

  return {
    asset,
    price: candles[candles.length - 1]?.close ?? 0,
    mode,
    directionPA: pa.direction,
    confidencePA: parseFloat(pa.confidence.toFixed(1)),
    directionML: ml.direction,
    confidenceML: parseFloat(ml.confidence.toFixed(1)),
    directionRSI: rsi.direction,
    confidenceRSI: parseFloat(rsi.confidence.toFixed(1)),
    directionFinal,
    confidenceFinal: parseFloat(confidenceFinal.toFixed(1)),
    justification,
    indicators: {
      rsi: indicators.rsi !== undefined ? parseFloat(indicators.rsi.toFixed(2)) : undefined,
      macd: indicators.macd !== undefined ? parseFloat(indicators.macd.toFixed(5)) : undefined,
      macdSignal: indicators.macdSignal !== undefined ? parseFloat(indicators.macdSignal.toFixed(5)) : undefined,
      macdHistogram: indicators.macdHistogram !== undefined ? parseFloat(indicators.macdHistogram.toFixed(5)) : undefined,
      bbUpper: indicators.bbUpper !== undefined ? parseFloat(indicators.bbUpper.toFixed(5)) : undefined,
      bbMiddle: indicators.bbMiddle !== undefined ? parseFloat(indicators.bbMiddle.toFixed(5)) : undefined,
      bbLower: indicators.bbLower !== undefined ? parseFloat(indicators.bbLower.toFixed(5)) : undefined,
      ma5: indicators.ma5 !== undefined ? parseFloat(indicators.ma5.toFixed(5)) : undefined,
      ma10: indicators.ma10 !== undefined ? parseFloat(indicators.ma10.toFixed(5)) : undefined,
      ma20: indicators.ma20 !== undefined ? parseFloat(indicators.ma20.toFixed(5)) : undefined,
    },
    timestamp: new Date().toISOString(),
    category: getCategoryForAsset(asset),
  };
}
