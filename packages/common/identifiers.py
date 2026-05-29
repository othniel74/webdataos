from __future__ import annotations

import re


def normalize_workspace_id(value: str | None) -> str:
    """Normalize legacy client workspace ids without changing normal ids."""
    raw = (value or "").strip()
    if not raw:
        return "workspace_enterprise"
    if "://" not in raw:
        return raw
    match = re.search(r"(workspace_[a-zA-Z0-9_]+)$", raw)
    return match.group(1).lower() if match else "workspace_enterprise"
