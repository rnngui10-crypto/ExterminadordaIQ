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

export interface Candle {
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
  prevMacdHistogram?: number;
  bbUpper?: number;
  bbMiddle?: number;
  bbLower?: number;
  ma5?: number;
  ma10?: number;
  ma20?: number;
  stochK?: number;
  lastClose?: number;
}

function emaFull(data: number[], span: number): number[] {
  if (data.length === 0) return [];
  const k = 2 / (span + 1);
  const result: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    result.push(data[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function calcIndicators(candles: Candle[]): IndicatorResult {
  if (candles.length < 30) return {};
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const lastClose = closes[closes.length - 1];

  const sma = (n: number) => {
    const slice = closes.slice(-n);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  };

  const ma5 = sma(5);
  const ma10 = sma(10);
  const ma20 = sma(20);

  const slice20 = closes.slice(-20);
  const mean = ma20;
  const std = Math.sqrt(slice20.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / 20);
  const bbUpper = mean + 2 * std;
  const bbLower = mean - 2 * std;

  const deltas = closes.slice(1).map((v, i) => v - closes[i]);
  const last14 = deltas.slice(-14);
  const avgGain = last14.filter((d) => d > 0).reduce((a, b) => a + b, 0) / 14;
  const avgLoss = last14.filter((d) => d < 0).reduce((a, b) => a + Math.abs(b), 0) / 14;
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);

  const ema12 = emaFull(closes, 12);
  const ema26 = emaFull(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = emaFull(macdLine, 9);
  const macd = macdLine[macdLine.length - 1];
  const macdSignalVal = signalLine[signalLine.length - 1];
  const macdHistogram = macd - macdSignalVal;
  const prevMacdHistogram =
    macdLine.length >= 2 && signalLine.length >= 2
      ? macdLine[macdLine.length - 2] - signalLine[signalLine.length - 2]
      : 0;

  const kPeriod = 14;
  const recentHighs = highs.slice(-kPeriod);
  const recentLows = lows.slice(-kPeriod);
  const highestHigh = Math.max(...recentHighs);
  const lowestLow = Math.min(...recentLows);
  const stochK =
    highestHigh === lowestLow
      ? 50
      : ((lastClose - lowestLow) / (highestHigh - lowestLow)) * 100;

  return {
    rsi,
    macd,
    macdSignal: macdSignalVal,
    macdHistogram,
    prevMacdHistogram,
    bbUpper,
    bbMiddle: mean,
    bbLower,
    ma5,
    ma10,
    ma20,
    stochK,
    lastClose,
  };
}

function rsiSignal(rsi?: number): { direction: "CALL" | "PUT" | "NEUTRO"; confidence: number } {
  if (rsi === undefined) return { direction: "NEUTRO", confidence: 0 };
  if (rsi <= 20) return { direction: "CALL", confidence: 92 };
  if (rsi <= 28) return { direction: "CALL", confidence: 85 };
  if (rsi <= 35) return { direction: "CALL", confidence: 76 };
  if (rsi >= 80) return { direction: "PUT", confidence: 92 };
  if (rsi >= 72) return { direction: "PUT", confidence: 85 };
  if (rsi >= 65) return { direction: "PUT", confidence: 76 };
  return { direction: "NEUTRO", confidence: 0 };
}

function macdSignalFn(
  macdHistogram?: number,
  prevMacdHistogram?: number
): { direction: "CALL" | "PUT" | "NEUTRO"; confidence: number } {
  if (macdHistogram === undefined || prevMacdHistogram === undefined)
    return { direction: "NEUTRO", confidence: 0 };

  const bullishCross = prevMacdHistogram < 0 && macdHistogram > 0;
  const bearishCross = prevMacdHistogram > 0 && macdHistogram < 0;
  const strongBull = macdHistogram > 0 && Math.abs(macdHistogram) > Math.abs(prevMacdHistogram) * 1.3;
  const strongBear = macdHistogram < 0 && Math.abs(macdHistogram) > Math.abs(prevMacdHistogram) * 1.3;

  if (bullishCross) return { direction: "CALL", confidence: 88 };
  if (bearishCross) return { direction: "PUT", confidence: 88 };
  if (strongBull) return { direction: "CALL", confidence: 78 };
  if (strongBear) return { direction: "PUT", confidence: 78 };
  return { direction: "NEUTRO", confidence: 0 };
}

function bbSignal(
  lastClose?: number,
  bbUpper?: number,
  bbLower?: number,
  bbMiddle?: number
): { direction: "CALL" | "PUT" | "NEUTRO"; confidence: number } {
  if (
    lastClose === undefined ||
    bbUpper === undefined ||
    bbLower === undefined ||
    bbMiddle === undefined
  )
    return { direction: "NEUTRO", confidence: 0 };

  const bandwidth = bbUpper - bbLower;
  if (bandwidth === 0) return { direction: "NEUTRO", confidence: 0 };

  const pctB = (lastClose - bbLower) / bandwidth;

  if (pctB <= 0.05) return { direction: "CALL", confidence: 88 };
  if (pctB <= 0.15) return { direction: "CALL", confidence: 78 };
  if (pctB >= 0.95) return { direction: "PUT", confidence: 88 };
  if (pctB >= 0.85) return { direction: "PUT", confidence: 78 };
  return { direction: "NEUTRO", confidence: 0 };
}

function stochSignal(stochK?: number): { direction: "CALL" | "PUT" | "NEUTRO"; confidence: number } {
  if (stochK === undefined) return { direction: "NEUTRO", confidence: 0 };
  if (stochK <= 15) return { direction: "CALL", confidence: 82 };
  if (stochK <= 25) return { direction: "CALL", confidence: 74 };
  if (stochK >= 85) return { direction: "PUT", confidence: 82 };
  if (stochK >= 75) return { direction: "PUT", confidence: 74 };
  return { direction: "NEUTRO", confidence: 0 };
}

function priceActionSignal(candles: Candle[]): { direction: "CALL" | "PUT" | "NEUTRO"; confidence: number } {
  if (candles.length < 5) return { direction: "NEUTRO", confidence: 0 };

  const cur = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const prev2 = candles[candles.length - 3];

  const body = Math.abs(cur.close - cur.open);
  const upperShadow = cur.high - Math.max(cur.open, cur.close);
  const lowerShadow = Math.min(cur.open, cur.close) - cur.low;
  const totalRange = cur.high - cur.low;

  if (totalRange === 0) return { direction: "NEUTRO", confidence: 0 };

  const bullEngulf =
    prev.close < prev.open &&
    cur.close > cur.open &&
    cur.close > prev.open &&
    cur.open < prev.close;

  const bearEngulf =
    prev.close > prev.open &&
    cur.close < cur.open &&
    cur.close < prev.open &&
    cur.open > prev.close;

  if (bullEngulf) return { direction: "CALL", confidence: 88 };
  if (bearEngulf) return { direction: "PUT", confidence: 88 };

  const morningStar =
    prev2.close < prev2.open &&
    Math.abs(prev.close - prev.open) < (prev2.open - prev2.close) * 0.3 &&
    cur.close > cur.open &&
    cur.close > (prev2.open + prev2.close) / 2;

  const eveningStar =
    prev2.close > prev2.open &&
    Math.abs(prev.close - prev.open) < (prev2.close - prev2.open) * 0.3 &&
    cur.close < cur.open &&
    cur.close < (prev2.open + prev2.close) / 2;

  if (morningStar) return { direction: "CALL", confidence: 86 };
  if (eveningStar) return { direction: "PUT", confidence: 86 };

  const hammer =
    lowerShadow >= body * 2 &&
    upperShadow <= body * 0.5 &&
    body > totalRange * 0.1;

  const shootingStar =
    upperShadow >= body * 2 &&
    lowerShadow <= body * 0.5 &&
    body > totalRange * 0.1;

  if (hammer) return { direction: cur.close > cur.open ? "CALL" : "NEUTRO", confidence: 80 };
  if (shootingStar) return { direction: cur.close < cur.open ? "PUT" : "NEUTRO", confidence: 80 };

  const threeConsecBull =
    candles.slice(-3).every((c) => c.close > c.open) &&
    candles[candles.length - 1].close > candles[candles.length - 2].close &&
    candles[candles.length - 2].close > candles[candles.length - 3].close;

  const threeConsecBear =
    candles.slice(-3).every((c) => c.close < c.open) &&
    candles[candles.length - 1].close < candles[candles.length - 2].close &&
    candles[candles.length - 2].close < candles[candles.length - 3].close;

  if (threeConsecBull) return { direction: "PUT", confidence: 76 };
  if (threeConsecBear) return { direction: "CALL", confidence: 76 };

  return { direction: "NEUTRO", confidence: 0 };
}

function trendSignal(
  ma5?: number,
  ma10?: number,
  ma20?: number
): { direction: "CALL" | "PUT" | "NEUTRO"; confidence: number } {
  if (ma5 === undefined || ma10 === undefined || ma20 === undefined)
    return { direction: "NEUTRO", confidence: 0 };
  if (ma5 > ma10 && ma10 > ma20) return { direction: "CALL", confidence: 75 };
  if (ma5 < ma10 && ma10 < ma20) return { direction: "PUT", confidence: 75 };
  return { direction: "NEUTRO", confidence: 0 };
}

export function generateMockCandles(asset: string, count = 100, durationSecs = 60): Candle[] {
  const assetSeed = asset.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const now = Math.floor(Date.now() / 1000);
  const alignedNow = Math.floor(now / durationSecs) * durationSecs;

  const basePrices: Record<string, number> = {
    EURUSD: 1.085, GBPUSD: 1.265, USDJPY: 149.5, AUDUSD: 0.653,
    USDCAD: 1.362, USDCHF: 0.905, NZDUSD: 0.601,
    EURGBP: 0.858, EURJPY: 162.3, GBPJPY: 189.2, AUDJPY: 97.6,
    EURCAD: 1.478, EURAUD: 1.661, GBPCAD: 1.724,
    BTCUSD: 62500, ETHUSD: 3150, DOGEUSD: 0.152, SOLUSD: 148.0, XRPUSD: 0.521, ADAUSD: 0.45,
    USDBRL: 5.02, USDTRY: 32.4, USDZAR: 18.7, USDMXN: 16.8, USDSEK: 10.4, USDNOK: 10.6,
    US30: 38200, US500: 5100, NAS100: 17800, GER30: 17600, UK100: 7900, JP225: 38500,
    XAUUSD: 2310, XAGUSD: 27.4, USOUSD: 82.5,
    CADJPY: 109.5,
  };

  let price = basePrices[asset] ?? (1.0 + (assetSeed % 200) / 100);
  const volatility = price > 1000 ? price * 0.0006 : price > 100 ? price * 0.0008 : 0.0010;

  const candles: Candle[] = [];
  let trendBias = (Math.sin(assetSeed * 0.05) > 0 ? 1 : -1) * 0.15;
  let trendCounter = 0;
  const trendDuration = 15 + (assetSeed % 20);

  const seededRandom = (seed: number): number => {
    const x = Math.sin(seed) * 43758.5453123;
    return x - Math.floor(x);
  };

  for (let i = count; i >= 0; i--) {
    const candleTime = alignedNow - i * durationSecs;
    const slot = Math.floor(candleTime / durationSecs);
    const s1 = seededRandom(assetSeed * 1.37 + slot * 0.719);
    const s2 = seededRandom(assetSeed * 2.11 + slot * 1.384);
    const s3 = seededRandom(assetSeed * 3.17 + slot * 0.442);
    const s4 = seededRandom(assetSeed * 4.29 + slot * 2.117);

    trendCounter++;
    if (trendCounter >= trendDuration) {
      trendBias = seededRandom(assetSeed + slot) > 0.5 ? 0.2 : -0.2;
      trendCounter = 0;
    }

    const noise = (s1 - 0.5) * 2;
    const change = (noise + trendBias * 0.3) * volatility;
    price = Math.max(price * 0.97, Math.min(price * 1.03, price + change));

    const bodySize = (s2 * 0.5 + 0.1) * volatility;
    const open = price;
    const close = price + (s3 - 0.5) * bodySize * 2;
    const spread = volatility * (s4 * 0.5 + 0.2);
    const high = Math.max(open, close) + spread;
    const low = Math.min(open, close) - spread;

    const dp = price > 1000 ? 2 : price > 10 ? 4 : 5;
    candles.push({
      time: candleTime,
      open: parseFloat(open.toFixed(dp)),
      close: parseFloat(close.toFixed(dp)),
      high: parseFloat(high.toFixed(dp)),
      low: parseFloat(low.toFixed(dp)),
      volume: Math.floor(s2 * 1500 + 300),
    });
    price = parseFloat(close.toFixed(dp));
  }
  return candles;
}

export function analyzeAsset(asset: string, candles: Candle[]): Signal {
  const mode = detectMarketMode(asset);
  const minConfidence = 80;
  const indicators = calcIndicators(candles);
  const lastClose = indicators.lastClose ?? candles[candles.length - 1]?.close ?? 0;

  const rsi = rsiSignal(indicators.rsi);
  const macdSig = macdSignalFn(indicators.macdHistogram, indicators.prevMacdHistogram);
  const bb = bbSignal(lastClose, indicators.bbUpper, indicators.bbLower, indicators.bbMiddle);
  const stoch = stochSignal(indicators.stochK);
  const pa = priceActionSignal(candles);
  const trend = trendSignal(indicators.ma5, indicators.ma10, indicators.ma20);

  const allSigs = [rsi, macdSig, bb, stoch, pa, trend];
  const activeSigs = allSigs.filter((s) => s.direction !== "NEUTRO");

  const callSigs = activeSigs.filter((s) => s.direction === "CALL");
  const putSigs = activeSigs.filter((s) => s.direction === "PUT");

  let directionFinal: "CALL" | "PUT" | "NEUTRO" = "NEUTRO";
  let confidenceFinal = 0;
  let justification = "Aguardando confluência de sinais";

  const callConf = callSigs.length > 0 ? callSigs.reduce((a, s) => a + s.confidence, 0) / callSigs.length : 0;
  const putConf = putSigs.length > 0 ? putSigs.reduce((a, s) => a + s.confidence, 0) / putSigs.length : 0;

  if (callSigs.length >= 3 && putSigs.length === 0) {
    directionFinal = "CALL";
    confidenceFinal = callConf;
    const names = ["RSI", "MACD", "Bollinger", "Estocástico", "Price Action", "Tendência"]
      .filter((_, i) => allSigs[i].direction === "CALL")
      .join(" + ");
    justification = `CONSENSO COMPRA: ${names} (${callSigs.length}/6 sinais)`;
  } else if (putSigs.length >= 3 && callSigs.length === 0) {
    directionFinal = "PUT";
    confidenceFinal = putConf;
    const names = ["RSI", "MACD", "Bollinger", "Estocástico", "Price Action", "Tendência"]
      .filter((_, i) => allSigs[i].direction === "PUT")
      .join(" + ");
    justification = `CONSENSO VENDA: ${names} (${putSigs.length}/6 sinais)`;
  } else if (callSigs.length >= 2 && putSigs.length === 0 && callConf >= 82) {
    directionFinal = "CALL";
    confidenceFinal = callConf - 5;
    const names = ["RSI", "MACD", "Bollinger", "Estocástico", "Price Action", "Tendência"]
      .filter((_, i) => allSigs[i].direction === "CALL")
      .join(" + ");
    justification = `CONFLUÊNCIA COMPRA: ${names}`;
  } else if (putSigs.length >= 2 && callSigs.length === 0 && putConf >= 82) {
    directionFinal = "PUT";
    confidenceFinal = putConf - 5;
    const names = ["RSI", "MACD", "Bollinger", "Estocástico", "Price Action", "Tendência"]
      .filter((_, i) => allSigs[i].direction === "PUT")
      .join(" + ");
    justification = `CONFLUÊNCIA VENDA: ${names}`;
  } else if (callSigs.length > 0 && putSigs.length > 0) {
    justification = `Conflito de sinais — CALL:${callSigs.length} x PUT:${putSigs.length} — aguardando`;
  }

  if (confidenceFinal > 0 && confidenceFinal < minConfidence) {
    justification = `Confiança ${confidenceFinal.toFixed(0)}% insuficiente (mínimo ${minConfidence}%) — aguardando`;
    directionFinal = "NEUTRO";
    confidenceFinal = 0;
  }

  return {
    asset,
    price: lastClose,
    mode,
    directionPA: pa.direction,
    confidencePA: parseFloat(pa.confidence.toFixed(1)),
    directionML: macdSig.direction,
    confidenceML: parseFloat(macdSig.confidence.toFixed(1)),
    directionRSI: rsi.direction,
    confidenceRSI: parseFloat(rsi.confidence.toFixed(1)),
    directionFinal,
    confidenceFinal: parseFloat(confidenceFinal.toFixed(1)),
    justification,
    indicators: {
      rsi: indicators.rsi !== undefined ? parseFloat(indicators.rsi.toFixed(2)) : undefined,
      macd: indicators.macd !== undefined ? parseFloat(indicators.macd.toFixed(6)) : undefined,
      macdSignal: indicators.macdSignal !== undefined ? parseFloat(indicators.macdSignal.toFixed(6)) : undefined,
      macdHistogram: indicators.macdHistogram !== undefined ? parseFloat(indicators.macdHistogram.toFixed(6)) : undefined,
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
