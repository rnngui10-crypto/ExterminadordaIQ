"""
IQ Option Python Bridge
Authenticates via https://auth.iqoption.com/api/v1.0/login (new endpoint),
injects the ssid cookie into iqoptionapi session, starts WebSocket manually.
Exposes a local REST API on port 7777 for the Node.js server.
"""

import sys
import os
import time
import threading
import logging

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../.pythonlibs/lib/python3.11/site-packages'))

import requests as http_requests
from flask import Flask, jsonify, request
from flask_cors import CORS
from iqoptionapi.api import IQOptionAPI
from iqoptionapi.constants import ACTIVES
from iqoptionapi.ws.client import WebsocketClient

logging.basicConfig(level=logging.WARNING)

app = Flask(__name__)
CORS(app)

ASSET_IDS = dict(ACTIVES)

# Stores the full profile payload from the WebSocket "profile" message
ws_profile_cache: dict = {}

AUTH_HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Origin": "https://iqoption.com",
    "Referer": "https://iqoption.com/",
}

state = {
    "api": None,
    "connected": False,
    "email": "",
    "account_type": "PRACTICE",
    "balance": 0.0,
    "balance_ids": {},
}


def get_active_id(asset: str) -> int:
    name = asset.upper()
    if name in ASSET_IDS:
        return ASSET_IDS[name]
    otc = name + "-OTC"
    if otc in ASSET_IDS:
        return ASSET_IDS[otc]
    return ASSET_IDS.get("EURUSD-OTC", 76)


def do_direct_login(email: str, password: str):
    """
    Login via the new IQ Option auth endpoint.
    Returns (ssid, cookies_jar).
    Raises on failure.
    """
    resp = http_requests.post(
        "https://auth.iqoption.com/api/v1.0/login",
        json={"email": email, "password": password},
        headers=AUTH_HEADERS,
        timeout=20,
    )

    if resp.status_code == 200:
        ssid = resp.cookies.get("ssid")
        if ssid:
            return ssid, resp.cookies
        # Some responses put it in the body
        body = resp.json()
        ssid = (body.get("ssid") or
                body.get("data", {}).get("ssid") or
                body.get("token"))
        if ssid:
            return ssid, resp.cookies
        raise ValueError("Login bem-sucedido mas ssid não encontrado na resposta")

    if resp.status_code in (401, 403):
        try:
            body = resp.json()
            errors = body.get("errors", [])
            if errors:
                code = errors[0].get("code", 0)
                if code in (202, 203, 401):
                    raise ValueError("Email ou senha incorretos")
        except (ValueError, KeyError):
            pass
        raise ValueError("Email ou senha incorretos")

    resp.raise_for_status()


def connect_iq_api(email: str, password: str, ssid: str, login_cookies) -> IQOptionAPI:
    """
    Build an IQOptionAPI instance, inject the ssid cookie, start WebSocket.
    api.profile_data will be populated by the patched client.py when the
    'profile' WS message arrives.
    """
    api = IQOptionAPI("iqoption.com", email, password)
    api.profile_data = {}

    # Inject the ssid cookie and any other cookies from the auth response
    for cookie in login_cookies:
        api.session.cookies.set(
            cookie.name, cookie.value,
            domain=cookie.domain or "iqoption.com",
            path=cookie.path or "/",
        )

    # set_session_cookies() adds platform=9 and calls getprofile() via HTTP
    api.set_session_cookies()

    # Start WebSocket in background thread
    api.websocket_client = WebsocketClient(api)
    ws_thread = threading.Thread(target=api.websocket.run_forever)
    ws_thread.daemon = True
    ws_thread.start()

    # Wait for WS to connect then authenticate
    time.sleep(5)
    api.ssid(ssid)  # pylint: disable=not-callable

    # Wait for 'profile' WS message (populated by patched client.py)
    deadline = time.time() + 6
    while time.time() < deadline:
        if getattr(api, "profile_data", {}).get("balances"):
            break
        time.sleep(0.2)

    return api


def fetch_profile_balances(api: IQOptionAPI) -> dict:
    """
    Returns {REAL: {id, amount}, PRACTICE: {id, amount}}.
    Reads from api.profile_data (populated by the patched ws/client.py).
    Falls back to HTTP getprofile if WS data not yet available.
    """
    result = {}

    # 1. Prefer WS profile data (api.profile_data set by patched client.py)
    ws_balances = getattr(api, "profile_data", {}).get("balances", [])
    if ws_balances:
        for b in ws_balances:
            b_type = b.get("type")
            b_id = b.get("id")
            amount = float(b.get("amount", 0))
            if b_type == 1:
                result["REAL"] = {"id": b_id, "amount": amount}
            elif b_type == 4:
                result["PRACTICE"] = {"id": b_id, "amount": amount}
        if result:
            return result

    # 2. Fall back to HTTP getprofile
    try:
        resp = api.getprofile()
        if resp.status_code != 200:
            return result
        data = resp.json()
        profile_data = data.get("result", data.get("data", data))
        http_balances = profile_data.get("balances", [])
        for b in http_balances:
            b_type = b.get("type")
            b_id = b.get("id")
            amount = float(b.get("amount", 0))
            if b_type == 1:
                result["REAL"] = {"id": b_id, "amount": amount}
            elif b_type == 4:
                result["PRACTICE"] = {"id": b_id, "amount": amount}
    except Exception as e:
        print(f"[bridge] fetch_profile_balances HTTP fallback error: {e}", flush=True)

    return result


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/login", methods=["POST"])
def login():
    data = request.json or {}
    email = data.get("email", "")
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"success": False, "error": "Email e senha obrigatórios"}), 400

    try:
        # Disconnect previous session cleanly
        if state["api"] is not None:
            try:
                if state["api"].websocket_client:
                    state["api"].websocket_client.wss.close()
            except Exception:
                pass
        state["connected"] = False
        state["api"] = None

        print(f"[bridge] Authenticating {email} via auth.iqoption.com...", flush=True)

        ssid, login_cookies = do_direct_login(email, password)
        print(f"[bridge] Got ssid, connecting WebSocket...", flush=True)

        api = connect_iq_api(email, password, ssid, login_cookies)

        # Try to get balance from WebSocket profile first
        bal = api.profile.balance
        if bal is None:
            # Fall back to HTTP getprofile
            try:
                resp = api.getprofile()
                if resp.status_code == 200:
                    pdata = resp.json().get("data", resp.json())
                    bal = pdata.get("balance", 0)
            except Exception:
                bal = 0

        state["api"] = api
        state["connected"] = True
        state["email"] = email
        state["account_type"] = "REAL"
        state["balance"] = float(bal or 0)

        balance_ids = fetch_profile_balances(api)
        state["balance_ids"] = balance_ids
        practice_bal = balance_ids.get("PRACTICE", {}).get("amount", 0.0)
        real_bal = balance_ids.get("REAL", {}).get("amount", float(bal or 0))

        # Switch to REAL account automatically
        real_info = balance_ids.get("REAL")
        if real_info and real_info.get("id"):
            try:
                api.changebalance(real_info["id"])
                time.sleep(1)
                current_bal = api.profile.balance
                if current_bal is not None:
                    real_bal = float(current_bal)
                    real_info["amount"] = real_bal
                state["balance"] = real_bal
                print(f"[bridge] Switched to REAL. Balance={real_bal:.2f} BRL", flush=True)
            except Exception as e:
                print(f"[bridge] Warning: could not switch to REAL: {e}", flush=True)
        else:
            print(f"[bridge] Connected! PRACTICE={practice_bal:.2f}, REAL={real_bal:.2f}", flush=True)

        return jsonify({
            "success": True,
            "email": email,
            "accountType": "REAL",
            "balance": state["balance"],
            "realBalance": real_bal,
            "practiceBalance": practice_bal,
            "usingRealData": True,
        })

    except ValueError as e:
        err = str(e)
        print(f"[bridge] Login failed: {err}", flush=True)
        return jsonify({"success": False, "error": err}), 401

    except Exception as e:
        err = str(e)
        print(f"[bridge] Login error: {err}", flush=True)
        if any(k in err.lower() for k in ["401", "unauthorized", "password", "credentials", "invalid"]):
            return jsonify({"success": False, "error": "Email ou senha incorretos"}), 401
        return jsonify({"success": False, "error": f"Falha ao conectar: {err[:200]}"}), 500


@app.route("/status")
def status():
    if not state["connected"] or state["api"] is None:
        return jsonify({"connected": False})

    try:
        bal = state["api"].profile.balance
        if bal is not None:
            state["balance"] = float(bal)
    except Exception:
        pass

    balance_ids = state["balance_ids"]
    return jsonify({
        "connected": True,
        "email": state["email"],
        "accountType": state["account_type"],
        "balance": state["balance"],
        "realBalance": balance_ids.get("REAL", {}).get("amount", 0.0),
        "practiceBalance": balance_ids.get("PRACTICE", {}).get("amount", state["balance"]),
        "usingRealData": True,
    })


@app.route("/logout", methods=["POST"])
def logout():
    state["connected"] = False
    state["email"] = ""
    state["balance"] = 0.0
    state["balance_ids"] = {}
    try:
        if state["api"] and state["api"].websocket_client:
            state["api"].websocket_client.wss.close()
    except Exception:
        pass
    state["api"] = None
    return jsonify({"success": True})


@app.route("/switch", methods=["POST"])
def switch_account():
    if not state["connected"] or state["api"] is None:
        return jsonify({"error": "Não conectado"}), 401

    data = request.json or {}
    acct_type = data.get("type", "PRACTICE")
    if acct_type not in ("REAL", "PRACTICE"):
        return jsonify({"error": "Tipo inválido. Use REAL ou PRACTICE"}), 400

    try:
        balance_ids = state["balance_ids"]
        b_info = balance_ids.get(acct_type)

        if not b_info or not b_info.get("id"):
            balance_ids = fetch_profile_balances(state["api"])
            state["balance_ids"] = balance_ids
            b_info = balance_ids.get(acct_type)

        if b_info and b_info.get("id"):
            state["api"].changebalance(b_info["id"])

        time.sleep(1)
        bal = state["api"].profile.balance
        if bal is not None:
            state["balance"] = float(bal)
            if b_info:
                b_info["amount"] = float(bal)

        state["account_type"] = acct_type
        return jsonify({
            "success": True,
            "accountType": acct_type,
            "balance": state["balance"],
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/candles/<asset>")
def get_candles(asset):
    if not state["connected"] or state["api"] is None:
        return jsonify({"error": "Não conectado", "candles": []}), 401

    duration = int(request.args.get("duration", 60))
    count = int(request.args.get("count", 100))

    try:
        active_id = get_active_id(asset)
        api = state["api"]

        api.candles.candles_data = None
        api.getcandles(active_id, duration)

        deadline = time.time() + 8
        while time.time() < deadline:
            cd = api.candles.candles_data
            if cd is not None:
                break
            time.sleep(0.1)

        cd = api.candles.candles_data
        if cd is None:
            return jsonify({"candles": [], "error": "Timeout aguardando candles — ativo pode estar indisponível"}), 504

        result = []
        raw = cd if isinstance(cd, list) else []
        for c in raw[-count:]:
            if isinstance(c, (list, tuple)) and len(c) >= 5:
                result.append({
                    "time": int(c[0]),
                    "open": float(c[1]),
                    "close": float(c[2]),
                    "high": float(c[3]),
                    "low": float(c[4]),
                })
            elif isinstance(c, dict):
                result.append({
                    "time": int(c.get("from", c.get("time", 0))),
                    "open": float(c.get("open", 0)),
                    "close": float(c.get("close", 0)),
                    "high": float(c.get("max", c.get("high", 0))),
                    "low": float(c.get("min", c.get("low", 0))),
                })

        return jsonify({"candles": result, "asset": asset, "active_id": active_id})

    except Exception as e:
        print(f"[bridge] get_candles error: {e}", flush=True)
        return jsonify({"error": str(e), "candles": []}), 500


if __name__ == "__main__":
    port = int(os.environ.get("BRIDGE_PORT", "7777"))
    print(f"[IQ Bridge] Starting on port {port}", flush=True)
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
