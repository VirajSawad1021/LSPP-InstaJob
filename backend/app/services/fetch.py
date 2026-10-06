"""Evidence collection over the network: live URLs and public GitHub data.

User-supplied URLs are fetched server-side, so block private/loopback targets (SSRF).
"""
from __future__ import annotations

import asyncio
import ipaddress
import re
import socket
import time
from html import unescape
from urllib.parse import urlparse

import httpx

UA = {"User-Agent": "InstaJob-VerificationAgent/1.0"}


class FetchError(ValueError):
    pass


async def _assert_public(url: str) -> None:
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname:
        raise FetchError("URL must start with http:// or https://")
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(p.hostname, None)
    except socket.gaierror:
        raise FetchError(f"Could not resolve {p.hostname}")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise FetchError("URL points to a private network address")


def _text_from_html(html: str) -> str:
    html = re.sub(r"(?is)<(script|style|noscript|svg)[^>]*>.*?</\1>", " ", html)
    text = re.sub(r"(?s)<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", unescape(text)).strip()


async def fetch_page(url: str, max_chars: int = 6000) -> dict:
    async def check_hop(request: httpx.Request) -> None:  # also re-checks every redirect hop
        await _assert_public(str(request.url))

    started = time.perf_counter()
    async with httpx.AsyncClient(
        timeout=15, follow_redirects=True, max_redirects=5, headers=UA, event_hooks={"request": [check_hop]}
    ) as c:
        r = await c.get(url)
    html = r.text[:400_000]
    title = re.search(r"(?is)<title[^>]*>(.*?)</title>", html)
    links = sorted(set(re.findall(r'href="(/[^"#?]{0,80})"', html)))[:40]
    forms = len(re.findall(r"(?i)<form\b", html))
    inputs = re.findall(r'(?i)<input[^>]*type="([a-z]+)"', html)[:30]
    return {
        "url": str(r.url),
        "status": r.status_code,
        "ms": int((time.perf_counter() - started) * 1000),
        "title": unescape(title.group(1).strip()) if title else "",
        "internal_links": links,
        "form_count": forms,
        "input_types": inputs,
        "is_https": str(r.url).startswith("https://"),
        "text": _text_from_html(html)[:max_chars],
    }


def _gh_repo(url_or_slug: str) -> str:
    m = re.search(r"github\.com/([\w.-]+)/([\w.-]+)", url_or_slug)
    if not m:
        raise FetchError("Repo must be a github.com/owner/name URL")
    return f"{m.group(1)}/{m.group(2).removesuffix('.git')}"


async def fetch_repo(repo_url: str) -> dict:
    slug = _gh_repo(repo_url)
    base = f"https://api.github.com/repos/{slug}"
    async with httpx.AsyncClient(timeout=15, headers={**UA, "Accept": "application/vnd.github+json"}) as c:
        meta, tree, readme, commits = await asyncio.gather(
            c.get(base),
            c.get(f"{base}/contents"),
            c.get(f"{base}/readme", headers={**UA, "Accept": "application/vnd.github.raw"}),
            c.get(f"{base}/commits", params={"per_page": 30}),
        )
        if meta.status_code == 404:
            raise FetchError("Repository not found or private")
        pkg = await c.get(f"{base}/contents/package.json", headers={**UA, "Accept": "application/vnd.github.raw"})
    m = meta.json()
    files = [f"{x['name']}{'/' if x['type'] == 'dir' else ''}" for x in (tree.json() if tree.status_code == 200 else [])]
    commit_rows = commits.json() if commits.status_code == 200 else []
    deps: list[str] = []
    if pkg.status_code == 200:
        try:
            pj = pkg.json()
            deps = sorted({*pj.get("dependencies", {}), *pj.get("devDependencies", {})})[:60]
        except Exception:
            pass
    return {
        "repo": slug,
        "description": m.get("description") or "",
        "language": m.get("language"),
        "stars": m.get("stargazers_count", 0),
        "pushed_at": m.get("pushed_at"),
        "top_level_files": files[:60],
        "package_dependencies": deps,
        "recent_commits": len(commit_rows),
        "recent_commit_messages": [c["commit"]["message"].split("\n")[0][:100] for c in commit_rows[:12]],
        "readme": (readme.text if readme.status_code == 200 else "")[:4000],
    }


async def github_signals(username: str) -> dict:
    """Public, verifiable signals for a developer profile."""
    username = username.strip().lstrip("@").split("/")[-1]
    if not re.fullmatch(r"[A-Za-z0-9-]{1,39}", username):
        raise FetchError("Invalid GitHub username")
    async with httpx.AsyncClient(timeout=15, headers={**UA, "Accept": "application/vnd.github+json"}) as c:
        u, repos = await asyncio.gather(
            c.get(f"https://api.github.com/users/{username}"),
            c.get(f"https://api.github.com/users/{username}/repos", params={"per_page": 100, "sort": "pushed"}),
        )
    if u.status_code == 404:
        raise FetchError("GitHub user not found")
    rows = [r for r in (repos.json() if repos.status_code == 200 else []) if not r.get("fork")]
    langs: dict[str, int] = {}
    for r in rows:
        if r.get("language"):
            langs[r["language"]] = langs.get(r["language"], 0) + 1
    top = sorted(rows, key=lambda r: r.get("stargazers_count", 0), reverse=True)[:5]
    return {
        "username": username,
        "public_repos": len(rows),
        "followers": u.json().get("followers", 0),
        "account_created": u.json().get("created_at"),
        "top_languages": [k for k, _ in sorted(langs.items(), key=lambda kv: -kv[1])[:6]],
        "notable_repos": [
            {"name": r["name"], "stars": r.get("stargazers_count", 0), "description": r.get("description") or "", "url": r["html_url"]}
            for r in top
        ],
        "last_push": rows[0].get("pushed_at") if rows else None,
    }
