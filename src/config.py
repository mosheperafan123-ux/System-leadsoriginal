import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # Database
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///leads.db")
    
    # OpenAI
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    OPENAI_MODEL = "gpt-4o-mini"
    
    # SMTP (Email)
    SMTP_SERVER = os.getenv("SMTP_SERVER", "email-smtp.us-east-1.amazonaws.com")
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USERNAME = os.getenv("SMTP_USERNAME")
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
    EMAIL_FROM = os.getenv("EMAIL_FROM")
    
    # Scraping
    MAX_LEADS_PER_DAY = 1000
    HEADLESS_MODE = False  # Set to True in production
