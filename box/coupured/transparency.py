"""Read a read-only mint snapshot, never infer liabilities from the app's own receipts."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any


def read_liabilities(directory: str) -> dict[str, Any]:
    try:
        data = json.loads((Path(directory) / "liabilities.json").read_text())
        if not isinstance(data["outstanding_sat"], int) or data["outstanding_sat"] < 0:
            raise ValueError("invalid balance")
        age = time.time() - float(data["ts"])
        if age < -5 or age > 30:
            raise ValueError("stale snapshot")
        return {**data, "available": True, "age_s": round(age, 1)}
    except (OSError, ValueError, KeyError, TypeError):
        return {"available": False, "outstanding_sat": None, "keysets": [], "age_s": None}
