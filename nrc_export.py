#!/usr/bin/env python3
"""
Export Nike Run Club runs to GPX.

Uses the (unofficial) endpoints used by nrc-exporter:
  - GET /plus/v3/activities/before_id/v3/{id or *}    -> paginated list
  - GET /sport/v3/me/activity/{id}?metrics=ALL        -> details + GPS

Usage:
  NIKE_TOKEN="eyJ..." python3 nrc_export.py
  (or put NIKE_TOKEN=... in a .env file next to the script)

Output:
  data/nike/raw/<id>.json   -> raw API response (so nothing is lost)
  data/nike/gpx/<date>_<id>.gpx -> GPX track (only if the activity has GPS)

Resumable: already downloaded activities are skipped.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API = "https://api.nike.com"
ROOT = Path(__file__).resolve().parent
RAW_DIR = ROOT / "data" / "nike" / "raw"
GPX_DIR = ROOT / "data" / "nike" / "gpx"


def load_token():
    token = os.environ.get("NIKE_TOKEN")
    env_file = ROOT / ".env"
    if not token and env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.strip().startswith("NIKE_TOKEN="):
                token = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not token:
        sys.exit("NIKE_TOKEN missing (environment variable or .env file).")
    if token.lower().startswith("bearer "):
        token = token[7:]
    return token


def get(path, token):
    req = urllib.request.Request(
        API + path,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0",
        },
    )
    for attempt in range(5):
        wait = 5 * (attempt + 1)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 401:
                sys.exit("401 Unauthorized: invalid or expired token (it lasts ~1h).")
            if e.code == 429 or e.code >= 500:
                print(f"  HTTP {e.code}, retrying in {wait}s…")
                time.sleep(wait)
                continue
            body = e.read().decode("utf-8", "replace")[:300]
            sys.exit(f"HTTP {e.code} on {path}\n{body}")
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            print(f"  Network error ({e}), retrying in {wait}s…")
            time.sleep(wait)
    sys.exit(f"Repeated failure on {path} — rerun the script, it will resume where it stopped.")


LIST_QS = "?limit=30&types=run%2Cjogging&include_deleted=false"


def list_activities(token):
    # The old /sport/v3/me/activities/after_time/0 route returns 404 (2026);
    # we use the mobile app's one, paginated from newest to oldest.
    activities = []
    before_id = "*"
    while True:
        data = get(f"/plus/v3/activities/before_id/v3/{before_id}{LIST_QS}", token)
        batch = data.get("activities", [])
        activities.extend(batch)
        print(f"  {len(activities)} activities listed…")
        before_id = (data.get("paging") or {}).get("before_id")
        if not before_id or not batch:
            break
    return activities


def gps_points(activity):
    """Pairs latitude/longitude by timestamp -> [(ms, lat, lon)]."""
    lats, lons = {}, {}
    for m in activity.get("metrics", []):
        if m.get("type") == "latitude":
            lats = {v["start_epoch_ms"]: v["value"] for v in m.get("values", [])}
        elif m.get("type") == "longitude":
            lons = {v["start_epoch_ms"]: v["value"] for v in m.get("values", [])}
    return [(t, lats[t], lons[t]) for t in sorted(lats) if t in lons]


def iso(ms):
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def write_gpx(path, activity, points):
    name = (activity.get("tags") or {}).get("com.nike.name", "Nike run")
    pts = "\n".join(
        f'      <trkpt lat="{lat:.7f}" lon="{lon:.7f}"><time>{iso(t)}</time></trkpt>'
        for t, lat, lon in points
    )
    path.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<gpx version="1.1" creator="nrc_export.py" xmlns="http://www.topografix.com/GPX/1/1">\n'
        f"  <metadata><time>{iso(activity['start_epoch_ms'])}</time></metadata>\n"
        f"  <trk><name>{name}</name><type>running</type>\n    <trkseg>\n{pts}\n    </trkseg>\n  </trk>\n"
        "</gpx>\n"
    )


def main():
    token = load_token()
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    GPX_DIR.mkdir(parents=True, exist_ok=True)

    print("Fetching the activity list…")
    activities = list_activities(token)
    runs = [
        a for a in activities
        if a.get("type") in ("run", "jogging") and not a.get("delete_indicator")
    ]
    print(f"{len(activities)} activities, including {len(runs)} runs.")

    with_gps = without_gps = skipped = 0
    for i, a in enumerate(runs, 1):
        aid = a["id"]
        raw_path = RAW_DIR / f"{aid}.json"
        if raw_path.exists():
            detail = json.loads(raw_path.read_text())
            skipped += 1
        else:
            detail = get(f"/sport/v3/me/activity/{aid}?metrics=ALL", token)
            raw_path.write_text(json.dumps(detail))
            time.sleep(0.3)

        points = gps_points(detail)
        date = datetime.fromtimestamp(a["start_epoch_ms"] / 1000).strftime("%Y-%m-%d")
        if points:
            write_gpx(GPX_DIR / f"{date}_{aid}.gpx", detail, points)
            with_gps += 1
        else:
            without_gps += 1
        print(f"  [{i}/{len(runs)}] {date} – {len(points)} points GPS")

    print(
        f"\nDone: {with_gps} runs with GPS, {without_gps} without GPS "
        f"(treadmill / watch without GPS), {skipped} already cached."
    )
    print(f"GPX in {GPX_DIR}")


if __name__ == "__main__":
    main()
