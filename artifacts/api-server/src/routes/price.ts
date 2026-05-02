import { Router } from "express";
import { generateMockCandles } from "../lib/trading-engine";
import { iqSession, iqGetCandles } from "../lib/iq-client";

const router = Router();

router.get("/price/:asset", async (req, res) => {
  const asset = req.params["asset"];
  if (!asset) return res.status(400).json({ error: "Ativo inválido" });

  let price: number | null = null;
  let usingRealData = false;

  if (iqSession.connected) {
    try {
      const candles = await iqGetCandles(asset, 60, 2);
      if (candles && candles.length > 0) {
        const last = candles[candles.length - 1];
        price = last.close;
        usingRealData = true;
      }
    } catch {
      // fallback to mock
    }
  }

  if (price === null) {
    const mocks = generateMockCandles(asset, 2, 60);
    if (mocks.length > 0) {
      price = mocks[mocks.length - 1].close;
    }
  }

  return res.json({ asset, price, usingRealData, timestamp: new Date().toISOString() });
});

export default router;
