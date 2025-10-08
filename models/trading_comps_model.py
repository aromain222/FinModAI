"""
Professional Trading Comps Model
Banker-grade trading comparables analysis with industry-specific peer selection.
"""

from typing import Dict, List, Any, Optional
from dataclasses import dataclass
import statistics

@dataclass
class PeerCompany:
    """Peer company data for trading comps."""
    ticker: str
    name: str
    market_cap: float
    enterprise_value: float
    revenue: float
    ebitda: float
    net_income: float
    shares_outstanding: float
    price: float
    ev_revenue: float
    ev_ebitda: float
    pe_ratio: float
    pb_ratio: float

@dataclass
class TradingCompsResults:
    """Trading comps model results."""
    subject_company: str
    peers: List[PeerCompany]
    multiples: Dict[str, Dict[str, float]]
    median_multiples: Dict[str, float]
    mean_multiples: Dict[str, float]
    implied_valuation: Dict[str, Dict[str, float]]
    recommendation: str
    confidence: str

class TradingCompsModel:
    """Professional trading comparables model."""
    
    def __init__(self):
        self.peers = []
        self.results = None
    
    def build_trading_comps(self, subject_ticker: str, subject_data: Dict[str, Any]) -> TradingCompsResults:
        """
        Build trading comparables analysis.
        
        Args:
            subject_ticker: Ticker of the subject company
            subject_data: Subject company financial data
            
        Returns:
            TradingCompsResults: Complete trading comps analysis
        """
        # Define industry peer groups
        peer_groups = self._get_peer_groups(subject_ticker, subject_data)
        
        # Select appropriate peers
        self.peers = self._select_peers(subject_ticker, peer_groups)
        
        # Calculate multiples for each peer
        for peer in self.peers:
            peer.ev_revenue = peer.enterprise_value / peer.revenue if peer.revenue > 0 else 0
            peer.ev_ebitda = peer.enterprise_value / peer.ebitda if peer.ebitda > 0 else 0
            peer.pe_ratio = peer.price / (peer.net_income / peer.shares_outstanding) if peer.net_income > 0 else 0
            peer.pb_ratio = peer.market_cap / (peer.net_income * 0.1)  # Simplified book value
        
        # Calculate summary statistics
        multiples = self._calculate_multiples()
        median_multiples = self._calculate_median_multiples()
        mean_multiples = self._calculate_mean_multiples()
        
        # Calculate implied valuation for subject company
        implied_valuation = self._calculate_implied_valuation(subject_data, median_multiples)
        
        # Generate recommendation
        recommendation = self._generate_recommendation(implied_valuation, subject_data)
        confidence = self._calculate_confidence()
        
        self.results = TradingCompsResults(
            subject_company=subject_ticker,
            peers=self.peers,
            multiples=multiples,
            median_multiples=median_multiples,
            mean_multiples=mean_multiples,
            implied_valuation=implied_valuation,
            recommendation=recommendation,
            confidence=confidence
        )
        
        return self.results
    
    def _get_peer_groups(self, ticker: str, subject_data: Dict[str, Any]) -> Dict[str, List[Dict]]:
        """Define industry peer groups based on subject company."""
        # This is a simplified version - in practice, you'd have a comprehensive database
        peer_groups = {
            "technology": [
                {"ticker": "MSFT", "name": "Microsoft Corporation", "market_cap": 3000000000000, "revenue": 200000000000, "ebitda": 80000000000},
                {"ticker": "AAPL", "name": "Apple Inc.", "market_cap": 3500000000000, "revenue": 400000000000, "ebitda": 120000000000},
                {"ticker": "GOOGL", "name": "Alphabet Inc.", "market_cap": 1800000000000, "revenue": 300000000000, "ebitda": 90000000000},
                {"ticker": "AMZN", "name": "Amazon.com Inc.", "market_cap": 1500000000000, "revenue": 500000000000, "ebitda": 60000000000},
                {"ticker": "META", "name": "Meta Platforms Inc.", "market_cap": 800000000000, "revenue": 120000000000, "ebitda": 40000000000},
            ],
            "financial": [
                {"ticker": "JPM", "name": "JPMorgan Chase & Co.", "market_cap": 500000000000, "revenue": 150000000000, "ebitda": 60000000000},
                {"ticker": "BAC", "name": "Bank of America Corp.", "market_cap": 300000000000, "revenue": 100000000000, "ebitda": 40000000000},
                {"ticker": "WFC", "name": "Wells Fargo & Company", "market_cap": 200000000000, "revenue": 80000000000, "ebitda": 30000000000},
                {"ticker": "GS", "name": "Goldman Sachs Group Inc.", "market_cap": 120000000000, "revenue": 50000000000, "ebitda": 20000000000},
            ],
            "consumer": [
                {"ticker": "NKE", "name": "Nike Inc.", "market_cap": 200000000000, "revenue": 50000000000, "ebitda": 8000000000},
                {"ticker": "MCD", "name": "McDonald's Corporation", "market_cap": 220000000000, "revenue": 25000000000, "ebitda": 12000000000},
                {"ticker": "SBUX", "name": "Starbucks Corporation", "market_cap": 100000000000, "revenue": 30000000000, "ebitda": 5000000000},
                {"ticker": "GOOS", "name": "Canada Goose Holdings Inc.", "market_cap": 2000000000, "revenue": 1000000000, "ebitda": 250000000},
            ],
            "healthcare": [
                {"ticker": "JNJ", "name": "Johnson & Johnson", "market_cap": 450000000000, "revenue": 100000000000, "ebitda": 30000000000},
                {"ticker": "PFE", "name": "Pfizer Inc.", "market_cap": 200000000000, "revenue": 80000000000, "ebitda": 25000000000},
                {"ticker": "UNH", "name": "UnitedHealth Group Inc.", "market_cap": 500000000000, "revenue": 300000000000, "ebitda": 25000000000},
            ]
        }
        
        # Determine industry based on ticker or data
        industry = self._determine_industry(ticker, subject_data)
        return {industry: peer_groups.get(industry, peer_groups["technology"])}
    
    def _determine_industry(self, ticker: str, subject_data: Dict[str, Any]) -> str:
        """Determine industry based on ticker or company data."""
        # Simple mapping - in practice, you'd use a comprehensive industry database
        tech_tickers = ["MSFT", "AAPL", "GOOGL", "AMZN", "META", "NFLX", "NVDA", "TSLA"]
        financial_tickers = ["JPM", "BAC", "WFC", "GS", "C", "MS"]
        consumer_tickers = ["NKE", "MCD", "SBUX", "GOOS", "LULU", "NKE"]
        healthcare_tickers = ["JNJ", "PFE", "UNH", "ABBV", "MRK"]
        
        if ticker in tech_tickers:
            return "technology"
        elif ticker in financial_tickers:
            return "financial"
        elif ticker in consumer_tickers:
            return "consumer"
        elif ticker in healthcare_tickers:
            return "healthcare"
        else:
            return "technology"  # Default
    
    def _select_peers(self, subject_ticker: str, peer_groups: Dict[str, List[Dict]]) -> List[PeerCompany]:
        """Select appropriate peer companies."""
        peers = []
        
        for industry, companies in peer_groups.items():
            for company_data in companies:
                if company_data["ticker"] != subject_ticker:  # Exclude subject company
                    peer = PeerCompany(
                        ticker=company_data["ticker"],
                        name=company_data["name"],
                        market_cap=company_data["market_cap"],
                        enterprise_value=company_data["market_cap"] * 1.1,  # Assume 10% net debt
                        revenue=company_data["revenue"],
                        ebitda=company_data["ebitda"],
                        net_income=company_data["ebitda"] * 0.7,  # Assume 30% tax rate
                        shares_outstanding=company_data["market_cap"] / 100,  # Assume $100/share
                        price=100.0,  # Simplified
                        ev_revenue=0.0,  # Will be calculated
                        ev_ebitda=0.0,  # Will be calculated
                        pe_ratio=0.0,  # Will be calculated
                        pb_ratio=0.0   # Will be calculated
                    )
                    peers.append(peer)
        
        return peers[:8]  # Limit to 8 peers for readability
    
    def _calculate_multiples(self) -> Dict[str, Dict[str, float]]:
        """Calculate multiples for each peer."""
        multiples = {}
        
        for peer in self.peers:
            multiples[peer.ticker] = {
                "ev_revenue": peer.ev_revenue,
                "ev_ebitda": peer.ev_ebitda,
                "pe_ratio": peer.pe_ratio,
                "pb_ratio": peer.pb_ratio
            }
        
        return multiples
    
    def _calculate_median_multiples(self) -> Dict[str, float]:
        """Calculate median multiples across peers."""
        ev_revenue_values = [peer.ev_revenue for peer in self.peers if peer.ev_revenue > 0]
        ev_ebitda_values = [peer.ev_ebitda for peer in self.peers if peer.ev_ebitda > 0]
        pe_values = [peer.pe_ratio for peer in self.peers if peer.pe_ratio > 0]
        pb_values = [peer.pb_ratio for peer in self.peers if peer.pb_ratio > 0]
        
        return {
            "ev_revenue": statistics.median(ev_revenue_values) if ev_revenue_values else 0,
            "ev_ebitda": statistics.median(ev_ebitda_values) if ev_ebitda_values else 0,
            "pe_ratio": statistics.median(pe_values) if pe_values else 0,
            "pb_ratio": statistics.median(pb_values) if pb_values else 0
        }
    
    def _calculate_mean_multiples(self) -> Dict[str, float]:
        """Calculate mean multiples across peers."""
        ev_revenue_values = [peer.ev_revenue for peer in self.peers if peer.ev_revenue > 0]
        ev_ebitda_values = [peer.ev_ebitda for peer in self.peers if peer.ev_ebitda > 0]
        pe_values = [peer.pe_ratio for peer in self.peers if peer.pe_ratio > 0]
        pb_values = [peer.pb_ratio for peer in self.peers if peer.pb_ratio > 0]
        
        return {
            "ev_revenue": statistics.mean(ev_revenue_values) if ev_revenue_values else 0,
            "ev_ebitda": statistics.mean(ev_ebitda_values) if ev_ebitda_values else 0,
            "pe_ratio": statistics.mean(pe_values) if pe_values else 0,
            "pb_ratio": statistics.mean(pb_values) if pb_values else 0
        }
    
    def _calculate_implied_valuation(self, subject_data: Dict[str, Any], median_multiples: Dict[str, float]) -> Dict[str, Dict[str, float]]:
        """Calculate implied valuation for subject company."""
        # Get subject company metrics
        subject_revenue = subject_data.get('revenue', 1000000000)  # $1B default
        subject_ebitda = subject_data.get('ebitda', 250000000)     # $250M default
        subject_net_income = subject_data.get('net_income', 200000000)  # $200M default
        
        # Calculate implied values
        implied_ev_revenue = subject_revenue * median_multiples["ev_revenue"]
        implied_ev_ebitda = subject_ebitda * median_multiples["ev_ebitda"]
        implied_pe = subject_net_income * median_multiples["pe_ratio"]
        
        return {
            "ev_revenue": {
                "multiple": median_multiples["ev_revenue"],
                "implied_ev": implied_ev_revenue,
                "implied_equity": implied_ev_revenue * 0.7  # Assume 30% net debt
            },
            "ev_ebitda": {
                "multiple": median_multiples["ev_ebitda"],
                "implied_ev": implied_ev_ebitda,
                "implied_equity": implied_ev_ebitda * 0.7
            },
            "pe_ratio": {
                "multiple": median_multiples["pe_ratio"],
                "implied_equity": implied_pe
            }
        }
    
    def _generate_recommendation(self, implied_valuation: Dict[str, Dict[str, float]], subject_data: Dict[str, Any]) -> str:
        """Generate investment recommendation based on trading comps."""
        # Simple logic - in practice, you'd have more sophisticated analysis
        ev_ebitda_implied = implied_valuation["ev_ebitda"]["implied_equity"]
        current_market_cap = subject_data.get('market_cap', 1000000000)
        
        upside = (ev_ebitda_implied - current_market_cap) / current_market_cap
        
        if upside > 0.2:
            return "BUY"
        elif upside > 0.05:
            return "HOLD"
        else:
            return "SELL"
    
    def _calculate_confidence(self) -> str:
        """Calculate confidence level in the analysis."""
        # Simple logic based on number of peers and data quality
        if len(self.peers) >= 6:
            return "H"
        elif len(self.peers) >= 4:
            return "M"
        else:
            return "L"
    
    def get_summary(self) -> Dict[str, Any]:
        """Get a summary of the trading comps analysis."""
        if not self.results:
            return {}
        
        return {
            "subject_company": self.results.subject_company,
            "peer_count": len(self.results.peers),
            "median_multiples": self.results.median_multiples,
            "implied_valuation": self.results.implied_valuation,
            "recommendation": self.results.recommendation,
            "confidence": self.results.confidence
        }
