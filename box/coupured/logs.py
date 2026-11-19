"""Structured JSON logs with redaction. Tokens, invoices, macaroons, NWC secrets and seed-like strings
never reach the log, whatever code path tries to log them."""

from __future__ import annotations

import json
import logging
import re
import sys

_PATTERNS = [
    (re.compile(r"cashu[AB][A-Za-z0-9_\-+/=]{8,}"), "cashu<redacted>"),
    (re.compile(r"ln(bc|tb|bcrt)[0-9a-z]{20,}", re.I), "ln<redacted-invoice>"),
    (re.compile(r"nostr\+walletconnect://\S+", re.I), "nwc<redacted>"),
    (re.compile(r"\b[0-9a-f]{64,}\b", re.I), "<redacted-hex>"),  # macaroons, keys, preimages
    (re.compile(r"\b(?:[a-z]{3,8} ){11,23}[a-z]{3,8}\b"), "<redacted-words>"),  # BIP-39 phrases
]


def redact(text: str) -> str:
    for pat, repl in _PATTERNS:
        text = pat.sub(repl, text)
    return text


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        out = {
            "ts": round(record.created, 3),
            "lvl": record.levelname,
            "logger": record.name,
            "msg": redact(record.getMessage()),
        }
        if record.exc_info:
            out["exc"] = redact(self.formatException(record.exc_info))
        return json.dumps(out, ensure_ascii=False)


def setup() -> None:
    h = logging.StreamHandler(sys.stdout)
    h.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [h]
    root.setLevel(logging.INFO)
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        lg = logging.getLogger(name)
        lg.handlers[:] = [h]
        lg.propagate = False
    # access logs carry client IPs: personal data we do not need
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
