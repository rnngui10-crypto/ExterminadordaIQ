/**
 * IQ Option client — proxies all calls to the Python bridge (port 7777).
 * The Python bridge uses the official iqoptionapi library for real WebSocket access.
 */

import axios from "axios";
import { logger } from "./logger";

const BRIDGE_URL = "http://localhost:7777";

export interface IQSession {
  connected: boolean;
  ssid: string;
  email: string;
  accountType: "REAL" | "PRACTICE";
  balance: number;
  realBalance: number;
  practiceBalance: number;
  usingRealData: boolean;
}

export const iqSession: IQSession = {
  connected: false,
  ssid: "",
  email: "",
  accountType: "PRACTICE",
  balance: 0,
  realBalance: 0,
  practiceBalance: 0,
  usingRealData: false,
};

async function bridgeGet<T>(path: string, params?: Record<string, string | number>): Promise<T | null> {
  try {
    const res = await axios.get<T>(`${BRIDGE_URL}${path}`, { params, timeout: 30000 });
    return res.data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err: msg, path }, "Bridge GET failed");
    return null;
  }
}

async function bridgePost<T>(path: string, body?: unknown): Promise<T | null> {
  try {
    const res = await axios.post<T>(`${BRIDGE_URL}${path}`, body, { timeout: 30000 });
    return res.data;
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response) {
      const data = err.response.data as { error?: string };
      throw new Error(data?.error ?? `HTTP ${err.response.status}`);
    }
    throw err;
  }
}

export async function isBridgeAvailable(): Promise<boolean> {
  try {
    const res = await axios.get(`${BRIDGE_URL}/health`, { timeout: 2000 });
    return res.status === 200;
  } catch {
    return false;
  }
}

export async function iqLogin(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const available = await isBridgeAvailable();
    if (!available) {
      return { success: false, error: "Serviço Python não está disponível. Aguarde o servidor iniciar e tente novamente." };
    }

    logger.info({ email }, "Proxying login to Python bridge");
    const result = await bridgePost<{
      success: boolean;
      error?: string;
      email?: string;
      accountType?: string;
      balance?: number;
      realBalance?: number;
      practiceBalance?: number;
    }>("/login", { email, password });

    if (!result) {
      return { success: false, error: "Sem resposta do servidor Python" };
    }

    if (!result.success) {
      return { success: false, error: result.error ?? "Falha ao conectar" };
    }

    iqSession.connected = true;
    iqSession.email = email;
    iqSession.accountType = "PRACTICE";
    iqSession.balance = result.balance ?? 0;
    iqSession.realBalance = result.realBalance ?? 0;
    iqSession.practiceBalance = result.practiceBalance ?? result.balance ?? 0;
    iqSession.usingRealData = true;

    logger.info(
      { balance: iqSession.balance, realBalance: iqSession.realBalance },
      "Login via Python bridge successful"
    );
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, "Login proxy error");
    if (msg.includes("incorretos") || msg.includes("401")) {
      return { success: false, error: "Email ou senha incorretos" };
    }
    return { success: false, error: msg.slice(0, 200) };
  }
}

export async function iqRefreshStatus(): Promise<void> {
  try {
    const data = await bridgeGet<{
      connected: boolean;
      email?: string;
      accountType?: string;
      balance?: number;
      realBalance?: number;
      practiceBalance?: number;
      usingRealData?: boolean;
    }>("/status");

    if (!data) return;
    iqSession.connected = data.connected;
    if (data.connected) {
      iqSession.email = data.email ?? iqSession.email;
      iqSession.accountType = (data.accountType as "REAL" | "PRACTICE") ?? iqSession.accountType;
      iqSession.balance = data.balance ?? iqSession.balance;
      iqSession.realBalance = data.realBalance ?? iqSession.realBalance;
      iqSession.practiceBalance = data.practiceBalance ?? iqSession.practiceBalance;
      iqSession.usingRealData = data.usingRealData ?? true;
    }
  } catch {
    // ignore
  }
}

export interface BridgeCandle {
  time: number;
  open: number;
  close: number;
  high: number;
  low: number;
}

export async function iqGetCandles(
  asset: string,
  duration: number,
  count: number
): Promise<BridgeCandle[] | null> {
  try {
    const data = await bridgeGet<{ candles: BridgeCandle[]; error?: string }>(
      `/candles/${encodeURIComponent(asset)}`,
      { duration, count }
    );
    if (!data || !Array.isArray(data.candles) || data.candles.length === 0) return null;
    return data.candles;
  } catch {
    return null;
  }
}

export async function iqLogout(): Promise<void> {
  try {
    await bridgePost("/logout");
  } catch {
    // ignore
  } finally {
    iqSession.connected = false;
    iqSession.ssid = "";
    iqSession.email = "";
    iqSession.balance = 0;
    iqSession.realBalance = 0;
    iqSession.practiceBalance = 0;
    iqSession.usingRealData = false;
  }
}

export async function iqSwitchAccount(type: "REAL" | "PRACTICE"): Promise<{ success: boolean; balance?: number }> {
  try {
    const result = await bridgePost<{ success: boolean; accountType?: string; balance?: number }>(
      "/switch",
      { type }
    );
    if (result?.success) {
      iqSession.accountType = type;
      iqSession.balance = result.balance ?? iqSession.balance;
    }
    return { success: result?.success ?? false, balance: result?.balance };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err: msg }, "Switch account failed");
    return { success: false };
  }
}
