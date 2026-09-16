# Simple in-process circuit breaker. Opens after N consecutive failures and
# stays open for segundos_apertura, after which it allows one probe attempt
# (half-open) before deciding whether to close again. No need for an external
# library for ~30 lines.

from __future__ import annotations

import time
from collections.abc import Awaitable, Callable
from typing import TypeVar

T = TypeVar("T")


# The circuit is open. Fails fast without touching the network.
class CircuitAbiertoError(Exception):
    pass


class CircuitBreaker:
    def __init__(self, umbral_fallos: int = 5, segundos_apertura: int = 30) -> None:
        self._umbral_fallos = umbral_fallos
        self._segundos_apertura = segundos_apertura
        self._fallos_consecutivos = 0
        self._abierto_hasta: float | None = None

    def _circuito_abierto(self) -> bool:
        if self._abierto_hasta is None:
            return False
        if time.monotonic() >= self._abierto_hasta:
            return False  # open window expired, half-open, one attempt is allowed
        return True

    async def llamar(self, operacion: Callable[[], Awaitable[T]]) -> T:
        if self._circuito_abierto():
            raise CircuitAbiertoError()
        try:
            resultado = await operacion()
        except Exception:
            self._registrar_fallo()
            raise
        else:
            self._registrar_exito()
            return resultado

    def _registrar_fallo(self) -> None:
        self._fallos_consecutivos += 1
        if self._fallos_consecutivos >= self._umbral_fallos:
            self._abierto_hasta = time.monotonic() + self._segundos_apertura

    def _registrar_exito(self) -> None:
        self._fallos_consecutivos = 0
        self._abierto_hasta = None
