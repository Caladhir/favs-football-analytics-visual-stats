# scraper/fetch_loop.py
from __future__ import annotations

import time
import sys
import signal
from datetime import datetime, timezone
from typing import List, Dict, Any, Tuple

try:
    from tqdm import tqdm
    HAS_TQDM = True
except ImportError:
    HAS_TQDM = False

from core.database import db
from core.browser import BrowserManager
from scrapers.live_scraper import LiveScraper
from scrapers.scheduled_scraper import ScheduledScraper
from processors import process_events_with_teams, prepare_for_database
from utils.logger import get_logger

logger = get_logger(__name__)


class ContinuousScraper:
    def __init__(self):
        self.browser: BrowserManager | None = None
        self.running = True
        self.stats = {
            "total_runs": 0,
            "successful_runs": 0,
            "failed_runs": 0,
            "total_matches_processed": 0,
            "total_teams_processed": 0,
            "current_live_count": 0,
        }
        signal.signal(signal.SIGINT, self._sig)
        signal.signal(signal.SIGTERM, self._sig)

    def _sig(self, *_):
        print("\n🛑 Stopping scraper gracefully...")
        self.running = False

    def _get_adaptive_interval(self, live_count: int, consecutive_failures: int) -> int:
        if live_count > 50:
            base = 10
        elif live_count > 20:
            base = 15
        elif live_count > 5:
            base = 20
        elif live_count > 0:
            base = 25
        else:
            base = 45
        return min(base + consecutive_failures * 5, 60)

    def _setup(self) -> bool:
        try:
            if not db.health_check():
                logger.error("❌ Database health check failed")
                return False
            if not self.browser:
                self.browser = BrowserManager()  # kreiraj svježe
            return True
        except Exception as e:
            logger.error(f"❌ Setup failed: {e}")
            # ako je browser napola srušen, prisilno ga poništi
            try:
                if self.browser:
                    self.browser.close()
            except Exception:
                pass
            self.browser = None
            return False


    def _cleanup_old(self):
        try:
            if self.stats["total_runs"] % 10 == 0:
                db.cleanup_zombie_matches(hours_old=3)
        except Exception as e:
            logger.warning(f"Cleanup failed: {e}")

    def _fetch(self) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        try:
            live = LiveScraper(self.browser).scrape()
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            sched = ScheduledScraper(self.browser, today).scrape()
            return live, sched
        except Exception as e:
            logger.error(f"❌ Fetch failed: {e}")
            return [], []

    def _process(self, live, sched) -> Dict[str, List[Dict[str, Any]]]:
        raw = [e for e in (live + sched) if isinstance(e, dict)]
        if not raw:
            return {"matches": [], "teams": []}
        processed = process_events_with_teams(raw)
        return prepare_for_database(processed)

    def _store(self, data: Dict[str, Any]) -> Tuple[int, int]:
        teams = data.get("teams") or []
        if teams:
            try:
                ok, fail = db.upsert_teams(teams)
                self.stats["total_teams_processed"] += ok
                if ok:
                    print(f"🏠 {ok} teams processed")
                if fail:
                    print(f"⚠️ {fail} teams failed")
            except Exception as e:
                logger.warning(f"Team storage failed: {e}")

        matches = data.get("matches") or []
        if not matches:
            return 0, 0

        try:
            ok, fail = db.batch_upsert_matches(matches)
            if ok:
                print(f"💾 {ok} matches stored successfully")
            if fail:
                print(f"❌ {fail} matches failed to store")
            self.stats["total_matches_processed"] += ok
            return ok, fail
        except Exception as e:
            logger.error(f"❌ Match storage failed: {e}")
            return 0, len(matches)

    def run_single_cycle(self) -> bool:
        t0 = time.time()
        try:
            if not self._setup():
                return False
            self._cleanup_old()
            live, sched = self._fetch()
            data = self._process(live, sched)

            if not data.get("matches"):
                logger.warning("⚠️ No matches processed")
                return False

            ok, fail = self._store(data)

            total = len(data.get("matches", []))
            sr = (ok / total) * 100 if total else 0.0
            self.stats["current_live_count"] = len(live)

            if sr < 70:
                logger.warning(f"⚠️ Low success rate ({sr:.1f}%)!")
                return False

            elapsed = time.time() - t0
            print(
                f"✅ Cycle #{self.stats['total_runs'] + 1}: "
                f"{'🔴 ' + str(len(live)) + ' live' if live else '⚫ no live'}, "
                f"{len(sched)} scheduled, "
                f"{len(data.get('teams', []))} teams → {ok}/{total} stored "
                f"({sr:.1f}%, {elapsed:.1f}s)"
            )
            return True
        except Exception as e:
            logger.error(f"❌ Cycle failed: {e}")
            import traceback
            traceback.print_exc()
            # 🆕 hard reset browsera – ponekad je najbrže riješiti invalid session
            try:
                if self.browser:
                    self.browser.close()
            except Exception:
                pass
            self.browser = None
            return False

    def run_continuous(self, base_interval: int = 30):
        print("🚀 Starting Clean Football Scraper...")
        print("⏰ Adaptive intervals: 10s-60s based on live matches")
        print("🔴 More live matches = faster refresh")
        print("🏠 Automatic team creation and linking")
        print("📊 Source tracking with SofaScore IDs")
        print("=" * 60)

        fails = 0
        MAX_FAILS = 5

        try:
            while self.running:
                self.stats["total_runs"] += 1

                if fails >= MAX_FAILS:
                    print(f"⚠️ Too many failures ({fails}), pausing 2 minutes...")
                    time.sleep(120)
                    fails = 0

                print(f"🔄 Cycle #{self.stats['total_runs']}...")
                ok = self.run_single_cycle()

                if ok:
                    self.stats["successful_runs"] += 1
                    fails = 0
                else:
                    self.stats["failed_runs"] += 1
                    fails += 1

                if not self.running:
                    break

                live_cnt = self.stats["current_live_count"]
                interval = self._get_adaptive_interval(live_cnt, fails)
                mode = "🚨 HIGH-LOAD" if live_cnt > 20 else ("🔴 FAST" if live_cnt > 0 else "⚫ IDLE")
                print(f"{mode}: {live_cnt} live → {interval}s interval")

                if self.stats["total_runs"] % 5 == 0:
                    overall = (self.stats["successful_runs"] / self.stats["total_runs"]) * 100
                    print(
                        f"📊 Overall: {overall:.1f}% success, "
                        f"{self.stats['total_matches_processed']} matches, "
                        f"{self.stats['total_teams_processed']} teams"
                    )

                if HAS_TQDM:
                    for _ in tqdm(range(interval), desc="Next cycle", unit="s"):
                        if not self.running:
                            break
                        time.sleep(1)
                else:
                    for _ in range(interval):
                        if not self.running:
                            break
                        time.sleep(1)

        except KeyboardInterrupt:
            print("\n🛑 Scraper stopped by user")
        finally:
            self._cleanup()

    def _cleanup(self):
        print("\n🧹 Cleaning up resources...")
        try:
            if self.browser:
                self.browser.close()
        except Exception as e:
            logger.warning(f"Browser cleanup failed: {e}")

        print("\n" + "=" * 50)
        print("📊 SCRAPER STATISTICS")
        print("=" * 50)
        print(f"Total Cycles: {self.stats['total_runs']}")
        print(f"Successful: {self.stats['successful_runs']}")
        print(f"Failed: {self.stats['failed_runs']}")
        if self.stats["total_runs"] > 0:
            rate = (self.stats["successful_runs"] / self.stats["total_runs"]) * 100
            print(f"Success Rate: {rate:.1f}%")
        print(f"Total Matches: {self.stats['total_matches_processed']:,}")
        print(f"Total Teams: {self.stats['total_teams_processed']:,}")
        print("=" * 50)
        print("🚀 Clean scraper stopped gracefully!")


def main():
    try:
        ContinuousScraper().run_continuous(base_interval=30)
    except Exception as e:
        print(f"❌ CRITICAL ERROR: {e}")
        logger.error(f"Critical failure: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
