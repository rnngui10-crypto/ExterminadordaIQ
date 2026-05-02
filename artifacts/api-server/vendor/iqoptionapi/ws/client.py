"""Module for IQ option websocket."""

import json
import logging
import websocket


class WebsocketClient(object):
    """Class for work with IQ option websocket."""

    def __init__(self, api):
        """
        :param api: The instance of :class:`IQOptionAPI
            <iqoptionapi.api.IQOptionAPI>`.
        """
        self.api = api
        self.wss = websocket.WebSocketApp(
            self.api.wss_url, on_message=self.on_message,
            on_error=self.on_error, on_close=self.on_close,
            on_open=self.on_open)

    def on_message(self, wss, message): # pylint: disable=unused-argument
        """Method to process websocket messages."""
        logger = logging.getLogger(__name__)
        logger.debug(message)

        message = json.loads(str(message))
        name = message.get("name", "")

        # Store ALL incoming messages by name for debugging and candle capture
        if not hasattr(self.api, "last_messages"):
            self.api.last_messages = {}
        self.api.last_messages[name] = message

        if name == "timeSync":
            self.api.timesync.server_timestamp = message["msg"]

        if name == "profile":
            self.api.profile.balance = message["msg"]["balance"]
            if not hasattr(self.api, "profile_data"):
                self.api.profile_data = {}
            self.api.profile_data.update(message["msg"])

        if name == "candles":
            self.api.candles.candles_data = message["msg"]["data"]

        # Capture live candle events (candle-generated = new candle completed)
        if name == "candle-generated":
            self._handle_candle_generated(message.get("msg", {}))

        # Capture heartbeat / tick / quote price updates
        if name in ("heartbeat", "quote", "tick", "price-update",
                    "live-deal-binary-option-placed"):
            self._handle_price_tick(name, message.get("msg", {}))

    def _handle_candle_generated(self, msg):
        """Store completed candles in api.live_candles dict keyed by active_id+size."""
        if not hasattr(self.api, "live_candles"):
            self.api.live_candles = {}
        try:
            active_id = int(msg.get("active_id", msg.get("active", 0)))
            size = int(msg.get("size", msg.get("period", 0)))
            if active_id and size:
                key = f"{active_id}_{size}"
                if key not in self.api.live_candles:
                    self.api.live_candles[key] = []
                candle = {
                    "time": int(msg.get("from", msg.get("at", 0))),
                    "open": float(msg.get("open", 0)),
                    "close": float(msg.get("close", 0)),
                    "high": float(msg.get("max", msg.get("high", 0))),
                    "low": float(msg.get("min", msg.get("low", 0))),
                }
                self.api.live_candles[key].append(candle)
                # Keep at most 500 candles per asset/period
                if len(self.api.live_candles[key]) > 500:
                    self.api.live_candles[key] = self.api.live_candles[key][-500:]
        except Exception:
            pass

    def _handle_price_tick(self, name, msg):
        """Store the latest price tick per active_id."""
        if not hasattr(self.api, "price_ticks"):
            self.api.price_ticks = {}
        try:
            if isinstance(msg, dict):
                active_id = int(msg.get("active_id", msg.get("active", 0)))
                price = float(msg.get("price", msg.get("value", msg.get("rate", 0))))
                ts = int(msg.get("time", msg.get("at", 0)))
                if active_id and price:
                    if active_id not in self.api.price_ticks:
                        self.api.price_ticks[active_id] = []
                    self.api.price_ticks[active_id].append({"price": price, "time": ts})
                    # Keep last 2000 ticks per asset
                    if len(self.api.price_ticks[active_id]) > 2000:
                        self.api.price_ticks[active_id] = self.api.price_ticks[active_id][-2000:]
        except Exception:
            pass

    @staticmethod
    def on_error(wss, error): # pylint: disable=unused-argument
        """Method to process websocket errors."""
        logger = logging.getLogger(__name__)
        logger.error(error)

    @staticmethod
    def on_open(wss): # pylint: disable=unused-argument
        """Method to process websocket open."""
        logger = logging.getLogger(__name__)
        logger.debug("Websocket client connected.")

    @staticmethod
    def on_close(wss, close_status_code=None, close_msg=None): # pylint: disable=unused-argument
        """Method to process websocket close."""
        logger = logging.getLogger(__name__)
        logger.debug("Websocket connection closed.")
