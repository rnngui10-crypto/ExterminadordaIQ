import { Router } from "express";
import { GetSignalByAssetParams } from "@workspace/api-zod";
import { ASSETS, generateMockCandles, analyzeAsset } from "../lib/trading-engine";
import { iqSession, iqGetCandles } from "../lib/iq-client";
import type { Signal } from "@workspace/api-zod";

const router = Router();

const signalHistory: Signal[] = [];

async function getCandlesForAsset(asset: string, duration = 60, count = 100) {
  if (iqSession.connected) {
    const realCandles = await iqGetCandles(asset, duration, count);
    if (realCandles && realCandles.length >= 20) {
      return realCandles.map((c) => ({
        time: c.time,
        open: c.open,
        close: c.close,
        high: c.high,
        low: c.low,
        volume: 0,
      }));
    }
  }
  return generateMockCandles(asset, count, duration);
}

router.get("/signals", async (req, res) => {
  const category = typeof req.query["category"] === "string" ? req.query["category"] : undefined;

  const allAssets: string[] = [];
  for (const [cat, assets] of Object.entries(ASSETS)) {
    if (!category || cat === category) {
      allAssets.push(...assets);
    }
  }

  const signals: Signal[] = [];
  for (const asset of allAssets) {
    const candles = await getCandlesForAsset(asset);
    const signal = analyzeAsset(asset, candles);
    signals.push(signal);

    if (signal.directionFinal !== "NEUTRO" && signal.confidenceFinal > 75) {
      const existingIdx = signalHistory.findIndex((s) => s.asset === asset);
      if (existingIdx >= 0) {
        signalHistory[existingIdx] = signal;
      } else {
        signalHistory.unshift(signal);
      }
      if (signalHistory.length > 200) signalHistory.pop();
    }
  }

  signals.sort((a, b) => b.confidenceFinal - a.confidenceFinal);

  return res.json({
    signals,
    totalAnalyzed: allAssets.length,
    lastUpdate: new Date().toISOString(),
    usingRealData: iqSession.connected,
  });
});

router.get("/signals/history", (_req, res) => {
  return res.json({
    history: signalHistory.slice(0, 100),
    total: signalHistory.length,
  });
});

router.get("/signals/:asset", async (req, res) => {
  const paramsParsed = GetSignalByAssetParams.safeParse(req.params);
  if (!paramsParsed.success) {
    return res.status(400).json({ error: "Ativo inválido", message: "Forneça um ativo válido" });
  }

  const { asset } = paramsParsed.data;
  const duration = typeof req.query["duration"] === "string" ? Number(req.query["duration"]) : 60;
  const candles = await getCandlesForAsset(asset, duration, 100);
  const signal = analyzeAsset(asset, candles);

  if (signal.directionFinal !== "NEUTRO") {
    const existingIdx = signalHistory.findIndex((s) => s.asset === asset);
    if (existingIdx >= 0) {
      signalHistory[existingIdx] = signal;
    } else {
      signalHistory.unshift(signal);
    }
    if (signalHistory.length > 200) signalHistory.pop();
  }

  return res.json({
    ...signal,
    usingRealData: iqSession.connected,
  });
});

export default router;
