import { Router } from "express";
import { LoginBody } from "@workspace/api-zod";
import { iqLogin, iqLogout, iqSwitchAccount, iqSession } from "../lib/iq-client";

const router = Router();

router.post("/auth/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", message: "Email e senha são obrigatórios" });
  }

  const { email, password } = parsed.data;
  if (!email || !password) {
    return res.status(400).json({ error: "Dados inválidos", message: "Email e senha são obrigatórios" });
  }

  req.log.info({ email }, "Login attempt");
  const result = await iqLogin(email, password);

  if (!result.success) {
    return res.status(401).json({
      success: false,
      message: result.error ?? "Falha ao conectar com IQ Option",
    });
  }

  req.log.info({ email, accountType: iqSession.accountType }, "Login successful");
  return res.json({
    success: true,
    message: "Conectado com sucesso à IQ Option",
    accountType: iqSession.accountType,
    balance: iqSession.balance,
  });
});

router.get("/auth/status", (_req, res) => {
  return res.json({
    connected: iqSession.connected,
    email: iqSession.connected ? iqSession.email : undefined,
    accountType: iqSession.connected ? iqSession.accountType : undefined,
    balance: iqSession.connected ? iqSession.balance : undefined,
  });
});

router.post("/auth/logout", (req, res) => {
  iqLogout();
  req.log.info("User logged out");
  return res.json({ success: true, message: "Desconectado com sucesso" });
});

router.post("/account/switch", (req, res) => {
  const { type } = req.body as { type?: string };
  if (type !== "REAL" && type !== "PRACTICE") {
    return res.status(400).json({ error: "Tipo de conta inválido" });
  }
  iqSwitchAccount(type);
  return res.json({
    success: true,
    accountType: iqSession.accountType,
    balance: iqSession.balance,
  });
});

export default router;
