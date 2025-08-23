# scraper/tools/data_analysis.py - DATA ANALYSIS TOOL
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta
from collections import Counter

# Add scraper to path
sys.path.append(str(Path(__file__).parent.parent))

from core.database import db
from core.config import config
from utils.logger import get_logger

logger = get_logger(__name__)

class DataAnalyzer:
    """Analyze scraped data for insights and issues"""
    
    def __init__(self):
        self.stats = {}
    
    def analyze_match_distribution(self):
        """Analyze match distribution by status, competition, etc."""
        logger.info("📊 Analyzing match distribution...")
        
        try:
            # Total matches
            total_result = db.client.table("matches").select("count", count="exact").execute()
            total_matches = total_result.count if hasattr(total_result, 'count') else 0
            
            # Matches by status
            statuses = ['live', 'ht', 'upcoming', 'finished', 'canceled', 'postponed']
            status_counts = {}
            
            for status in statuses:
                count_result = db.client.table("matches").select("count", count="exact").eq("status", status).execute()
                status_counts[status] = count_result.count if hasattr(count_result, 'count') else 0
            
            # Get detailed data for analysis
            matches = db.client.table("matches").select(
                "competition", "status", "start_time", "updated_at", "source"
            ).limit(1000).execute()
            
            print("\n📊 MATCH DISTRIBUTION ANALYSIS")
            print("="*50)
            print(f"Total matches in database: {total_matches:,}")
            print("\nBy status:")
            for status, count in status_counts.items():
                print(f"  {status}: {count}")
            
            # Competition analysis
            competitions = [match['competition'] for match in matches.data if match.get('competition')]
            comp_counter = Counter(competitions)
            
            print(f"\nTop 10 competitions by match count:")
            for comp, count in comp_counter.most_common(10):
                print(f"  {comp}: {count}")
            
            # Source analysis
            sources = [match['source'] for match in matches.data if match.get('source')]
            source_counter = Counter(sources)
            
            print(f"\nBy source:")
            for source, count in source_counter.items():
                print(f"  {source}: {count}")
            
            self.stats['total_matches'] = total_matches
            self.stats['status_distribution'] = status_counts
            
        except Exception as e:
            logger.error(f"❌ Match distribution analysis failed: {e}")
    
    def analyze_data_quality(self):
        """Analyze data quality issues"""
        logger.info("🔍 Analyzing data quality...")
        
        try:
            print("\n🔍 DATA QUALITY ANALYSIS")
            print("="*50)
            
            # Check for missing fields
            matches = db.client.table("matches").select(
                "id", "home_team", "away_team", "competition", "start_time", "status"
            ).limit(1000).execute()
            
            quality_issues = {
                'missing_home_team': 0,
                'missing_away_team': 0,
                'missing_competition': 0,
                'missing_start_time': 0,
                'invalid_status': 0
            }
            
            valid_statuses = set(config.STATUS_MAPPING.values()) | set(config.STATUS_MAPPING.keys())
            
            for match in matches.data:
                if not match.get('home_team'):
                    quality_issues['missing_home_team'] += 1
                if not match.get('away_team'):
                    quality_issues['missing_away_team'] += 1
                if not match.get('competition'):
                    quality_issues['missing_competition'] += 1
                if not match.get('start_time'):
                    quality_issues['missing_start_time'] += 1
                if match.get('status') not in valid_statuses:
                    quality_issues['invalid_status'] += 1
            
            total_checked = len(matches.data)
            
            print(f"Checked {total_checked:,} matches for quality issues:")
            for issue, count in quality_issues.items():
                print(f"  {issue}: {count}")
            
            # Check for duplicates
            print(f"\n🔍 Checking for duplicates...")
            
            # This is a simplified check - in real scenario you'd need more complex logic
            all_matches = db.client.table("matches").select(
                "home_team", "away_team", "start_time"
            ).limit(5000).execute()
            
            match_signatures = []
            for match in all_matches.data:
                sig = f"{match['home_team']}|{match['away_team']}|{match['start_time']}"
                match_signatures.append(sig)
            
            signature_counter = Counter(match_signatures)
            duplicates = {sig: count for sig, count in signature_counter.items() if count > 1}
            
            if duplicates:
                print(f"Found {len(duplicates)} duplicate groups.")
            else:
                print("No duplicates found.")
            
            self.stats['quality_issues'] = quality_issues
            self.stats['duplicates'] = len(duplicates)
            
        except Exception as e:
            logger.error(f"❌ Data quality analysis failed: {e}")
    
    def analyze_update_patterns(self):
        """Analyze data update patterns"""
        logger.info("📈 Analyzing update patterns...")
        
        try:
            print("\n📈 UPDATE PATTERN ANALYSIS")
            print("="*50)
            
            now = datetime.now(timezone.utc)
            
            # Recent updates
            recent_updates = db.client.table("matches").select(
                "updated_at", "status"
            ).gte("updated_at", (now - timedelta(hours=1)).isoformat()).execute()
            
            print(f"Updates in last hour: {len(recent_updates.data)}")
            
            # Group by time buckets
            time_buckets = {}
            for match in recent_updates.data:
                if match.get('updated_at'):
                    update_time = datetime.fromisoformat(match['updated_at'].replace('Z', '+00:00'))
                    bucket = update_time.strftime('%H:%M')  # Hour:minute bucket
                    time_buckets[bucket] = time_buckets.get(bucket, 0) + 1
            
            if time_buckets:
                print(f"Update distribution (last hour):")
                sorted_buckets = sorted(time_buckets.items())
                for time_bucket, count in sorted_buckets[-10:]:  # Last 10 time buckets
                    print(f"  {time_bucket}: {count} updates")
            
            # Live match updates
            live_updates = [m for m in recent_updates.data if m.get('status') in ['live', 'ht']]
            print(f"Live match updates in last hour: {len(live_updates)}")
            
            # Data age analysis
            print(f"\n⏰ Data age analysis:")
            
            oldest_live = db.client.table("matches").select(
                "start_time", "home_team", "away_team"
            ).in_("status", ["live", "ht"]).order("start_time", ascending=True).limit(5).execute()
            
            if oldest_live.data:
                print(f"Oldest live matches:")
                for match in oldest_live.data:
                    start_time = datetime.fromisoformat(match['start_time'].replace('Z', '+00:00'))
                    hours_old = (now - start_time).total_seconds() / 3600
                    print(f"  {match['home_team']} vs {match['away_team']}: {hours_old:.1f}h old")
            
            self.stats['recent_updates'] = len(recent_updates.data)
            self.stats['live_updates'] = len(live_updates)
            
        except Exception as e:
            logger.error(f"❌ Update pattern analysis failed: {e}")
    
    def generate_report(self):
        """Generate comprehensive data analysis report"""
        print("\n" + "="*60)
        print("📋 COMPREHENSIVE DATA ANALYSIS REPORT")
        print("="*60)
        print(f"Generated at: {datetime.now().isoformat()}")
        print(f"Analysis based on database: {config.SUPABASE_URL}")
        
        if self.stats:
            print(f"\n📊 KEY METRICS:")
            print(f"  Total matches: {self.stats.get('total_matches', 'N/A'):,}")
            print(f"  Recent updates: {self.stats.get('recent_updates', 'N/A')}")
            print(f"  Live updates: {self.stats.get('live_updates', 'N/A')}")
            print(f"  Quality issues: {sum(self.stats.get('quality_issues', {}).values())}")
            print(f"  Duplicates: {self.stats.get('duplicates', 'N/A')}")
        
        print("\n" + "="*60)
    
    def run_full_analysis(self):
        """Run all analysis methods"""
        logger.info("🚀 Starting comprehensive data analysis...")
        
        self.analyze_match_distribution()
        self.analyze_data_quality()
        self.analyze_update_patterns()
        self.generate_report()
        
        logger.info("✅ Data analysis completed")

def main():
    """Main data analysis function"""
    analyzer = DataAnalyzer()
    analyzer.run_full_analysis()

if __name__ == "__main__":
    main()