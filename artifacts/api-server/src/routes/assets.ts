import { Router } from "express";
import { GetCandlesParams, GetCandlesQueryParams } from "@workspace/api-zod";
import { ASSETS, OTC_ASSETS, generateMockCandles } from "../lib/trading-engine";

const router = Router();

router.get("/assets", (_req, res) => {
  const categories = Object.entries(ASSETS).map(([name, assets]) => ({ name, assets }));
  return res.json({
    categories,
    otcAssets: Array.from(OTC_ASSETS),
  });
});

router.get("/assets/:asset/candles", (req, res) => {
  const paramsParsed = GetCandlesParams.safeParse(req.params);
  const queryParsed = GetCandlesQueryParams.safeParse(req.query);

  if (!paramsParsed.success) {
    return res.status(400).json({ error: "Parâmetros inválidos", message: "Ativo inválido" });
  }

  const { asset } = paramsParsed.data;
  const count = queryParsed.success ? queryParsed.data.count : 50;
  const timeframe = queryParsed.success ? queryParsed.data.timeframe : 60;

  const candles = generateMockCandles(asset, count);

  return res.json({ asset, timeframe, candles });
});

export default router;
