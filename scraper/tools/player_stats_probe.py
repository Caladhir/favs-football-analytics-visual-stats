# scraper/tools/player_stats_probe.py
"""Ad hoc alat za ispis raw SofaScore player statistics endpoint podataka.

Koristenje:
  python -m scraper.tools.player_stats_probe --event 14025068 --player 555386
  (mozes dodati vise --player parametara)

Svrha: Brzo vidjeti sto endpoint vraca (statistics sekcija) prije nego mapiramo
u player_stats tablicu. Ne dira bazu.
"""
from __future__ import annotations
import argparse, json, sys, time
from typing import Any, Dict, Optional, List
import requests

HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.sofascore.com/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}

# --- Helpers from user snippet ---

def extract_player_statistics(api_response: Dict[str, Any]) -> Dict[str, Any]:
    return api_response.get('statistics', {}) or {}

def get_player_stats_from_api(event_id: int, player_id: int) -> Optional[Dict[str, Any]]:
    url = f"https://www.sofascore.com/api/v1/event/{event_id}/player/{player_id}/statistics"
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        r.raise_for_status()
        data = r.json()
        return extract_player_statistics(data)
    except Exception as e:
        print(f"[ERR] fetch fail ev={event_id} pid={player_id}: {e}")
        return None

def process_statistics_for_database(stats: Dict[str, Any]) -> Dict[str, Any]:
    processed: Dict[str, Any] = {}
    field_mapping = {
        'totalPass': 'total_passes',
        'accuratePass': 'accurate_passes',
        'goalAssist': 'assists',
        'onTargetScoringAttempt': 'shots_on_target',
        'blockedScoringAttempt': 'blocked_shots',
        'interceptionWon': 'interceptions',
        'totalTackle': 'tackles',
        'wasFouled': 'was_fouled',
        'fouls': 'fouls_committed',
        'minutesPlayed': 'minutes_played',
        'touches': 'touches',
        'rating': 'rating',
        'possessionLostCtrl': 'possession_lost',
        'expectedGoals': 'xg',
        'expectedAssists': 'xa',
        'aerialWon': 'aerials_won',
        'duelWon': 'duels_won',
        'duelLost': 'duels_lost'
    }
    for sofa_field, db_field in field_mapping.items():
        if sofa_field in stats:
            val = stats[sofa_field]
            if isinstance(val, (int, float)):
                processed[db_field] = float(val)
            else:
                # attempt cast
                try:
                    processed[db_field] = float(val) if val not in (None, '') else None
                except Exception:
                    processed[db_field] = val
    if 'ratingVersions' in stats:
        rv = stats['ratingVersions'] or {}
        processed['rating_original'] = rv.get('original')
        processed['rating_alternative'] = rv.get('alternative')
    return processed

# Pretty print helper

def _pp(d: Dict[str, Any]) -> str:
    return json.dumps(d, ensure_ascii=False, separators=(',', ':'))

# --- Main CLI ---

def main():
    ap = argparse.ArgumentParser(description="Probe SofaScore per-player statistics endpoint")
    ap.add_argument('--event', type=int, required=True, help='Event (match) ID')
    ap.add_argument('--player', type=int, action='append', required=True, help='Player ID (repeatable)')
    ap.add_argument('--sleep', type=float, default=0.4, help='Delay between calls (s)')
    ap.add_argument('--raw', action='store_true', help='Only print raw statistics dict (no processed mapping)')
    args = ap.parse_args()

    print(f"=== PLAYER STATS PROBE | event={args.event} players={','.join(str(p) for p in args.player)} ===")
    for pid in args.player:
        stats = get_player_stats_from_api(args.event, pid)
        if stats is None:
            print(f"pid={pid} -> (no data)")
            continue
        print(f"\nPID {pid} RAW:")
        print(_pp(stats))
        if not args.raw:
            processed = process_statistics_for_database(stats)
            print("PROCESSED MAPPING:")
            print(_pp(processed))
        if args.sleep:
            time.sleep(args.sleep)

if __name__ == '__main__':
    main()
