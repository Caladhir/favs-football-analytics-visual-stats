# scraper/supabase_client.py
from supabase import create_client
import os
from dotenv import load_dotenv
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=BASE_DIR / ".env")



SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

print("SUPABASE_URL =", SUPABASE_URL)

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
