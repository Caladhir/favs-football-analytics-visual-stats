# scraper/utils/data_validator.py - DATA VALIDATION - OPTIMIZED
from typing import Dict, Any, List
from datetime import datetime, timezone, timedelta
from utils.logger import get_logger

logger = get_logger(__name__)

class DataValidator:
    """Validacija scraped podataka"""
    
    @staticmethod
    def validate_match_data(match_data: Dict[str, Any]) -> bool:
        """Validira osnovne match podatke"""
        required_fields = ['id', 'home_team', 'away_team', 'start_time', 'status']
        
        for field in required_fields:
            if field not in match_data or match_data[field] is None:
                return False
        
        if not match_data['home_team'].strip() or not match_data['away_team'].strip():
            return False
        
        try:
            if isinstance(match_data['start_time'], (int, float)):
                start_time = datetime.fromtimestamp(match_data['start_time'], timezone.utc)
            else:
                start_time = datetime.fromisoformat(str(match_data['start_time']))
            
            now = datetime.now(timezone.utc)
            days_diff = abs((start_time - now).days)
            
            if days_diff > 365:  
                return False
                
        except (ValueError, TypeError):
            return False
        
        return True
    
    @staticmethod
    def validate_live_match(match_data: Dict[str, Any]) -> bool:
        """Dodatna validacija za live utakmice"""
        if not DataValidator.validate_match_data(match_data):
            return False
        
        status = match_data.get('status', '').lower()
        
        if status not in ['live', 'ht', 'inprogress', 'halftime']:
            return True  
        
        if isinstance(match_data['start_time'], (int, float)):
            start_time = datetime.fromtimestamp(match_data['start_time'], timezone.utc)
        else:
            start_time = datetime.fromisoformat(str(match_data['start_time']))
        
        now = datetime.now(timezone.utc)
        hours_elapsed = (now - start_time).total_seconds() / 3600
        
        if hours_elapsed > 3:  
            return False
        
        if hours_elapsed < -0.25:  
            return False
        
        return True
    
    @staticmethod
    def validate_competition_data(comp_data: Dict[str, Any]) -> bool:
        """Validira competition podatke"""
        if not comp_data.get('name'):
            return False
        
        if not comp_data.get('id'):
            return False
        
        return True
    
    @staticmethod
    def filter_valid_matches(matches: List[Dict[str, Any]], strict: bool = False) -> List[Dict[str, Any]]:
        """Filtriraj samo valjane utakmice - OPTIMIZED LOGGING"""
        valid_matches = []
        invalid_count = 0
        error_reasons = {}
        
        for match in matches:
            if strict:
                is_valid = DataValidator.validate_live_match(match)
            else:
                is_valid = DataValidator.validate_match_data(match)
            
            if is_valid:
                valid_matches.append(match)
            else:
                invalid_count += 1
                
                if invalid_count <= 5:  
                    reason = "unknown"
                    if 'status' not in match:
                        reason = "missing_status"
                    elif not match.get('home_team'):
                        reason = "missing_home_team"
                    elif not match.get('away_team'):
                        reason = "missing_away_team"
                    
                    error_reasons[reason] = error_reasons.get(reason, 0) + 1
        
        if invalid_count > 0:
            logger.warning(f"Filtered out {invalid_count} invalid matches")
            
            if error_reasons:
                logger.warning(f"Main error reasons: {dict(error_reasons)}")
                
            if invalid_count > 50:
                logger.warning(f"Too many validation errors ({invalid_count}), check data format")
        
        logger.info(f"Validated {len(valid_matches)}/{len(matches)} matches")
        return valid_matches

validator = DataValidator()