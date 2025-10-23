# Thin proxy so tests importing validation.rules work
try:
    from backend.validation.rules import *  # noqa
except ImportError:
    pass

