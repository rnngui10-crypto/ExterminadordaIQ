import axios from "axios";
import WebSocket from "ws";
import { logger } from "./logger";

interface IQCandle {
  id: number;
  from: number;
  to: number;
  open: number;
  close: number;
  min: number;
  max: number;
  volume: number;
  phase: string;
}

interface IQSession {
  connected: boolean;
  ssid: string;
  email: string;
  accountType: "REAL" | "PRACTICE";
  balance: number;
  realBalance: number;
  practiceBalance: number;
  userId?: number;
  ws?: WebSocket;
  lastError?: string;
  pendingCallbacks: Map<string, (data: unknown) => void>;
  requestId: number;
  loginCookies: string;
}

export const iqSession: IQSession = {
  connected: false,
  ssid: "",
  email: "",
  accountType: "PRACTICE",
  balance: 0,
  realBalance: 0,
  practiceBalance: 0,
  pendingCallbacks: new Map(),
  requestId: 1,
  loginCookies: "",
};

function nextReqId(): string {
  return String(iqSession.requestId++);
}

function sendWs(msg: object): void {
  if (iqSession.ws && iqSession.ws.readyState === WebSocket.OPEN) {
    iqSession.ws.send(JSON.stringify(msg));
  }
}

function buildCookieString(setCookieHeaders: string[]): string {
  return setCookieHeaders
    .map((c) => c.split(";")[0])
    .join("; ");
}

function connectWebSocket(ssid: string, cookies: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const wsUrl = "wss://iqbroker.com/echo/websocket";
    const userAgent =
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    const wsHeaders: Record<string, string> = {
      Origin: "https://iqoption.com",
      "User-Agent": userAgent,
    };
    if (cookies) wsHeaders["Cookie"] = cookies;

    const ws = new WebSocket(wsUrl, {
      headers: wsHeaders,
      followRedirects: true,
    } as WebSocket.ClientOptions & { followRedirects: boolean });

    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error("WebSocket connection timeout (15s)"));
    }, 20000);

    let authenticated = false;

    ws.on("open", () => {
      iqSession.ws = ws;
      sendWs({ name: "ssid", msg: ssid });
    });

    ws.on("message", (raw: Buffer) => {
      try {
        const data = JSON.parse(raw.toString()) as {
          name?: string;
          msg?: Record<string, unknown>;
          microserviceName?: string;
        };
        const name: string = data.name ?? "";
        const body = data.msg ?? {};

        if (name === "profile" && !authenticated) {
          authenticated = true;
          clearTimeout(timeout);
          iqSession.userId = body["id"] as number | undefined;
          const balances = (body["balances"] as Array<{ type: number; amount: number }>) ?? [];
          const real = balances.find((b) => b.type === 1);
          const practice = balances.find((b) => b.type === 4);
          iqSession.realBalance = real?.amount ?? 0;
          iqSession.practiceBalance = practice?.amount ?? 10000;
          iqSession.balance =
            iqSession.accountType === "REAL"
              ? iqSession.realBalance
              : iqSession.practiceBalance;
          iqSession.connected = true;
          logger.info(
            { userId: iqSession.userId, realBalance: iqSession.realBalance, practiceBalance: iqSession.practiceBalance },
            "IQ Option profile received"
          );
          resolve();
        }

        if (name === "candles" || name === "history" || name === "get-candles") {
          const reqId = String((body["request_id"] ?? "") as string | number);
          const cb = iqSession.pendingCallbacks.get(reqId);
          if (cb) {
            iqSession.pendingCallbacks.delete(reqId);
            cb(body);
          }
        }

        if (name === "heartbeat") {
          sendWs({ name: "heartbeat", msg: { heartbeat: body["heartbeat"] } });
        }

        if (name === "balance-changed") {
          const newBalance = body["amount"] as number | undefined;
          if (newBalance !== undefined) {
            iqSession.balance = newBalance;
            if (iqSession.accountType === "REAL") iqSession.realBalance = newBalance;
            else iqSession.practiceBalance = newBalance;
          }
        }
      } catch {
        // ignore parse errors
      }
    });

    ws.on("error", (err) => {
      if (!authenticated) {
        clearTimeout(timeout);
        iqSession.lastError = err.message;
        logger.warn({ err: err.message }, "IQ Option WebSocket error");
        reject(err);
      }
    });

    ws.on("close", () => {
      if (!authenticated) {
        clearTimeout(timeout);
        reject(new Error("WebSocket closed before authentication"));
        // Don't reset session — HTTP-authenticated session stays valid
        return;
      }
      // Only reset if WS was the primary connection source
      iqSession.ws = undefined;
      logger.warn("IQ Option WebSocket closed");
    });
  });
}

export async function iqLogin(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    logger.info({ email }, "Attempting IQ Option login");

    const userAgent =
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    const loginRes = await axios.post(
      "https://auth.iqoption.com/api/v1.0/login",
      { email, password },
      {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": userAgent,
          Origin: "https://iqoption.com",
          Referer: "https://iqoption.com/",
        },
        timeout: 15000,
        validateStatus: () => true,
      }
    );

    if (loginRes.status === 403 || loginRes.status === 401) {
      return { success: false, error: "Email ou senha incorretos" };
    }

    if (loginRes.status === 400) {
      const errBody = loginRes.data as { errors?: Array<{ title?: string }> };
      const firstErr = errBody?.errors?.[0]?.title ?? "Credenciais invalidas";
      return { success: false, error: firstErr };
    }

    if (loginRes.status !== 200) {
      return {
        success: false,
        error: `Erro ao conectar com IQ Option (HTTP ${loginRes.status})`,
      };
    }

    const resData = loginRes.data as { data?: { ssid?: string } };
    let ssid = resData?.data?.ssid ?? "";

    // Also try cookie extraction
    const setCookies: string[] =
      (loginRes.headers["set-cookie"] as string[] | undefined) ?? [];

    if (!ssid) {
      const ssidCookie = setCookies.find((c) => c.startsWith("ssid="));
      if (ssidCookie) ssid = ssidCookie.split(";")[0].replace("ssid=", "");
    }

    if (!ssid) {
      return {
        success: false,
        error: "Nao foi possivel obter a sessao da IQ Option. Verifique suas credenciais.",
      };
    }

    iqSession.ssid = ssid;
    iqSession.email = email;
    iqSession.accountType = "PRACTICE";

    // Build cookie string including the ssid
    const cookieMap = new Map<string, string>();
    for (const c of setCookies) {
      const [pair] = c.split(";");
      const eqIdx = pair.indexOf("=");
      if (eqIdx > 0) {
        cookieMap.set(pair.slice(0, eqIdx).trim(), pair.slice(eqIdx + 1).trim());
      }
    }
    // Ensure ssid cookie is included
    if (!cookieMap.has("ssid")) cookieMap.set("ssid", ssid);

    const cookieString = Array.from(cookieMap.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");

    iqSession.loginCookies = cookieString;

    logger.info({ ssidLength: ssid.length, cookieCount: cookieMap.size }, "Login HTTP success, connecting WebSocket");

    // Mark as authenticated via HTTP — WebSocket is attempted but optional
    iqSession.connected = true;
    iqSession.realBalance = 0;
    iqSession.practiceBalance = 10000;
    iqSession.balance = iqSession.practiceBalance;

    // Try WebSocket in background (may fail from cloud servers — that's OK)
    connectWebSocket(ssid, cookieString).then(() => {
      logger.info("IQ Option WebSocket connected — using real-time data");
    }).catch((wsErr: Error) => {
      logger.warn({ err: wsErr.message }, "IQ Option WebSocket unavailable from this server — using simulated data");
    });

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, "IQ Option login failed");

    if (msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND")) {
      return { success: false, error: "Sem conexao com a internet ou IQ Option indisponivel." };
    }
    if (msg.includes("timeout")) {
      return { success: false, error: "Conexao com IQ Option expirou. Tente novamente." };
    }
    return { success: false, error: `Falha ao conectar: ${msg.slice(0, 120)}` };
  }
}

export async function iqGetCandles(
  asset: string,
  duration: number,
  count: number
): Promise<IQCandle[] | null> {
  if (!iqSession.ws || iqSession.ws.readyState !== WebSocket.OPEN) {
    return null;
  }

  const reqId = nextReqId();
  const endTime = Math.floor(Date.now() / 1000);

  return new Promise((resolve) => {
    const timeoutHandle = setTimeout(() => {
      iqSession.pendingCallbacks.delete(reqId);
      resolve(null);
    }, 10000);

    iqSession.pendingCallbacks.set(reqId, (data: unknown) => {
      clearTimeout(timeoutHandle);
      const body = data as { candles?: IQCandle[] };
      resolve(body?.candles ?? null);
    });

    sendWs({
      name: "get-candles",
      msg: {
        asset_name: asset,
        duration,
        to: endTime,
        count,
        request_id: reqId,
      },
    });
  });
}

export function iqLogout(): void {
  if (iqSession.ws) {
    iqSession.ws.terminate();
    iqSession.ws = undefined;
  }
  iqSession.connected = false;
  iqSession.ssid = "";
  iqSession.email = "";
  iqSession.balance = 0;
  iqSession.realBalance = 0;
  iqSession.practiceBalance = 0;
  iqSession.loginCookies = "";
  iqSession.pendingCallbacks.clear();
}

export function iqSwitchAccount(type: "REAL" | "PRACTICE"): void {
  iqSession.accountType = type;
  iqSession.balance =
    type === "REAL" ? iqSession.realBalance : iqSession.practiceBalance;

  if (iqSession.ws && iqSession.ws.readyState === WebSocket.OPEN) {
    sendWs({
      name: "change-account",
      msg: { account_type: type === "REAL" ? "real" : "practice" },
    });
  }
}
