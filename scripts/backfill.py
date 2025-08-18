from datetime import date, timedelta
from core.browser import BrowserManager
from core.database import db
from scrapers.scheduled_scraper import ScheduledScraper
from processors.match_processor import process_events_basic, prepare_for_database, build_details_payload
from processors.stats_processor import parse_event_statistics
import time

def ingest_day(br: BrowserManager, d: date):
    day = d.strftime("%Y-%m-%d")
    sched = ScheduledScraper(br, day).scrape()
    raw = [e for e in sched if isinstance(e, dict)]
    if not raw:
        return
    processed = process_events_basic(raw)
    data = prepare_for_database(processed)

    # 1) teams + matches
    if data.get("teams"): db.upsert_teams(data["teams"])
    ok, _ = db.batch_upsert_matches(data.get("matches") or [])
    if not ok:
        return

    # 2) detalji
    event_ids = [m.get("source_event_id") for m in (data.get("matches") or []) if m.get("source_event_id") is not None]

    details_map = {}
    for eid in event_ids:
        det = {}
        try: det["lineups"] = br.fetch_json(f"event/{eid}/lineups")
        except: det["lineups"] = None
        try: det["incidents"] = br.fetch_json(f"event/{eid}/incidents")
        except: det["incidents"] = None
        try: det["statistics"] = br.fetch_json(f"event/{eid}/statistics")
        except: det["statistics"] = None
        details_map[eid] = det
        time.sleep(0.05)

    players, managers, lineups_rows, formations, match_events = [], [], [], [], []
    for eid in event_ids:
        det = details_map.get(eid) or {}
        payload = build_details_payload(eid, det.get("lineups"), det.get("incidents"))
        players.extend(payload["players"])
        managers.extend(payload["managers"])
        lineups_rows.extend(payload["lineups"])
        formations.extend(payload["formations"])
        match_events.extend(payload["match_events"])

    # stats
    match_stats_rows, player_stats_rows = [], []
    for eid in event_ids:
        det = details_map.get(eid) or {}
        try:
            sp = parse_event_statistics(eid, det.get("statistics") or {})
            match_stats_rows.extend(sp.get("match_stats", []))
            player_stats_rows.extend(sp.get("player_stats", []))
        except:
            pass

    # mapiranja
    match_map = db.get_match_ids_by_source_ids([("sofascore", mid) for mid in event_ids if mid is not None])
    sofa_team_ids = list({r.get("sofascore_team_id") for r in formations + lineups_rows if r.get("sofascore_team_id")})
    sofa_player_ids = list({r.get("sofascore_player_id") for r in lineups_rows if r.get("sofascore_player_id")})
    team_map = db.get_team_ids_by_sofa([i for i in sofa_team_ids if i])
    player_map = db.get_player_ids_by_sofa([i for i in sofa_player_ids if i])

    # players: popuni team_id iz lineups-a
    p2t = {}
    for r in lineups_rows:
        psid = r.get("sofascore_player_id"); tsid = r.get("sofascore_team_id")
        if psid and tsid: p2t[psid] = tsid
    for p in players:
        tsid = p2t.get(p.get("sofascore_id"))
        if tsid: p["team_id"] = team_map.get(tsid)

    # managers: mapiraj team_id
    for m in managers:
        if "sofascore_team_id" in m:
            m["team_id"] = team_map.get(m.pop("sofascore_team_id"))

    # zamjene ID-jeva
    for r in lineups_rows:
        r["match_id"] = match_map.get(("sofascore", r.pop("source_event_id", None)))
        r["team_id"]  = team_map.get(r.pop("sofascore_team_id", None))
        r["player_id"] = player_map.get(r.pop("sofascore_player_id", None))

    for f in formations:
        f["match_id"] = match_map.get(("sofascore", f.pop("source_event_id", None)))
        f["team_id"]  = team_map.get(f.pop("sofascore_team_id", None))

    for e in match_events:
        e["match_id"] = match_map.get(("sofascore", e.pop("source_event_id", None)))

    for r in match_stats_rows:
        r["match_id"] = match_map.get(("sofascore", r.pop("source_event_id", None)))
        r["team_id"]  = team_map.get(r.pop("sofascore_team_id", None))

    for r in player_stats_rows:
        r["match_id"]  = match_map.get(("sofascore", r.pop("source_event_id", None)))
        r["team_id"]   = team_map.get(r.pop("sofascore_team_id", None))
        r["player_id"] = player_map.get(r.pop("sofascore_player_id", None))

    # odbaci bez FK-ova
    lineups_rows = [r for r in lineups_rows if r.get("match_id") and r.get("player_id")]
    formations   = [f for f in formations   if f.get("match_id") and f.get("team_id")]
    match_events = [e for e in match_events if e.get("match_id")]
    match_stats_rows  = [r for r in match_stats_rows  if r.get("match_id") and r.get("team_id")]
    player_stats_rows = [r for r in player_stats_rows if r.get("match_id") and r.get("player_id")]

    # upsert
    if players: db.upsert_players(players)
    if managers: db.upsert_managers(managers)
    if lineups_rows: db.upsert_lineups(lineups_rows)
    if formations:   db.upsert_formations(formations)
    if match_events: db.upsert_match_events(match_events)
    if player_stats_rows: db.upsert_player_stats(player_stats_rows)
    if match_stats_rows:  db.upsert_match_stats(match_stats_rows)

if __name__ == "__main__":
    br = BrowserManager()
    try:
        start = date.today() - timedelta(days=730)   # zadnje 2 godine
        end   = date.today() + timedelta(days=330)   # do kraja tekuće sezone
        d = start
        while d <= end:
            ingest_day(br, d)
            d += timedelta(days=1)
    finally:
        br.close()
