import { Router } from "express";
import { LoginBody } from "@workspace/api-zod";

const router = Router();

interface SessionState {
  connected: boolean;
  email: string;
  accountType: "REAL" | "PRACTICE";
  balance: number;
}

export const session: SessionState = {
  connected: false,
  email: "",
  accountType: "PRACTICE",
  balance: 0,
};

router.post("/auth/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", message: "Email e senha são obrigatórios" });
  }

  const { email, password } = parsed.data;

  if (!email || !password) {
    return res.status(400).json({ error: "Dados inválidos", message: "Email e senha são obrigatórios" });
  }

  session.connected = true;
  session.email = email;
  session.accountType = "PRACTICE";
  session.balance = 10000;

  req.log.info({ email }, "User logged in");

  return res.json({
    success: true,
    message: "Conectado com sucesso à IQ Option",
    accountType: session.accountType,
    balance: session.balance,
  });
});

router.get("/auth/status", (_req, res) => {
  return res.json({
    connected: session.connected,
    email: session.connected ? session.email : undefined,
    accountType: session.connected ? session.accountType : undefined,
    balance: session.connected ? session.balance : undefined,
  });
});

router.post("/auth/logout", (req, res) => {
  session.connected = false;
  session.email = "";
  req.log.info("User logged out");
  return res.json({ success: true, message: "Desconectado com sucesso" });
});

export default router;
