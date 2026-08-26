#!/usr/bin/env python3
"""
generate_top_story.py
Scans all region ports and produces TWO top story cards:
  1. Caribbean (Eastern Caribbean, Western Caribbean, Bahamas, Southern Caribbean, Lesser Antilles)
  2. Mediterranean (Western Mediterranean, Central Mediterranean, Eastern Mediterranean)
Each story starts directly with the weather content -- no opener phrase.
Outputs: client/public/top_story.json
"""


import asyncio, concurrent.futures, json, math, os, subprocess, sys, time, urllib.request, urllib.error
from datetime import date, datetime, timezone
from pathlib import Path


try:
    import aiohttp
except ImportError:
    aiohttp = None


try:
    import httpx as _httpx
    _USE_HTTPX = True
except ImportError:
    _USE_HTTPX = False


# Prefer the established Groq production path. The existing Manus-scheduled job
# can fall back to its already injected OpenAI-compatible runtime when Groq is
# unavailable, without introducing a new credential or external scheduler.
_USING_BUILTIN_RUNTIME = not os.environ.get("GROQ_API_KEY") and bool(os.environ.get("OPENAI_API_KEY"))
GROQ_API_KEY = os.environ.get("GROQ_API_KEY") or os.environ.get("OPENAI_API_KEY", "")
GROQ_BASE_URL = (
    os.environ.get("GROQ_BASE_URL")
    or os.environ.get("OPENAI_API_BASE")
    or "https://api.groq.com/openai/v1"
)
GROQ_MODEL = os.environ.get("GROQ_MODEL") or (
    "gpt-5-mini" if _USING_BUILTIN_RUNTIME else "openai/gpt-oss-20b"
)




def _format_rain_prob(value) -> str:
    """
    Render a precipitation-probability value as a human-readable phrase.
    Bug 2 fix: Any value strictly less than 10% is rendered as the fixed phrase
    'less than 10% rain probability'. Values of 10% or higher render as the
    literal integer percent.
    """
    try:
        v = int(round(float(value)))
    except (TypeError, ValueError):
        v = 0
    if v < 10:
        return "less than 10% rain probability"
    return f"{v}% rain probability"




def _normalize_low_rain_phrasing(text: str) -> str:
    """
    Post-generation rain-wording filter (Layer B for Bug 2).
    Rewrites any sub-10% rain phrasing in model output to the canonical phrase
    'less than 10% rain probability'. Values of 10% or higher untouched.
    """
    import re
    CANONICAL = "less than 10% rain probability"
    patterns = [
        re.compile(
            r"\b[0-9]\s*%\s*(?:chance\s+of\s+(?:rain|drizzle|showers|precipitation)|rain(?:fall)?(?:\s+chance|\s+probability|\s+chances)?|(?:rain\s+)?probability(?:\s+of\s+rain)?)\b",
            re.IGNORECASE,
        ),
