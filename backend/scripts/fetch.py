#!/usr/bin/env python3
"""HTTP fetcher for Webtoons - bypasses TLS fingerprint blocking via Python urllib."""
import sys
import json
import urllib.request
import gzip
import io

def fetch(url, headers=None, method="GET"):
    """Fetch a URL and return JSON with status, headers, body."""
    default_headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.7",
        "Accept-Encoding": "gzip",
    }
    if headers:
        default_headers.update(headers)

    req = urllib.request.Request(url, headers=default_headers, method=method)
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        data = resp.read()
        if resp.headers.get("Content-Encoding") == "gzip":
            data = gzip.decompress(data)
        body = data.decode("utf-8", errors="replace")
        result = {
            "status": resp.status,
            "url": resp.url,
            "body": body,
        }
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        result = {"status": e.code, "url": url, "body": body, "error": str(e)}
    except Exception as e:
        result = {"status": 0, "url": url, "body": "", "error": str(e)}

    return json.dumps(result, ensure_ascii=False)

def download(url, filepath, headers=None):
    """Download a binary file (image) to filepath."""
    default_headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/webp,image/avif,image/*,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9",
    }
    if headers:
        default_headers.update(headers)

    req = urllib.request.Request(url, headers=default_headers)
    try:
        resp = urllib.request.urlopen(req, timeout=60)
        data = resp.read()
        with open(filepath, "wb") as f:
            f.write(data)
        result = {"status": resp.status, "size": len(data), "filepath": filepath}
    except Exception as e:
        result = {"status": 0, "error": str(e)}

    return json.dumps(result, ensure_ascii=False)

if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "fetch":
        url = sys.argv[2]
        extra_headers = json.loads(sys.argv[3]) if len(sys.argv) > 3 else None
        print(fetch(url, extra_headers))
    elif cmd == "download":
        url = sys.argv[2]
        filepath = sys.argv[3]
        extra_headers = json.loads(sys.argv[4]) if len(sys.argv) > 4 else None
        print(download(url, filepath, extra_headers))
