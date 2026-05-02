import { Router } from "express";
import { SwitchAccountTypeBody } from "@workspace/api-zod";
import { session } from "./auth";

const router = Router();

router.get("/account/balance", (_req, res) => {
  if (!session.connected) {
    return res.status(401).json({ error: "Não autenticado", message: "Faça login primeiro" });
  }
  const balances: Record<string, number> = {
    PRACTICE: 10000,
    REAL: 2500,
  };
  return res.json({
    balance: balances[session.accountType] ?? session.balance,
    currency: "USD",
    accountType: session.accountType,
  });
});

router.post("/account/type", (req, res) => {
  const parsed = SwitchAccountTypeBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Tipo inválido", message: "Use REAL ou PRACTICE" });
  }
  session.accountType = parsed.data.accountType;
  req.log.info({ accountType: session.accountType }, "Account type switched");
  return res.json({ success: true, message: `Conta alterada para ${session.accountType}` });
});

export default router;
