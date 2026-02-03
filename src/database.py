from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean, Text, Float
from sqlalchemy.orm import declarative_base, sessionmaker

from src.config import Config

Base = declarative_base()

class Lead(Base):
    __tablename__ = 'leads'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Datos del Negocio
    business_name = Column(String, nullable=False)
    category = Column(String)
    address = Column(String)
    city = Column(String)
    phone = Column(String)
    website = Column(String)
    rating = Column(Float)
    reviews_count = Column(Integer)
    
    # Datos de Contacto
    email = Column(String, index=True)
    instagram_handle = Column(String)
    
    # Estado del Sistema
    extraction_date = Column(DateTime, default=datetime.utcnow)
    extraction_source = Column(String, default='google_maps')
    
    # Estado de Contacto
    email_sent = Column(Boolean, default=False)
    email_sent_at = Column(DateTime, nullable=True)
    whatsapp_sent = Column(Boolean, default=False)
    whatsapp_sent_at = Column(DateTime, nullable=True)
    instagram_sent = Column(Boolean, default=False)
    
    # Contenido Generado
    ai_personalized_message = Column(Text, nullable=True)
    
    def __repr__(self):
        return f"<Lead(name='{self.business_name}', email='{self.email}')>"

# Setup Database
engine = create_engine(Config.DATABASE_URL)

def init_db():
    Base.metadata.create_all(engine)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
