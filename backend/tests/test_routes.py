"""
Tests for API routes (using mocked cache)
"""
import pytest
from datetime import datetime
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch

from backend.app import app
from backend.market.cache import market_cache

client = TestClient(app)


@pytest.fixture(autouse=True)
def mock_fundamentals_loader():
    """Mock fundamentals loader to avoid needing real data files"""
    with patch('backend.data.loader.fundamentals_loader') as mock_loader:
        mock_loader.tickers = ['AAPL', 'MSFT', 'GOOGL']
        mock_loader.get_latest.return_value = {
            'ticker': 'AAPL',
            'fiscal_year': 2023,
            'revenue': 394328,
            'ebitda': 129956,
            'net_debt': 50000,
            'net_income': 96995
        }
        yield mock_loader


@pytest.fixture
def sample_snapshots():
    """Sample snapshot data"""
    return {
        'AAPL': {
            'ticker': 'AAPL',
            'name': 'Apple Inc.',
            'sector': 'Technology',
            'price': 178.72,
            'change1d_pct': 1.23,
            'market_cap': 2800000000000,
            'ev': 2850000000000,
            'ev_to_ebitda': 22.1,
            'ev_to_revenue': 7.3,
            'pe': 29.5,
            'beta': 1.25,
            'currency': 'USD',
            'as_of_quotes': datetime.utcnow(),
            'stale': False
        },
        'MSFT': {
            'ticker': 'MSFT',
            'name': 'Microsoft Corp.',
            'sector': 'Technology',
            'price': 378.91,
            'change1d_pct': 0.87,
            'market_cap': 2500000000000,
            'ev': 2480000000000,
            'ev_to_ebitda': 24.8,
            'ev_to_revenue': 10.5,
            'pe': 35.2,
            'beta': 1.10,
            'currency': 'USD',
            'as_of_quotes': datetime.utcnow(),
            'stale': False
        },
        'JPM': {
            'ticker': 'JPM',
            'name': 'JPMorgan Chase',
            'sector': 'Financial Services',
            'price': 155.28,
            'change1d_pct': 1.15,
            'market_cap': 450000000000,
            'ev': 455000000000,
            'ev_to_ebitda': None,
            'pe': 11.2,
            'beta': 1.15,
            'currency': 'USD',
            'as_of_quotes': datetime.utcnow(),
            'stale': False
        }
    }


def test_healthz():
    """Test health endpoint"""
    response = client.get("/healthz")
    assert response.status_code == 200
    data = response.json()
    assert data['status'] == 'ok'
    assert 'timestamp' in data


def test_root():
    """Test root endpoint"""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data['name'] == 'FinModAI Market Overview API'
    assert 'endpoints' in data


def test_market_snapshot_basic(sample_snapshots):
    """Test basic market snapshot request"""
    # Mock cache
    market_cache.set_all_snapshots(sample_snapshots)
    
    response = client.get("/api/v1/market/snapshot?limit=10&offset=0")
    assert response.status_code == 200
    
    data = response.json()
    assert 'data' in data
    assert 'total' in data
    assert data['total'] == 3
    assert len(data['data']) == 3


def test_market_snapshot_sector_filter(sample_snapshots):
    """Test snapshot with sector filter"""
    market_cache.set_all_snapshots(sample_snapshots)
    
    response = client.get("/api/v1/market/snapshot?sector=Technology&limit=10")
    assert response.status_code == 200
    
    data = response.json()
    assert data['total'] == 2  # AAPL and MSFT
    assert all(row['sector'] == 'Technology' for row in data['data'])


def test_market_snapshot_sorting(sample_snapshots):
    """Test snapshot sorting by market cap"""
    market_cache.set_all_snapshots(sample_snapshots)
    
    response = client.get("/api/v1/market/snapshot?sort=market_cap&order=desc")
    assert response.status_code == 200
    
    data = response.json()
    # Should be sorted: AAPL (2.8T), MSFT (2.5T), JPM (450B)
    assert data['data'][0]['ticker'] == 'AAPL'
    assert data['data'][1]['ticker'] == 'MSFT'
    assert data['data'][2]['ticker'] == 'JPM'


def test_market_snapshot_pagination(sample_snapshots):
    """Test snapshot pagination"""
    market_cache.set_all_snapshots(sample_snapshots)
    
    # First page
    response = client.get("/api/v1/market/snapshot?limit=2&offset=0")
    assert response.status_code == 200
    data = response.json()
    assert len(data['data']) == 2
    assert data['total'] == 3
    
    # Second page
    response = client.get("/api/v1/market/snapshot?limit=2&offset=2")
    assert response.status_code == 200
    data = response.json()
    assert len(data['data']) == 1
    assert data['total'] == 3


def test_market_snapshot_empty_cache():
    """Test snapshot returns 503 when cache is empty"""
    market_cache.clear_all()
    
    response = client.get("/api/v1/market/snapshot")
    assert response.status_code == 503
    assert 'not available' in response.json()['detail']


def test_sector_leaders_single_sector(sample_snapshots):
    """Test getting leaders for a single sector"""
    # Setup cache with leaders
    market_cache.set_leaders('Technology', [
        sample_snapshots['AAPL'],
        sample_snapshots['MSFT']
    ])
    
    response = client.get("/api/v1/market/leaders?sector=Technology&limit=3")
    assert response.status_code == 200
    
    data = response.json()
    assert data['sector'] == 'Technology'
    assert len(data['leaders']) == 2
    assert data['leaders'][0]['ticker'] == 'AAPL'


def test_sector_leaders_not_found():
    """Test 404 when sector has no leaders"""
    market_cache.clear_all()
    
    response = client.get("/api/v1/market/leaders?sector=Unknown")
    assert response.status_code == 404


def test_company_detail_success(sample_snapshots):
    """Test getting company detail"""
    market_cache.set_snapshot('AAPL', sample_snapshots['AAPL'])
    
    response = client.get("/api/v1/company/AAPL")
    assert response.status_code == 200
    
    data = response.json()
    assert data['ticker'] == 'AAPL'
    assert data['name'] == 'Apple Inc.'
    assert data['sector'] == 'Technology'
    assert data['price'] == 178.72
    assert data['market_cap'] == 2800000000000


def test_company_detail_not_found():
    """Test 404 for unknown company"""
    market_cache.clear_all()
    
    response = client.get("/api/v1/company/UNKNOWN")
    assert response.status_code == 404


def test_company_detail_with_sparkline(sample_snapshots):
    """Test company detail includes sparkline if available"""
    market_cache.set_snapshot('AAPL', sample_snapshots['AAPL'])
    market_cache.set_sparkline('AAPL', [0.3, 0.4, 0.5, 0.6, 0.7])
    
    response = client.get("/api/v1/company/AAPL")
    assert response.status_code == 200
    
    data = response.json()
    assert data['sparkline'] is not None
    assert len(data['sparkline']) == 5


def test_invalid_limit_parameter():
    """Test validation of limit parameter"""
    response = client.get("/api/v1/market/snapshot?limit=1000")
    # Should be clamped or rejected (depends on Pydantic validation)
    # At minimum, should not crash
    assert response.status_code in [200, 422]


def test_invalid_sort_field():
    """Test invalid sort field returns 422"""
    response = client.get("/api/v1/market/snapshot?sort=invalid_field")
    assert response.status_code == 422

