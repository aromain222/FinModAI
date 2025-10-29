#!/usr/bin/env python3
"""
Deployment optimizations for free hosting platforms
Provides configuration and optimizations for different deployment environments
"""

import os
import logging
import platform
import threading
import time
from typing import Dict, Any, Optional, List
import json
from pathlib import Path

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("deployment_optimizations")

# Constants
DEPLOYMENT_ENVIRONMENTS = ["local", "railway", "vercel", "netlify", "heroku", "koyeb", "cyclic", "pythonanywhere", "gcp", "aws", "oracle"]

class DeploymentOptimizer:
    """
    Optimizes application settings based on deployment environment
    Handles environment-specific configurations and limitations
    """
    
    def __init__(self):
        """Initialize the deployment optimizer"""
        self.env = self._detect_environment()
        self.settings = self._load_settings()
        self.stats = {
            "startup_optimizations": 0,
            "runtime_optimizations": 0,
            "memory_optimizations": 0,
            "network_optimizations": 0
        }
        
        # Apply startup optimizations
        self.apply_startup_optimizations()
    
    def _detect_environment(self) -> str:
        """
        Detect the current deployment environment
        
        Returns:
            String identifying the deployment environment
        """
        # Check environment variables for common deployment platforms
        if os.environ.get("RAILWAY_STATIC_URL"):
            return "railway"
        elif os.environ.get("VERCEL"):
            return "vercel"
        elif os.environ.get("NETLIFY"):
            return "netlify"
        elif os.environ.get("HEROKU_APP_ID"):
            return "heroku"
        elif os.environ.get("KOYEB_APP_NAME"):
            return "koyeb"
        elif os.environ.get("CYCLIC_APP_ID"):
            return "cyclic"
        elif os.environ.get("PYTHONANYWHERE_DOMAIN"):
            return "pythonanywhere"
        elif os.environ.get("GOOGLE_CLOUD_PROJECT"):
            return "gcp"
        elif os.environ.get("AWS_EXECUTION_ENV"):
            return "aws"
        elif os.environ.get("OCI_RESOURCE_PRINCIPAL_VERSION"):
            return "oracle"
        
        # If no specific environment detected, assume local
        return "local"
    
    def _load_settings(self) -> Dict[str, Any]:
        """
        Load environment-specific settings
        
        Returns:
            Dictionary of settings for the current environment
        """
        # Default settings
        settings = {
            "cache_ttl": 3600,  # 1 hour
            "max_workers": 2,
            "preload_data": True,
            "use_compression": True,
            "memory_limit_mb": 512,
            "request_timeout": 10,
            "max_retries": 3,
            "use_ai_fallback": True,
            "stale_data_threshold": 3600,  # 1 hour
            "max_connections": 10
        }
        
        # Environment-specific overrides
        env_settings = {
            "railway": {
                "cache_ttl": 7200,  # 2 hours
                "max_workers": 2,
                "preload_data": True,
                "memory_limit_mb": 400
            },
            "vercel": {
                "cache_ttl": 3600,
                "max_workers": 1,
                "preload_data": False,  # Serverless, no preloading
                "request_timeout": 8,  # Lower timeout for serverless
                "memory_limit_mb": 256
            },
            "netlify": {
                "cache_ttl": 3600,
                "max_workers": 1,
                "preload_data": False,  # Serverless, no preloading
                "request_timeout": 8,
                "memory_limit_mb": 256
            },
            "heroku": {
                "cache_ttl": 7200,
                "max_workers": 2,
                "preload_data": True,
                "memory_limit_mb": 450
            },
            "koyeb": {
                "cache_ttl": 7200,
                "max_workers": 2,
                "preload_data": True,
                "memory_limit_mb": 400
            },
            "cyclic": {
                "cache_ttl": 3600,
                "max_workers": 1,
                "preload_data": False,  # Serverless, no preloading
                "request_timeout": 8,
                "memory_limit_mb": 256
            },
            "pythonanywhere": {
                "cache_ttl": 14400,  # 4 hours
                "max_workers": 1,
                "preload_data": True,
                "memory_limit_mb": 256,
                "max_connections": 5
            },
            "gcp": {
                "cache_ttl": 3600,
                "max_workers": 2,
                "preload_data": True,
                "memory_limit_mb": 512
            },
            "aws": {
                "cache_ttl": 3600,
                "max_workers": 2,
                "preload_data": True,
                "memory_limit_mb": 512
            },
            "oracle": {
                "cache_ttl": 3600,
                "max_workers": 4,
                "preload_data": True,
                "memory_limit_mb": 1024
            }
        }
        
        # Apply environment-specific settings
        if self.env in env_settings:
            settings.update(env_settings[self.env])
        
        # Apply custom overrides from environment variables
        if os.environ.get("CUSTOM_CACHE_TTL"):
            try:
                settings["cache_ttl"] = int(os.environ.get("CUSTOM_CACHE_TTL"))
            except (ValueError, TypeError):
                pass
        
        if os.environ.get("CUSTOM_MAX_WORKERS"):
            try:
                settings["max_workers"] = int(os.environ.get("CUSTOM_MAX_WORKERS"))
            except (ValueError, TypeError):
                pass
        
        if os.environ.get("CUSTOM_PRELOAD_DATA"):
            settings["preload_data"] = os.environ.get("CUSTOM_PRELOAD_DATA").lower() == "true"
        
        if os.environ.get("CUSTOM_MEMORY_LIMIT"):
            try:
                settings["memory_limit_mb"] = int(os.environ.get("CUSTOM_MEMORY_LIMIT"))
            except (ValueError, TypeError):
                pass
        
        return settings
    
    def apply_startup_optimizations(self) -> None:
        """Apply optimizations during application startup"""
        logger.info(f"Applying startup optimizations for {self.env} environment")
        
        # Set environment variables based on settings
        os.environ["CACHE_TTL"] = str(self.settings["cache_ttl"])
        os.environ["MAX_WORKERS"] = str(self.settings["max_workers"])
        os.environ["REQUEST_TIMEOUT"] = str(self.settings["request_timeout"])
        os.environ["MAX_RETRIES"] = str(self.settings["max_retries"])
        os.environ["USE_COMPRESSION"] = str(self.settings["use_compression"]).lower()
        
        # Set AI fallback usage
        if "use_ai_fallback" in self.settings:
            os.environ["USE_AI_FALLBACK"] = str(self.settings["use_ai_fallback"]).lower()
        
        # Create cache directory if needed
        if not os.path.exists("cache"):
            os.makedirs("cache", exist_ok=True)
        
        # Start preloading data in background if enabled
        if self.settings["preload_data"]:
            threading.Thread(target=self._preload_data, daemon=True).start()
        
        self.stats["startup_optimizations"] += 1
    
    def _preload_data(self) -> None:
        """Preload essential data in background"""
        try:
            # Wait a bit for application to start
            time.sleep(5)
            
            logger.info("Preloading essential data...")
            
            # Import data fallbacks (lazy import)
            try:
                from data_fallbacks import get_alphavantage_with_fallback, get_sector_performance_with_fallback
                
                # Preload sector performance data
                gics_sectors = [
                    'Information Technology', 'Health Care', 'Financials',
                    'Consumer Discretionary', 'Communication Services'
                ]
                get_sector_performance_with_fallback(gics_sectors, '1D')
                logger.info("Preloaded sector performance data")
                
                # Preload data for major stocks
                major_stocks = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META']
                for stock in major_stocks[:2]:  # Limit to 2 to avoid API limits
                    get_alphavantage_with_fallback(stock)
                    time.sleep(1)  # Avoid rate limits
                logger.info("Preloaded major stock data")
                
            except ImportError:
                logger.warning("Data fallbacks not available for preloading")
            
            logger.info("Data preloading complete")
            
        except Exception as e:
            logger.error(f"Error during data preloading: {e}")
    
    def apply_runtime_optimizations(self) -> None:
        """Apply optimizations during runtime"""
        # Implement runtime optimizations
        self.stats["runtime_optimizations"] += 1
    
    def apply_memory_optimizations(self) -> None:
        """Apply memory optimizations"""
        # Implement memory optimizations
        self.stats["memory_optimizations"] += 1
    
    def apply_network_optimizations(self) -> None:
        """Apply network optimizations"""
        # Implement network optimizations
        self.stats["network_optimizations"] += 1
    
    def get_environment(self) -> str:
        """Get the current deployment environment"""
        return self.env
    
    def get_settings(self) -> Dict[str, Any]:
        """Get the current settings"""
        return self.settings
    
    def get_stats(self) -> Dict[str, Any]:
        """Get optimizer statistics"""
        return self.stats
    
    def get_environment_info(self) -> Dict[str, Any]:
        """Get detailed information about the current environment"""
        info = {
            "environment": self.env,
            "settings": self.settings,
            "stats": self.stats,
            "system": {
                "platform": platform.platform(),
                "python_version": platform.python_version(),
                "cpu_count": os.cpu_count(),
                "memory_available": self._get_available_memory()
            }
        }
        return info
    
    def _get_available_memory(self) -> Optional[int]:
        """Get available memory in MB"""
        try:
            import psutil
            return psutil.virtual_memory().available // (1024 * 1024)
        except ImportError:
            return None


# Create global optimizer instance
optimizer = DeploymentOptimizer()

# Convenience functions
def get_environment() -> str:
    """Get the current deployment environment"""
    return optimizer.get_environment()

def get_settings() -> Dict[str, Any]:
    """Get the current settings"""
    return optimizer.get_settings()

def get_environment_info() -> Dict[str, Any]:
    """Get detailed information about the current environment"""
    return optimizer.get_environment_info()

def apply_runtime_optimizations() -> None:
    """Apply runtime optimizations"""
    optimizer.apply_runtime_optimizations()

def apply_memory_optimizations() -> None:
    """Apply memory optimizations"""
    optimizer.apply_memory_optimizations()

def apply_network_optimizations() -> None:
    """Apply network optimizations"""
    optimizer.apply_network_optimizations()


if __name__ == "__main__":
    # Print environment information
    print("Deployment Environment Information:")
    info = get_environment_info()
    print(f"Environment: {info['environment']}")
    print("\nSettings:")
    for key, value in info["settings"].items():
        print(f"  {key}: {value}")
    print("\nSystem:")
    for key, value in info["system"].items():
        print(f"  {key}: {value}")
    print("\nStats:")
    for key, value in info["stats"].items():
        print(f"  {key}: {value}")
