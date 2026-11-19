"""Short-lived, per-process operator sessions. PIN never stored in the browser."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import time


class OperatorAuth:
    def __init__(self, pin: str) -> None:
        self.salt = secrets.token_bytes(16)
        self.digest = self._hash(pin) if pin else None
        self.sessions: dict[str, float] = {}

    def _hash(self, value: str) -> bytes:
        return hashlib.scrypt(value.encode(), salt=self.salt, n=2**14, r=8, p=1, dklen=32)

    def login(self, pin: str) -> str | None:
        if self.digest is None or not hmac.compare_digest(self._hash(pin), self.digest):
            return None
        now = time.monotonic()
        self.sessions = {k: v for k, v in self.sessions.items() if v > now}
        token = secrets.token_urlsafe(32)
        self.sessions[hashlib.sha256(token.encode()).hexdigest()] = now + 900
        return token

    def valid(self, token: str) -> bool:
        key = hashlib.sha256(token.encode()).hexdigest()
        return self.sessions.get(key, 0) > time.monotonic()
