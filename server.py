"""AI Trading Signal Bot — Flask web server.

Run on Termux:
    pkg install python
    pip install flask requests
    python server.py
Then open http://<phone-local-ip>:8000 from any device on the same network.
"""
import socket

from flask import Flask, jsonify, render_template, request

import config
from engine import engine

app = Flask(__name__)


@app.route("/")
def index():
    return render_template(
        "index.html",
        symbols=config.SYMBOLS,
        intervals=config.INTERVALS,
        default_symbol=config.DEFAULT_SYMBOL,
        default_interval=config.DEFAULT_INTERVAL,
    )


@app.route("/api/state")
def api_state():
    symbol = request.args.get("symbol", config.DEFAULT_SYMBOL)
    interval = request.args.get("interval", config.DEFAULT_INTERVAL)
    if symbol not in config.SYMBOLS or interval not in config.INTERVALS:
        return jsonify({"error": "invalid symbol or interval"}), 400
    # Point the background loop at whatever the dashboard is viewing
    engine.symbol, engine.interval = symbol, interval
    try:
        return jsonify(engine.get_state(symbol, interval))
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 502


@app.route("/api/signals")
def api_signals():
    return jsonify(list(reversed(engine.signals[-50:])))


def _local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:  # noqa: BLE001
        return "127.0.0.1"


if __name__ == "__main__":
    engine.start()
    print("=" * 52)
    print("  AI Trading Signal Bot")
    print(f"  Local:   http://127.0.0.1:{config.PORT}")
    print(f"  Network: http://{_local_ip()}:{config.PORT}")
    print("=" * 52)
    app.run(host=config.HOST, port=config.PORT, debug=False, threaded=True)
