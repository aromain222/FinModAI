"""
Authentication Module
JWT-based authentication with password hashing
"""

from .jwt import create_access_token, verify_token
from .hashing import hash_password, verify_password
from .models import User

__all__ = [
    "create_access_token",
    "verify_token",
    "hash_password",
    "verify_password",
    "User",
]

