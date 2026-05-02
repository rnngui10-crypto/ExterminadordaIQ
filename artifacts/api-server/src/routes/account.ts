import { Router } from "express";
import { iqSession, iqSwitchAccount } from "../lib/iq-client";

const router = Router();

router.get("/account/balance", (_req, res) => {
  if (!iqSession.connected) {
    return res.status(401).json({ error: "Nao autenticado", message: "Faca login primeiro" });
  }
  return res.json({
    balance: iqSession.balance,
    realBalance: iqSession.realBalance,
    practiceBalance: iqSession.practiceBalance,
    currency: "USD",
    accountType: iqSession.accountType,
  });
});

router.post("/account/switch", async (req, res) => {
  if (!iqSession.connected) {
    return res.status(401).json({ error: "Nao autenticado" });
  }
  const { type } = req.body as { type?: string };
  if (type !== "REAL" && type !== "PRACTICE") {
    return res.status(400).json({ error: "Tipo de conta invalido. Use REAL ou PRACTICE" });
  }
  const result = await iqSwitchAccount(type);
  return res.json({
    success: result.success,
    accountType: iqSession.accountType,
    balance: iqSession.balance,
  });
});

export default router;
