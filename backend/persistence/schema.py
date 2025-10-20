"""
Database Schema
SQLAlchemy models for database tables
"""

from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from persistence.database import Base


class User(Base):
    """User model"""
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
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
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    model_type = Column(String(50), nullable=False, index=True)
    ticker = Column(String(10), nullable=False, index=True)
    target = Column(String(10), nullable=True)  # for merger models
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    as_of_quotes = Column(DateTime, nullable=True)
    as_of_fundamentals = Column(DateTime, nullable=True)
    stale = Column(Boolean, default=False, nullable=False)
    results_json = Column(JSONB, nullable=True)
    inputs_json = Column(JSONB, nullable=True)
    provenance_json = Column(JSONB, nullable=True)
    custom_assumptions = Column(JSONB, nullable=True)
    deleted_at = Column(DateTime, nullable=True)  # soft delete
    
    # Relationships
    user = relationship("User", back_populates="model_runs")
    files = relationship("File", back_populates="model_run", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<ModelRun(id={self.id}, model_type={self.model_type}, ticker={self.ticker})>"


class File(Base):
    """File model for generated exports"""
    __tablename__ = "files"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    model_id = Column(UUID(as_uuid=True), ForeignKey("model_runs.id"), nullable=False, index=True)
    kind = Column(String(10), nullable=False)  # 'xlsx' or 'pdf'
    path = Column(String(500), nullable=False)
    size = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    model_run = relationship("ModelRun", back_populates="files")
    
    def __repr__(self):
        return f"<File(id={self.id}, kind={self.kind}, path={self.path})>"

