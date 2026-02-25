#!/usr/bin/env python3
"""Ethical scraping utility with robots/ToS checks, rate limiting, and table extraction."""

from __future__ import annotations

import argparse
import json
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup

DEFAULT_USER_AGENT = "AnalystCopilotBot/1.0 (+https://example.com/analyst-copilot)"


@dataclass
class RateLimiter:
    min_interval_seconds: float = 0.75  # ~1.33 req/sec
    _last_request_at: float = 0.0

    def wait(self) -> None:
        now = time.time()
        elapsed = now - self._last_request_at
        remaining = self.min_interval_seconds - elapsed
        if remaining > 0:
            time.sleep(remaining)
        self._last_request_at = time.time()


class Scraper:
    def __init__(self, user_agent: str = DEFAULT_USER_AGENT, min_interval_seconds: float = 0.75):
        self.user_agent = user_agent
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": user_agent})
        self.rate_limiter = RateLimiter(min_interval_seconds=min_interval_seconds)

    def _request(
        self,
        method: str,
        url: str,
        timeout: float = 15.0,
        max_retries: int = 3,
        backoff_seconds: float = 1.0,
        stream: bool = False,
    ) -> requests.Response:
        last_error: Optional[Exception] = None
        for attempt in range(max_retries):
            self.rate_limiter.wait()
            try:
                resp = self.session.request(method=method, url=url, timeout=timeout, allow_redirects=True, stream=stream)
                if resp.status_code in (429, 503):
                    sleep_for = backoff_seconds * (2 ** attempt)
                    time.sleep(sleep_for)
                    continue
                return resp
            except requests.RequestException as exc:
                last_error = exc
                time.sleep(backoff_seconds * (2 ** attempt))
        if last_error:
            raise last_error
        raise RuntimeError("Request failed without explicit exception")

    def check_robots(self, url: str) -> Dict[str, object]:
        parsed = urlparse(url)
        robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
        rp = RobotFileParser()

        try:
            self.rate_limiter.wait()
            rp.set_url(robots_url)
            rp.read()
            allowed = rp.can_fetch(self.user_agent, url)
            return {
                "robots_url": robots_url,
                "allowed": bool(allowed),
            }
        except Exception as exc:
            return {
                "robots_url": robots_url,
                "allowed": False,
                "error": f"robots check failed: {exc}",
            }

    def discover_terms_url(self, url: str) -> Optional[str]:
        parsed = urlparse(url)
        base = f"{parsed.scheme}://{parsed.netloc}"
        candidates = [
            "/terms",
            "/terms-of-service",
            "/tos",
            "/legal/terms",
            "/legal/terms-of-service",
        ]
        for path in candidates:
            candidate = urljoin(base, path)
            try:
                resp = self._request("HEAD", candidate, timeout=10, max_retries=2)
                if 200 <= resp.status_code < 400:
                    return candidate
            except Exception:
                continue
        return None

    def check_terms_restrictions(self, terms_url: Optional[str]) -> Dict[str, object]:
        if not terms_url:
            return {"terms_url": None, "status": "unknown", "notes": ["No standard terms URL found"]}

        try:
            resp = self._request("GET", terms_url, timeout=15, max_retries=2)
            if resp.status_code >= 400:
                return {
                    "terms_url": terms_url,
                    "status": "unknown",
                    "notes": [f"Terms page returned HTTP {resp.status_code}"],
                }
            text = BeautifulSoup(resp.text, "html.parser").get_text(" ", strip=True).lower()
            blocked_phrases = [
                "no scraping",
                "no automated",
                "automated access is prohibited",
                "bots are prohibited",
                "without prior written consent",
            ]
            matched = [phrase for phrase in blocked_phrases if phrase in text]
            if matched:
                return {
                    "terms_url": terms_url,
                    "status": "restricted",
                    "notes": [f"Potential restriction found: '{m}'" for m in matched],
                }
            return {
                "terms_url": terms_url,
                "status": "no_obvious_block",
                "notes": ["No obvious anti-scraping phrase detected; manual legal review still recommended."],
            }
        except Exception as exc:
            return {"terms_url": terms_url, "status": "unknown", "notes": [f"ToS check failed: {exc}"]}

    @staticmethod
    def _extract_title(soup: BeautifulSoup) -> str:
        if soup.title and soup.title.string:
            return soup.title.string.strip()
        h1 = soup.find("h1")
        if h1:
            return h1.get_text(" ", strip=True)
        return ""

    @staticmethod
    def _extract_main_text(soup: BeautifulSoup) -> str:
        selectors = ["main", "article", "[role='main']"]
        node = None
        for selector in selectors:
            node = soup.select_one(selector)
            if node:
                break
        if node is None:
            node = soup.body or soup

        for bad in node.select("script, style, noscript, svg, form, nav, footer, aside"):
            bad.decompose()

        paragraphs = [p.get_text(" ", strip=True) for p in node.select("p")]
        lines = [line for line in paragraphs if line]
        text = "\n".join(lines)
        if len(text) < 120:
            text = node.get_text("\n", strip=True)
        return "\n".join([ln.strip() for ln in text.splitlines() if ln.strip()])

    @staticmethod
    def _extract_tables(soup: BeautifulSoup) -> List[Dict[str, object]]:
        tables: List[Dict[str, object]] = []
        for idx, table in enumerate(soup.find_all("table")):
            rows = table.find_all("tr")
            if not rows:
                continue

            headers: List[str] = []
            first_cells = rows[0].find_all(["th", "td"])
            if any(cell.name == "th" for cell in first_cells):
                headers = [cell.get_text(" ", strip=True) for cell in first_cells]
                data_rows = rows[1:]
            else:
                data_rows = rows

            parsed_rows: List[List[str]] = []
            for row in data_rows:
                cells = [cell.get_text(" ", strip=True) for cell in row.find_all(["td", "th"])]
                if cells:
                    parsed_rows.append(cells)

            if not parsed_rows:
                continue

            tables.append(
                {
                    "index": idx,
                    "headers": headers,
                    "rows": parsed_rows,
                }
            )
        return tables

    def scrape(self, url: str, dry_run: bool = False) -> Dict[str, object]:
        fetched_at = datetime.now(timezone.utc).isoformat()
        robots = self.check_robots(url)
        terms_url = self.discover_terms_url(url)

        result: Dict[str, object] = {
            "url": url,
            "fetched_at": fetched_at,
            "title": "",
            "text": "",
            "tables": [],
            "robots": robots,
            "terms": {"terms_url": terms_url, "status": "unchecked", "notes": []},
            "dry_run": dry_run,
        }

        if not robots.get("allowed", False):
            result["terms"] = {"terms_url": terms_url, "status": "blocked", "notes": ["robots.txt disallows scraping for this user-agent."]}
            result["error"] = "Robots policy disallows scraping."
            return result

        if dry_run:
            try:
                head = self._request("HEAD", url, timeout=12, max_retries=2)
                result["headers"] = {
                    "status_code": head.status_code,
                    "content_type": head.headers.get("content-type"),
                    "content_length": head.headers.get("content-length"),
                }
            except Exception as exc:
                result["headers"] = {"error": str(exc)}
            result["terms"] = {"terms_url": terms_url, "status": "manual_review_required", "notes": ["Dry run skips full ToS text fetch."]}
            return result

        terms = self.check_terms_restrictions(terms_url)
        result["terms"] = terms
        if terms.get("status") == "restricted":
            result["error"] = "Potential ToS restriction detected; stop and review terms manually."
            return result

        response = self._request("GET", url, timeout=20, max_retries=3)
        if response.status_code >= 400:
            result["error"] = f"HTTP {response.status_code}"
            return result

        soup = BeautifulSoup(response.text, "html.parser")
        result["title"] = self._extract_title(soup)
        result["text"] = self._extract_main_text(soup)
        result["tables"] = self._extract_tables(soup)
        return result


def scrape_url(
    url: str,
    dry_run: bool = False,
    user_agent: str = DEFAULT_USER_AGENT,
    requests_per_second: float = 1.25,
) -> Dict[str, object]:
    min_interval = 1.0 / max(requests_per_second, 0.1)
    scraper = Scraper(user_agent=user_agent, min_interval_seconds=min_interval)
    return scraper.scrape(url=url, dry_run=dry_run)


def main() -> None:
    parser = argparse.ArgumentParser(description="Ethical scrape utility with robots/ToS checks")
    parser.add_argument("url", type=str)
    parser.add_argument("--dry-run", action="store_true", help="Only robots + headers checks; no full content fetch")
    parser.add_argument("--user-agent", type=str, default=DEFAULT_USER_AGENT)
    parser.add_argument("--rps", type=float, default=1.25, help="Max requests per second")
    parser.add_argument("--out", type=str, default="")
    args = parser.parse_args()

    payload = scrape_url(
        url=args.url,
        dry_run=args.dry_run,
        user_agent=args.user_agent,
        requests_per_second=args.rps,
    )

    text = json.dumps(payload, indent=2, ensure_ascii=False)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(text)
        print(f"Wrote scrape payload to {args.out}")
    else:
        print(text)


if __name__ == "__main__":
    main()
