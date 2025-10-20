"""
Model input bundles for DCF, LBO, Comps, and Merger models.
"""
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime
from dataclasses import dataclass, field
from pydantic import BaseModel, validator
from orchestrator.fetch import data_fetcher, FetchRequest
from orchestrator.reconcile import data_reconciler
from orchestrator.cache import cache_manager
from config import config


# Pydantic models for type validation
class HistoricalFinancial(BaseModel):
    """Historical financial data for a fiscal year."""
    fiscal_year: int
    revenue: Optional[float] = None
    ebit: Optional[float] = None
    ebitda: Optional[float] = None
    d_and_a: Optional[float] = None
    capex: Optional[float] = None
    nwc: Optional[float] = None
    delta_nwc: Optional[float] = None
    net_income: Optional[float] = None


class CurrentFinancial(BaseModel):
    """Current financial metrics."""
    revenue_ttm: Optional[float] = None
    ebitda_ttm: Optional[float] = None
    cash: Optional[float] = None
    shares_out: Optional[float] = None
    net_debt: Optional[float] = None


class CapitalStructure(BaseModel):
    """Capital structure data."""
    cash: Optional[float] = None
    short_term_debt: Optional[float] = None
    long_term_debt: Optional[float] = None
    net_debt: Optional[float] = None
    shares_out: Optional[float] = None


class MarketData(BaseModel):
    """Market data."""
    price: Optional[float] = None
    market_cap: Optional[float] = None
    beta: Optional[float] = None
    currency: Optional[str] = "USD"


class WACCInputs(BaseModel):
    """WACC calculation inputs."""
    rf_10y: Optional[float] = None
    erp_config: Optional[Dict[str, Any]] = None
    beta_pref: Optional[float] = None
    kd_pref: Optional[float] = None


class DCFBundle(BaseModel):
    """DCF model input bundle."""
    ticker: str
    as_of_fundamentals: Optional[datetime] = None
    as_of_quotes: Optional[datetime] = None
    historicals: List[HistoricalFinancial] = field(default_factory=list)
    current: CurrentFinancial = field(default_factory=CurrentFinancial)
    capital: CapitalStructure = field(default_factory=CapitalStructure)
    market: MarketData = field(default_factory=MarketData)
    wacc_inputs: WACCInputs = field(default_factory=WACCInputs)
    provenance: Dict[str, str] = field(default_factory=dict)
    
    @validator('historicals')
    def validate_historicals(cls, v):
        if len(v) < 3:
            raise ValueError('DCF requires at least 3 years of historical data')
        return v


class LBOStarting(BaseModel):
    """LBO starting financials."""
    revenue_LTM: Optional[float] = None
    revenue_FY: Optional[float] = None
    ebitda_LTM: Optional[float] = None
    ebitda_FY: Optional[float] = None
    ebit_LTM: Optional[float] = None
    ebit_FY: Optional[float] = None
    capex_LTM: Optional[float] = None
    capex_FY: Optional[float] = None
    delta_nwc_LTM: Optional[float] = None
    delta_nwc_FY: Optional[float] = None
    cash: Optional[float] = None
    gross_debt: Optional[float] = None
    net_debt: Optional[float] = None
    tax_rate_effective: Optional[float] = None


class CapStructureHints(BaseModel):
    """Capital structure hints for LBO."""
    typical_leverage_turns: Optional[float] = None
    interest_benchmark: Optional[str] = None


class LBOBundle(BaseModel):
    """LBO model input bundle."""
    ticker: str
    as_of: Optional[datetime] = None
    starting: LBOStarting = field(default_factory=LBOStarting)
    market: MarketData = field(default_factory=MarketData)
    cap_structure_hints: CapStructureHints = field(default_factory=CapStructureHints)
    provenance: Dict[str, str] = field(default_factory=dict)


class PeerRow(BaseModel):
    """Peer company data for comps."""
    ticker: str
    name: Optional[str] = None
    sector: Optional[str] = None
    revenue_latest: Optional[float] = None
    ebitda_latest: Optional[float] = None
    ebit_latest: Optional[float] = None
    net_income_latest: Optional[float] = None
    cash: Optional[float] = None
    net_debt: Optional[float] = None
    shares_out: Optional[float] = None
    price: Optional[float] = None
    market_cap: Optional[float] = None
    pe_trailing: Optional[float] = None
    pe_forward: Optional[float] = None
    ev: Optional[float] = None
    ev_to_revenue: Optional[float] = None
    ev_to_ebitda: Optional[float] = None
    ev_to_ebit: Optional[float] = None
    beta: Optional[float] = None
    currency: Optional[str] = "USD"
    as_of_quotes: Optional[datetime] = None
    as_of_fundamentals: Optional[datetime] = None
    provenance: Dict[str, str] = field(default_factory=dict)


class CompsBundle(BaseModel):
    """Comps model input bundle."""
    peer_rows: List[PeerRow] = field(default_factory=list)
    
    @validator('peer_rows')
    def validate_peer_rows(cls, v):
        if len(v) < 8:
            raise ValueError('Comps requires at least 8 peer companies')
        return v


class MergerShared(BaseModel):
    """Shared data for merger analysis."""
    sector: Optional[str] = None
    industry: Optional[str] = None
    overlap_clues: Optional[Dict[str, Any]] = None


class MergerBundle(BaseModel):
    """Merger model input bundle."""
    acquirer: DCFBundle
    target: DCFBundle
    shared: MergerShared = field(default_factory=MergerShared)
    provenance: Dict[str, str] = field(default_factory=dict)


class BundleBuilder:
    """Builder for model input bundles."""
    
    def __init__(self):
        self.logger = logging.getLogger("models_data.bundles")
    
    async def build_dcf_bundle(self, ticker: str, force_refresh: bool = False) -> DCFBundle:
        """Build DCF input bundle for a ticker."""
        self.logger.info(f"Building DCF bundle for {ticker}")
        
        # Fetch data from multiple sources
        fetch_requests = [
            FetchRequest(ticker=ticker, data_type="fundamentals", force_refresh=force_refresh),
            FetchRequest(ticker=ticker, data_type="quotes", force_refresh=force_refresh),
            FetchRequest(ticker=ticker, data_type="metadata", force_refresh=force_refresh),
        ]
        
        fetch_results = await data_fetcher.fetch_batch(fetch_requests)
        
        # Reconcile data
        fundamentals_results = [r for r in fetch_results.values() if r.success and "fundamentals" in r.data.get("source", "")]
        quotes_results = [r for r in fetch_results.values() if r.success and "quotes" in r.data.get("source", "")]
        
        # Reconcile fundamentals
        reconciled_fundamentals = data_reconciler.reconcile_fundamentals(fundamentals_results)
        reconciled_quotes = data_reconciler.reconcile_quotes(quotes_results)
        
        # Build bundle
        bundle_data = {
            "ticker": ticker.upper(),
            "as_of_fundamentals": reconciled_fundamentals.as_of_fundamentals,
            "as_of_quotes": reconciled_quotes.as_of_quotes,
            "provenance": {**reconciled_fundamentals.provenance, **reconciled_quotes.provenance}
        }
        
        # Extract historical data
        historicals = []
        if "historicals" in reconciled_fundamentals.data:
            for hist_data in reconciled_fundamentals.data["historicals"][:10]:  # Last 10 years
                historicals.append(HistoricalFinancial(**hist_data))
        
        bundle_data["historicals"] = historicals
        
        # Extract current data
        current_data = reconciled_fundamentals.data.get("current", {})
        bundle_data["current"] = CurrentFinancial(**current_data)
        
        # Extract capital structure
        capital_data = {
            "cash": reconciled_fundamentals.data.get("cash"),
            "short_term_debt": reconciled_fundamentals.data.get("short_term_debt"),
            "long_term_debt": reconciled_fundamentals.data.get("long_term_debt"),
            "net_debt": reconciled_fundamentals.data.get("net_debt"),
            "shares_out": reconciled_fundamentals.data.get("shares_out")
        }
        bundle_data["capital"] = CapitalStructure(**capital_data)
        
        # Extract market data
        market_data = {
            "price": reconciled_quotes.data.get("price"),
            "market_cap": reconciled_quotes.data.get("market_cap"),
            "beta": reconciled_fundamentals.data.get("beta"),
            "currency": reconciled_quotes.data.get("currency", "USD")
        }
        bundle_data["market"] = MarketData(**market_data)
        
        # WACC inputs (simplified for now)
        bundle_data["wacc_inputs"] = WACCInputs(
            rf_10y=None,  # Will be fetched separately if FRED is available
            erp_config={"method": "historical", "period": "10y"},
            beta_pref=market_data.get("beta")
        )
        
        # Validate minimum requirements
        if len(historicals) < 3:
            missing_fields = ["historicals (need ≥3 years)"]
            if not bundle_data["current"].revenue_ttm:
                missing_fields.append("revenue_ttm")
            if not bundle_data["current"].ebitda_ttm:
                missing_fields.append("ebitda_ttm")
            if not bundle_data["market"].price:
                missing_fields.append("price")
            
            raise ValueError(f"DCF bundle missing required fields: {missing_fields}")
        
        return DCFBundle(**bundle_data)
    
    async def build_lbo_bundle(self, ticker: str, force_refresh: bool = False) -> LBOBundle:
        """Build LBO input bundle for a ticker."""
        self.logger.info(f"Building LBO bundle for {ticker}")
        
        # Use DCF bundle as base and adapt for LBO
        dcf_bundle = await self.build_dcf_bundle(ticker, force_refresh)
        
        # Extract LBO-specific starting data
        starting_data = {
            "revenue_LTM": dcf_bundle.current.revenue_ttm,
            "revenue_FY": dcf_bundle.historicals[0].revenue if dcf_bundle.historicals else None,
            "ebitda_LTM": dcf_bundle.current.ebitda_ttm,
            "ebitda_FY": dcf_bundle.historicals[0].ebitda if dcf_bundle.historicals else None,
            "ebit_LTM": None,  # Calculate if needed
            "ebit_FY": dcf_bundle.historicals[0].ebit if dcf_bundle.historicals else None,
            "capex_LTM": None,  # Calculate if needed
            "capex_FY": dcf_bundle.historicals[0].capex if dcf_bundle.historicals else None,
            "delta_nwc_LTM": None,  # Calculate if needed
            "delta_nwc_FY": dcf_bundle.historicals[0].delta_nwc if dcf_bundle.historicals else None,
            "cash": dcf_bundle.capital.cash,
            "gross_debt": (dcf_bundle.capital.short_term_debt or 0) + (dcf_bundle.capital.long_term_debt or 0),
            "net_debt": dcf_bundle.capital.net_debt,
            "tax_rate_effective": None  # Calculate if possible
        }
        
        # Calculate derived metrics if possible
        if dcf_bundle.historicals:
            latest_hist = dcf_bundle.historicals[0]
            if latest_hist.ebit and latest_hist.d_and_a:
                starting_data["ebit_LTM"] = latest_hist.ebit + latest_hist.d_and_a
        
        bundle_data = {
            "ticker": ticker.upper(),
            "as_of": dcf_bundle.as_of_fundamentals,
            "starting": LBOStarting(**starting_data),
            "market": dcf_bundle.market,
            "cap_structure_hints": CapStructureHints(
                typical_leverage_turns=4.0,  # Default assumption
                interest_benchmark="SOFR"
            ),
            "provenance": dcf_bundle.provenance
        }
        
        return LBOBundle(**bundle_data)
    
    async def build_comps_bundle(self, ticker: str, peers: List[str] = None, force_refresh: bool = False) -> CompsBundle:
        """Build Comps input bundle for a ticker and peers."""
        self.logger.info(f"Building Comps bundle for {ticker} with peers: {peers}")
        
        # If no peers specified, get peers by sector
        if not peers:
            peers = await self._get_sector_peers(ticker)
        
        # Add target ticker to peer list
        all_tickers = [ticker] + peers
        
        # Fetch data for all tickers
        fetch_requests = []
        for t in all_tickers:
            fetch_requests.extend([
                FetchRequest(ticker=t, data_type="fundamentals", force_refresh=force_refresh),
                FetchRequest(ticker=t, data_type="quotes", force_refresh=force_refresh),
                FetchRequest(ticker=t, data_type="metadata", force_refresh=force_refresh),
            ])
        
        fetch_results = await data_fetcher.fetch_batch(fetch_requests)
        
        # Build peer rows
        peer_rows = []
        for peer_ticker in all_tickers:
            peer_data = await self._build_peer_row(peer_ticker, fetch_results)
            if peer_data:
                peer_rows.append(peer_data)
        
        # Validate minimum requirements
        if len(peer_rows) < 8:
            raise ValueError(f"Comps bundle requires at least 8 peer companies, got {len(peer_rows)}")
        
        return CompsBundle(peer_rows=peer_rows)
    
    async def build_merger_bundle(self, acquirer_ticker: str, target_ticker: str, force_refresh: bool = False) -> MergerBundle:
        """Build Merger input bundle for acquirer and target."""
        self.logger.info(f"Building Merger bundle: {acquirer_ticker} + {target_ticker}")
        
        # Build DCF bundles for both companies
        acquirer_bundle = await self.build_dcf_bundle(acquirer_ticker, force_refresh)
        target_bundle = await self.build_dcf_bundle(target_ticker, force_refresh)
        
        # Build shared data
        shared_data = MergerShared(
            sector=acquirer_bundle.provenance.get("sector"),
            industry=acquirer_bundle.provenance.get("industry"),
            overlap_clues={
                "same_sector": acquirer_bundle.provenance.get("sector") == target_bundle.provenance.get("sector"),
                "size_ratio": self._calculate_size_ratio(acquirer_bundle, target_bundle)
            }
        )
        
        # Combine provenance
        combined_provenance = {
            **{f"acquirer_{k}": v for k, v in acquirer_bundle.provenance.items()},
            **{f"target_{k}": v for k, v in target_bundle.provenance.items()}
        }
        
        return MergerBundle(
            acquirer=acquirer_bundle,
            target=target_bundle,
            shared=shared_data,
            provenance=combined_provenance
        )
    
    async def _get_sector_peers(self, ticker: str) -> List[str]:
        """Get sector peers for a ticker (simplified implementation)."""
        # This is a simplified implementation - in production you'd have a comprehensive peer mapping
        sector_peers = {
            "AAPL": ["MSFT", "GOOGL", "AMZN", "META", "TSLA", "NVDA", "ORCL", "CRM", "ADBE", "INTC"],
            "MSFT": ["AAPL", "GOOGL", "AMZN", "META", "ORCL", "CRM", "ADBE", "INTC", "IBM", "CSCO"],
            "GOOGL": ["AAPL", "MSFT", "AMZN", "META", "NVDA", "ORCL", "CRM", "ADBE", "NFLX", "TSLA"],
            "AMZN": ["AAPL", "MSFT", "GOOGL", "META", "TSLA", "NVDA", "NFLX", "CRM", "ADBE", "ORCL"],
            "META": ["AAPL", "MSFT", "GOOGL", "AMZN", "NFLX", "SNAP", "TWTR", "PINS", "UBER", "SPOT"],
            "TSLA": ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "NIO", "XPEV", "LCID", "RIVN"],
            "NVDA": ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA", "AMD", "INTC", "AVGO", "QCOM"],
        }
        
        return sector_peers.get(ticker.upper(), ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA", "NVDA", "ORCL"])
    
    async def _build_peer_row(self, ticker: str, fetch_results: Dict) -> Optional[PeerRow]:
        """Build a peer row from fetch results."""
        # Extract data for this ticker
        fundamentals_key = f"{ticker}_fundamentals"
        quotes_key = f"{ticker}_quotes"
        metadata_key = f"{ticker}_metadata"
        
        fundamentals_result = fetch_results.get(fundamentals_key)
        quotes_result = fetch_results.get(quotes_key)
        metadata_result = fetch_results.get(metadata_key)
        
        if not fundamentals_result or not quotes_result:
            return None
        
        # Build peer row data
        peer_data = {
            "ticker": ticker.upper(),
            "name": metadata_result.data.get("name") if metadata_result and metadata_result.success else ticker,
            "sector": metadata_result.data.get("sector") if metadata_result and metadata_result.success else None,
            "revenue_latest": fundamentals_result.data.get("revenue_ttm"),
            "ebitda_latest": fundamentals_result.data.get("ebitda_ttm"),
            "ebit_latest": fundamentals_result.data.get("ebit_ttm"),
            "net_income_latest": fundamentals_result.data.get("net_income_ttm"),
            "cash": fundamentals_result.data.get("cash"),
            "net_debt": fundamentals_result.data.get("net_debt"),
            "shares_out": fundamentals_result.data.get("shares_out"),
            "price": quotes_result.data.get("price"),
            "market_cap": quotes_result.data.get("market_cap"),
            "pe_trailing": fundamentals_result.data.get("pe_ratio"),
            "ev": None,  # Calculate if needed
            "ev_to_revenue": fundamentals_result.data.get("ev_to_revenue"),
            "ev_to_ebitda": fundamentals_result.data.get("ev_to_ebitda"),
            "ev_to_ebit": None,  # Calculate if needed
            "beta": fundamentals_result.data.get("beta"),
            "currency": quotes_result.data.get("currency", "USD"),
            "as_of_quotes": quotes_result.as_of,
            "as_of_fundamentals": fundamentals_result.as_of,
            "provenance": {**fundamentals_result.provenance, **quotes_result.provenance}
        }
        
        # Calculate EV if we have market cap and net debt
        if peer_data["market_cap"] and peer_data["net_debt"]:
            peer_data["ev"] = peer_data["market_cap"] + peer_data["net_debt"]
        
        return PeerRow(**peer_data)
    
    def _calculate_size_ratio(self, acquirer: DCFBundle, target: DCFBundle) -> Optional[float]:
        """Calculate size ratio between acquirer and target."""
        if acquirer.market.market_cap and target.market.market_cap:
            return acquirer.market.market_cap / target.market.market_cap
        return None


# Global bundle builder instance
bundle_builder = BundleBuilder()
