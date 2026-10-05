# Reduces the User-Agent to two words, like ("Chrome", "Windows"), the only
# thing the session history keeps. The full text is never saved, so it can't
# single out someone's computer. The browser can lie about it: it's a hint.

from __future__ import annotations

UNKNOWN = "other"

# Order matters: Edge, Opera and Samsung say "Chrome" too, and Chrome says
# "Safari", so the more specific names are checked first.
_BROWSERS: tuple[tuple[tuple[str, ...], str], ...] = (
    (("Edg/", "EdgA/", "EdgiOS/"), "Edge"),
    (("OPR/", "Opera"), "Opera"),
    (("SamsungBrowser/",), "Samsung Internet"),
    (("Firefox/", "FxiOS/"), "Firefox"),
    (("Chrome/", "CriOS/", "Chromium/"), "Chrome"),
    (("Safari/",), "Safari"),
)

# iPhone and iPad say "like Mac OS X", and Android says "Linux", so those
# go before macOS and Linux.
_SYSTEMS: tuple[tuple[tuple[str, ...], str], ...] = (
    (("Windows",), "Windows"),
    (("iPhone", "iPod"), "iOS"),
    (("iPad",), "iPadOS"),
    (("Android",), "Android"),
    (("CrOS",), "ChromeOS"),
    (("Macintosh", "Mac OS X"), "macOS"),
    (("Linux",), "Linux"),
)


def _first_match(text: str, options: tuple[tuple[tuple[str, ...], str], ...]) -> str:
    for marks, name in options:
        if any(mark in text for mark in marks):
            return name
    return UNKNOWN


def describe_user_agent(user_agent: str | None) -> tuple[str | None, str | None]:
    """Gives back (browser, system), or (None, None) when there is no text."""
    if not user_agent or not user_agent.strip():
        return None, None
    return _first_match(user_agent, _BROWSERS), _first_match(user_agent, _SYSTEMS)
