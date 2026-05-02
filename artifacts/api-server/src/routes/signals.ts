import { Router } from "express";
import { GetSignalsQueryParams, GetSignalByAssetParams } from "@workspace/api-zod";
import { ASSETS, generateMockCandles, analyzeAsset } from "../lib/trading-engine";
import type { Signal } from "@workspace/api-zod";

const router = Router();

const signalHistory: Signal[] = [];

router.get("/signals", (req, res) => {
  const queryParsed = GetSignalsQueryParams.safeParse(req.query);
  const category = queryParsed.success ? queryParsed.data.category : undefined;

  const allAssets: string[] = [];
  for (const [cat, assets] of Object.entries(ASSETS)) {
    if (!category || cat === category) {
      allAssets.push(...assets);
    }
  }

  const signals: Signal[] = [];
  for (const asset of allAssets) {
    const candles = generateMockCandles(asset, 50);
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
  });
});

router.get("/signals/history", (_req, res) => {
  return res.json({
    history: signalHistory.slice(0, 100),
    total: signalHistory.length,
  });
});

router.get("/signals/:asset", (req, res) => {
  const paramsParsed = GetSignalByAssetParams.safeParse(req.params);
  if (!paramsParsed.success) {
    return res.status(400).json({ error: "Ativo inválido", message: "Forneça um ativo válido" });
  }

  const { asset } = paramsParsed.data;
  const candles = generateMockCandles(asset, 50);
  const signal = analyzeAsset(asset, candles);

  return res.json(signal);
});

export default router;
