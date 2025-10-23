"""
Database Schema
SQLAlchemy models for database tables
"""

from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import os

from persistence.database import Base

# Use String for UUID in SQLite, UUID in PostgreSQL
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./finmodai.db")
if "sqlite" in DATABASE_URL.lower():
    UUID_TYPE = String(36)
else:
    from sqlalchemy.dialects.postgresql import UUID

    UUID_TYPE = UUID(as_uuid=True)


class User(Base):
    """User model"""

    __tablename__ = "users"

    id = Column(UUID_TYPE, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    email_hash = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)
    name = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    model_runs = relationship("ModelRun", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<User(id={self.id}, email={self.email})>"


class ModelRun(Base):
    """Model run model"""

    __tablename__ = "model_runs"

    id = Column(UUID_TYPE, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(UUID_TYPE, ForeignKey("users.id"), nullable=False, index=True)
    model_type = Column(String(50), nullable=False, index=True)
    ticker = Column(String(10), nullable=False, index=True)
    target = Column(String(10), nullable=True)  # for merger models
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    as_of_quotes = Column(DateTime, nullable=True)
    as_of_fundamentals = Column(DateTime, nullable=True)
    stale = Column(Boolean, default=False, nullable=False)
    results_json = Column(Text, nullable=True)  # JSON stored as text in SQLite
    inputs_json = Column(Text, nullable=True)  # JSON stored as text in SQLite
    provenance_json = Column(Text, nullable=True)  # JSON stored as text in SQLite
    custom_assumptions = Column(Text, nullable=True)  # JSON stored as text in SQLite
    deleted_at = Column(DateTime, nullable=True)  # soft delete

    # Relationships
    user = relationship("User", back_populates="model_runs")
    files = relationship("File", back_populates="model_run", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<ModelRun(id={self.id}, model_type={self.model_type}, ticker={self.ticker})>"


class File(Base):
    """File model for generated exports"""

    __tablename__ = "files"

    id = Column(UUID_TYPE, primary_key=True, default=lambda: str(uuid.uuid4()))
    model_id = Column(UUID_TYPE, ForeignKey("model_runs.id"), nullable=False, index=True)
    kind = Column(String(10), nullable=False)  # 'xlsx' or 'pdf'
    path = Column(String(500), nullable=False)
    size = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    model_run = relationship("ModelRun", back_populates="files")

    def __repr__(self):
        return f"<File(id={self.id}, kind={self.kind}, path={self.path})>"
