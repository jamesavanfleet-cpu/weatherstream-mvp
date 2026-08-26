#!/usr/bin/env python3
"""
Daily intel generator for WeatherStream MVP.
Fetches live weather from Open-Meteo for each region's representative port,
then calls Groq to write a fresh James Van Fleet-style intel briefing.
Outputs intel.json to stdout (captured by GitHub Actions and committed to gh-pages).
"""


import argparse
import json
import os
import subprocess as _subprocess
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from datetime import date, datetime, timezone
from pathlib import Path


# Sandbox TLS workaround: api.open-meteo.com (188.40.99.226) drops TLS connections
# in this environment. subprocess curl with --retry-all-errors is the only reliable
# transport. All Open-Meteo fetches use this helper instead of urllib.
def _curl_fetch_json(url: str, timeout: int = 60, retries: int = 15, retry_delay: int = 2) -> dict:
    """Fetch a URL via subprocess curl and return parsed JSON.
    Uses --retry-all-errors so intermittent SSL_ERROR_SYSCALL failures are retried.
    """
    result = _subprocess.run(
        ['curl', '-s', '--max-time', str(timeout),
         '--retry', str(retries), '--retry-delay', str(retry_delay),
         '--retry-all-errors', url],
        capture_output=True, text=True
    )
    if not result.stdout.strip():
        raise RuntimeError(f"curl failed rc={result.returncode}: {result.stderr.strip()[:120]}")
    return json.loads(result.stdout)


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


# Keep serial model requests apart. July 31 showed the provider rejecting back-to-back
# requests with HTTP 429, so the rate limiter applies before every request and retry.
MODEL_REQUEST_MIN_INTERVAL_SECONDS = int(os.environ.get("INTEL_MODEL_REQUEST_INTERVAL_SECONDS", "15"))
_LAST_GROQ_REQUEST_AT = 0.0


REGIONS = [
    {
        "slug": "us-ports",
        "name": "US Ports",
        "rep_port": "Miami, Florida",
        "lat": 25.76,
        "lon": -80.19,
