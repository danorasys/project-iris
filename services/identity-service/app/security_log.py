# Security events (locks, closed sessions, token theft) go to their own logger,
# so they can be found and alerted on. Only ids and counters, never emails,
# IPs, codes or tokens.

from __future__ import annotations

import logging

logger = logging.getLogger("iris.security")


def log_security_event(event: str, **fields: object) -> None:
    details = " ".join(f"{key}={value}" for key, value in fields.items())
    logger.warning("security_event=%s %s", event, details)
