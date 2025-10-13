"""
Formula registry system for UI introspection and documentation.

This module provides a central catalog of all financial formulas,
allowing dynamic discovery and description for UI builders.
"""

from typing import Callable, Dict, Any, List, Optional
import inspect


# Global registry
_REGISTRY: Dict[str, Dict[str, Any]] = {}


def register(name: str = None, category: str = "general", description: str = None):
    """
    Decorator to register a formula in the global registry.
    
    Args:
        name: Formula name (default: use function name)
        category: Category for grouping (e.g., "timevalue", "valuation")
        description: Short description (default: use first line of docstring)
    
    Example:
        @register(name="npv", category="timevalue")
        def npv(rate, cash_flows):
            '''Calculate Net Present Value'''
            ...
    """
    def decorator(func: Callable):
        # Use function name if name not provided
        formula_name = name if name is not None else func.__name__
        
        # Extract description from docstring if not provided
        docstring = inspect.getdoc(func) or ''
        if description:
            desc = description
        else:
            # Use first line of docstring
            desc = docstring.split('\n')[0] if docstring else ''
        
        # Register the formula
        _REGISTRY[formula_name] = {
            'callable': func,
            'signature': str(inspect.signature(func)),
            'docstring': docstring,
            'description': desc,
            'category': category,
            'module': func.__module__,
            'name': formula_name
        }
        
        return func
    
    return decorator


def get_formula(name: str) -> Callable:
    """
    Retrieve a formula function by name.
    
    Args:
        name: Formula name
    
    Returns:
        The callable function
    
    Raises:
        KeyError: If formula not found
    
    Example:
        >>> npv_func = get_formula('npv')
        >>> result = npv_func(0.10, [-100, 50, 60])
    """
    if name not in _REGISTRY:
        available = ', '.join(list_formulas())
        raise KeyError(
            f"Formula '{name}' not found in registry. "
            f"Available formulas: {available}"
        )
    
    return _REGISTRY[name]['callable']


def list_formulas(category: Optional[str] = None) -> List[str]:
    """
    List all registered formula names.
    
    Args:
        category: Optional category filter
    
    Returns:
        List of formula names
    
    Example:
        >>> list_formulas()
        ['npv', 'irr', 'xirr', 'wacc', ...]
        >>> list_formulas(category='timevalue')
        ['npv', 'irr', 'xirr', 'mirr']
    """
    if category is None:
        return sorted(_REGISTRY.keys())
    
    return sorted([
        name for name, meta in _REGISTRY.items()
        if meta['category'] == category
    ])


def describe(name: str) -> Dict[str, Any]:
    """
    Get full metadata about a formula.
    
    Args:
        name: Formula name
    
    Returns:
        Dictionary with formula metadata (signature, docstring, category, etc.)
    
    Raises:
        KeyError: If formula not found
    
    Example:
        >>> meta = describe('npv')
        >>> print(meta['signature'])
        (rate: float, cash_flows: CashFlows) -> float
        >>> print(meta['description'])
        Calculate Net Present Value
    """
    if name not in _REGISTRY:
        raise KeyError(f"Formula '{name}' not found in registry")
    
    return _REGISTRY[name].copy()


def list_categories() -> List[str]:
    """
    Get all formula categories.
    
    Returns:
        Sorted list of unique categories
    
    Example:
        >>> list_categories()
        ['debt', 'equity', 'returns', 'stats', 'timevalue', 'valuation', 'wacc']
    """
    categories = set(meta['category'] for meta in _REGISTRY.values())
    return sorted(categories)


def get_formulas_by_category() -> Dict[str, List[str]]:
    """
    Get formulas grouped by category.
    
    Returns:
        Dictionary mapping category to list of formula names
    
    Example:
        >>> formulas = get_formulas_by_category()
        >>> formulas['timevalue']
        ['npv', 'irr', 'xirr', 'mirr', 'pv_annuity', 'fv_annuity']
    """
    result = {}
    
    for name, meta in _REGISTRY.items():
        category = meta['category']
        if category not in result:
            result[category] = []
        result[category].append(name)
    
    # Sort formula names within each category
    for category in result:
        result[category].sort()
    
    return result


def search(query: str) -> List[Dict[str, Any]]:
    """
    Search formulas by name or description.
    
    Args:
        query: Search term (case-insensitive)
    
    Returns:
        List of matching formula metadata dictionaries
    
    Example:
        >>> results = search('irr')
        >>> [r['name'] for r in results]
        ['irr', 'xirr', 'mirr']
    """
    query_lower = query.lower()
    results = []
    
    for name, meta in _REGISTRY.items():
        # Search in name, description, and docstring
        if (query_lower in name.lower() or
            query_lower in meta['description'].lower() or
            query_lower in meta['docstring'].lower()):
            results.append(meta.copy())
    
    return results


def generate_reference() -> str:
    """
    Generate a formatted reference of all formulas.
    
    Returns:
        Multi-line string with formatted formula reference
    
    Example:
        >>> print(generate_reference())
        FinMath Formula Reference
        =========================
        
        TIME VALUE
        ----------
        npv(rate, cash_flows)
          Calculate Net Present Value
        ...
    """
    lines = ["FinMath Formula Reference", "=" * 50, ""]
    
    formulas_by_cat = get_formulas_by_category()
    
    for category in sorted(formulas_by_cat.keys()):
        lines.append(f"\n{category.upper()}")
        lines.append("-" * 50)
        
        for formula_name in formulas_by_cat[category]:
            meta = _REGISTRY[formula_name]
            lines.append(f"\n{formula_name}{meta['signature']}")
            lines.append(f"  {meta['description']}")
    
    return "\n".join(lines)


def export_json() -> Dict[str, Any]:
    """
    Export registry as JSON-serializable dictionary.
    
    Useful for API endpoints or documentation generation.
    
    Returns:
        Dictionary with all formulas (callables removed)
    """
    export = {}
    
    for name, meta in _REGISTRY.items():
        export[name] = {
            'name': meta['name'],
            'signature': meta['signature'],
            'description': meta['description'],
            'category': meta['category'],
            'module': meta['module'],
            'docstring': meta['docstring']
        }
    
    return export


# Auto-registration helper
def auto_register_module(module, category: str):
    """
    Automatically register all public functions from a module.
    
    Args:
        module: Module object to scan
        category: Category to assign to all functions
    
    Example:
        import finmath.timevalue as tv
        auto_register_module(tv, 'timevalue')
    """
    for name in dir(module):
        # Skip private functions and imports
        if name.startswith('_'):
            continue
        
        obj = getattr(module, name)
        
        # Only register callable functions defined in this module
        if callable(obj) and hasattr(obj, '__module__') and \
           module.__name__ in obj.__module__:
            # Register it
            register(name=name, category=category)(obj)


def clear_registry():
    """Clear all registered formulas. Mainly for testing."""
    global _REGISTRY
    _REGISTRY = {}

