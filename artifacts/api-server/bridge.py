"""
IQ Option Python Bridge
Uses the official iqoptionapi library to connect to IQ Option
and exposes a local REST API on port 7777 for the Node.js server.
"""

import sys
import os
import time
import threading
import logging

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../.pythonlibs/lib/python3.11/site-packages'))

from flask import Flask, jsonify, request
from flask_cors import CORS
from iqoptionapi.api import IQOptionAPI
from iqoptionapi.constants import ACTIVES

logging.basicConfig(level=logging.WARNING)

app = Flask(__name__)
CORS(app)

ASSET_IDS = dict(ACTIVES)

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


def fetch_profile_balances(api: IQOptionAPI) -> dict:
    """Fetch the profile and return a map of type_name → balance_id."""
    try:
        resp = api.getprofile()
        if resp.status_code != 200:
            return {}
        data = resp.json()
        profile_data = data.get("data", data)
        balances = profile_data.get("balances", [])
        result = {}
        for b in balances:
            b_type = b.get("type")
            b_id = b.get("id")
            amount = b.get("amount", 0)
            if b_type == 1:
                result["REAL"] = {"id": b_id, "amount": float(amount)}
            elif b_type == 4:
                result["PRACTICE"] = {"id": b_id, "amount": float(amount)}
        return result
    except Exception as e:
        print(f"[bridge] fetch_profile_balances error: {e}", flush=True)
        return {}


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
        if state["api"] is not None:
            try:
                state["api"].websocket_client = None
            except Exception:
                pass
        state["connected"] = False
        state["api"] = None

        print(f"[bridge] Connecting to IQ Option as {email}...", flush=True)
        api = IQOptionAPI("iqoption.com", email, password)
        api.connect()
        time.sleep(3)

        bal = api.profile.balance
        if bal is None:
            return jsonify({"success": False, "error": "Não foi possível obter perfil da IQ Option"}), 500

        state["api"] = api
        state["connected"] = True
        state["email"] = email
        state["account_type"] = "PRACTICE"
        state["balance"] = float(bal)

        balance_ids = fetch_profile_balances(api)
        state["balance_ids"] = balance_ids
        practice_bal = balance_ids.get("PRACTICE", {}).get("amount", float(bal))
        real_bal = balance_ids.get("REAL", {}).get("amount", 0.0)

        print(f"[bridge] Connected! PRACTICE={practice_bal}, REAL={real_bal}", flush=True)

        return jsonify({
            "success": True,
            "email": email,
            "accountType": "PRACTICE",
            "balance": practice_bal,
            "realBalance": real_bal,
            "practiceBalance": practice_bal,
            "usingRealData": True,
        })

    except Exception as e:
        err = str(e)
        print(f"[bridge] Login error: {err}", flush=True)
        if "401" in err or "Unauthorized" in err or "password" in err.lower() or "credentials" in err.lower():
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

        if b_info and b_info.get("id"):
            state["api"].changebalance(b_info["id"])
        else:
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
