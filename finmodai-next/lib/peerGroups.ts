/**
 * Curated peer groups organized by business model.
 * Each group contains relevant ticker symbols used by the peer engine.
 */

export type BusinessModelGroup =
  | 'consumer_fintech'
  | 'b2b_fintech'
  | 'payments_networks'
  | 'merchant_acquiring'
  | 'digital_wallets'
  | 'brokerage_trading'
  | 'neobank_latam'
  | 'music_streaming'
  | 'video_streaming'
  | 'ad_supported_media'
  | 'gaming_platforms'
  | 'social_media'
  | 'creator_economy'
  | 'rideshare_mobility'
  | 'food_delivery'
  | 'travel_marketplace'
  | 'hospitality_marketplace'
  | 'ecommerce_marketplace'
  | 'cloud_hyperscale'
  | 'enterprise_saas_core'
  | 'vertical_saas'
  | 'developer_tools'
  | 'cybersecurity'
  | 'data_infrastructure'
  | 'semis_ai'
  | 'semis_analog'
  | 'compute_hardware'
  | 'consumer_electronics'
  | 'autos_ev'
  | 'autos_legacy'
  | 'energy_storage'
  | 'solar_clean_energy'
  | 'oil_gas_integrated'
  | 'oilfield_services'
  | 'industrial_automation'
  | 'logistics_freight'
  | 'aerospace_defense'
  | 'airlines'
  | 'medical_devices'
  | 'healthcare_services'
  | 'biotech_growth'
  | 'big_pharma'
  | 'retail_apparel'
  | 'retail_broadlines'
  | 'luxury_brands'
  | 'restaurants'
  | 'home_improvement'
  | 'telecom_wireless'
  | 'telecom_cable'
  | 'utilities_regulated'
  | 'reits_digital';

export const PEER_GROUPS: Record<BusinessModelGroup, string[]> = {
  consumer_fintech: ['SOFI', 'UPST', 'LC', 'AFRM', 'ALLY', 'GDOT', 'OPFI', 'ENVA', 'CURO', 'LPRO'],
  b2b_fintech: ['SQ', 'PYPL', 'ADYEY', 'MELI', 'SHOP', 'FOUR', 'WEX', 'INTU', 'FIS', 'FISV'],
  payments_networks: ['V', 'MA', 'AXP', 'DFS', 'COF', 'FIS', 'FISV', 'GPN', 'PAGS', 'STNE'],
  merchant_acquiring: ['FOUR', 'GPN', 'FIS', 'FISV', 'PAGS', 'STNE', 'PAY', 'JAMF', 'TWKS', 'TYL'],
  digital_wallets: ['PYPL', 'SQ', 'AFRM', 'NU', 'STNE', 'PAGS', 'HOOD', 'MQ', 'COIN', 'BKKT'],
  brokerage_trading: ['HOOD', 'SCHW', 'IBKR', 'MS', 'GS', 'JEF', 'COIN', 'VIRT', 'TIGR', 'AMTD'],
  neobank_latam: ['NU', 'STNE', 'PAGS', 'BBVA', 'ITUB', 'BSBR', 'BBD', 'SUPV', 'BDORY', 'BMA'],
  music_streaming: ['SPOT', 'SIRI', 'TME', 'WMG', 'UMG', 'ANGH', 'IHRT', 'ROKU', 'NFLX', 'SONO'],
  video_streaming: ['NFLX', 'ROKU', 'PARA', 'WBD', 'DIS', 'CMCSA', 'IQ', 'VIA', 'LGF.A', 'HUYA'],
  ad_supported_media: ['ROKU', 'PINS', 'SNAP', 'TTD', 'PUBM', 'MGNI', 'GOOG', 'META', 'BIDU', 'CTV'],
  gaming_platforms: ['ATVI', 'EA', 'TTWO', 'RBLX', 'U', 'SE', 'PLTK', 'ZNGA', 'HUYA', 'NTES'],
  social_media: ['META', 'SNAP', 'PINS', 'TWTR', 'BIDU', 'WB', 'BZFD', 'BMBL', 'MTCH', 'DUO'],
  creator_economy: ['FVRR', 'UPWK', 'ETSY', 'SHOP', 'MELI', 'WIX', 'JAMF', 'YELP', 'DOCN', 'TASK'],
  rideshare_mobility: ['UBER', 'LYFT', 'DASH', 'GRAB', 'DIDI', 'CAR', 'HTZ', 'RIVN', 'LCID', 'TSP'],
  food_delivery: ['DASH', 'UBER', 'GRUB', 'WTRH', 'CART', 'SE', 'ZTO', 'CELH', 'KURA', 'TSP'],
  travel_marketplace: ['BKNG', 'ABNB', 'EXPE', 'TCOM', 'TRIP', 'SABR', 'DESP', 'MMYT', 'TNL', 'LYV'],
  hospitality_marketplace: ['ABNB', 'BKNG', 'EXPE', 'TNL', 'SVC', 'MAR', 'HLT', 'HST', 'MLCO', 'MGM'],
  ecommerce_marketplace: ['AMZN', 'MELI', 'SHOP', 'SE', 'JD', 'PDD', 'BABA', 'GLBE', 'W', 'ETSY'],
  cloud_hyperscale: ['AMZN', 'MSFT', 'GOOGL', 'META', 'ORCL', 'IBM', 'CRM', 'NOW', 'SNOW', 'DDOG'],
  enterprise_saas_core: ['CRM', 'NOW', 'WDAY', 'TEAM', 'ADBE', 'INTU', 'MSFT', 'ORCL', 'SAP', 'ZEN'],
  vertical_saas: ['VEEV', 'TYL', 'AYX', 'DT', 'PAYC', 'TENB', 'APPF', 'NCNO', 'PCOR', 'AXSM'],
  developer_tools: ['SNOW', 'DDOG', 'NET', 'MDB', 'DOCN', 'PLTR', 'GTLB', 'ESTC', 'PD', 'PATH'],
  cybersecurity: ['CRWD', 'ZS', 'S', 'OKTA', 'PANW', 'FTNT', 'TENB', 'CYBR', 'VRNS', 'QLYS'],
  data_infrastructure: ['SNOW', 'MDB', 'BRZE', 'ESTC', 'PLTR', 'DT', 'DDOG', 'AFRM', 'OKTA', 'SPLK'],
  semis_ai: ['NVDA', 'AMD', 'AVGO', 'MRVL', 'SMCI', 'ASML', 'ARM', 'LRCX', 'AMAT', 'TSM'],
  semis_analog: ['TXN', 'ADI', 'ON', 'NXPI', 'MCHP', 'SWKS', 'QRVO', 'STM', 'MPWR', 'LSCC'],
  compute_hardware: ['SMCI', 'DELL', 'HPE', 'IBM', 'NTAP', 'ZBRA', 'CSCO', 'JNPR', 'FFIV', 'NTNX'],
  consumer_electronics: ['AAPL', 'SONY', 'SSNLF', 'SONO', 'GRMN', 'LOGI', 'VIVO', 'PANL', 'DENN', 'GPRO'],
  autos_ev: ['TSLA', 'RIVN', 'LCID', 'NIO', 'XPEV', 'LI', 'FSR', 'BYDDF', 'FFIE', 'NKLA'],
  autos_legacy: ['GM', 'F', 'STLA', 'TM', 'HMC', 'VWAGY', 'BMWYY', 'DAI', 'TTM', 'HYMTF'],
  energy_storage: ['ENPH', 'SEDG', 'PLL', 'QS', 'BLNK', 'CHPT', 'BE', 'PLUG', 'RUN', 'FLNC'],
  solar_clean_energy: ['RUN', 'NOVA', 'SPWR', 'JKS', 'DQ', 'CSIQ', 'SEDG', 'ENPH', 'NEP', 'AY'],
  oil_gas_integrated: ['XOM', 'CVX', 'SHEL', 'BP', 'TOT', 'COP', 'ENB', 'CNQ', 'EOG', 'PXD'],
  oilfield_services: ['SLB', 'HAL', 'BKR', 'FTI', 'CHX', 'VAL', 'OIS', 'WTI', 'NBR', 'NOV'],
  industrial_automation: ['ROK', 'ABB', 'SI', 'ETN', 'EMR', 'ITW', 'HON', 'DHR', 'CGNX', 'TER'],
  logistics_freight: ['FDX', 'UPS', 'CHRW', 'JBHT', 'XPO', 'ODFL', 'SNDR', 'ARCB', 'EXP', 'DSGX'],
  aerospace_defense: ['LMT', 'NOC', 'RTX', 'BA', 'TDG', 'TXT', 'HII', 'GD', 'HEI', 'CW'],
  airlines: ['DAL', 'AAL', 'UAL', 'LUV', 'JBLU', 'ALK', 'CPA', 'RYAAY', 'AZUL', 'SAVE'],
  medical_devices: ['ISRG', 'SYK', 'EW', 'BSX', 'ZBH', 'MDT', 'ALGN', 'PODD', 'DXCM', 'NVRO'],
  healthcare_services: ['UNH', 'HUM', 'CI', 'ELV', 'CNC', 'MOH', 'HCA', 'UHS', 'ACHC', 'SGRY'],
  biotech_growth: ['VRTX', 'REGN', 'SRPT', 'EXEL', 'ALNY', 'INCY', 'BLUE', 'BMRN', 'XLRN', 'NTLA'],
  big_pharma: ['PFE', 'MRK', 'JNJ', 'LLY', 'ABBV', 'AZN', 'GSK', 'SNY', 'BMY', 'NVS'],
  retail_apparel: ['LULU', 'NKE', 'UAA', 'GPS', 'BURL', 'URBN', 'TPR', 'CPRI', 'VFC', 'ANF'],
  retail_broadlines: ['TGT', 'WMT', 'COST', 'DG', 'DLTR', 'BBY', 'KR', 'BJ', 'AMZN', 'WBA'],
  luxury_brands: ['LVMUY', 'RACE', 'CPR', 'TPR', 'RL', 'PVH', 'BURBY', 'KER', 'MC', 'BRBY'],
  restaurants: ['MCD', 'SBUX', 'YUM', 'CMG', 'QSR', 'DRI', 'DPZ', 'WEN', 'SHAK', 'CAKE'],
  home_improvement: ['HD', 'LOW', 'TSCO', 'RH', 'W', 'WSM', 'LEG', 'TTSH', 'FBHS', 'FND'],
  telecom_wireless: ['TMUS', 'VZ', 'T', 'USM', 'VOD', 'ORAN', 'BCE', 'TEF', 'TIMB', 'CHT'],
  telecom_cable: ['CMCSA', 'CHTR', 'LBTYA', 'WOW', 'ATUS', 'CABO', 'RCI', 'TLK', 'BTI', 'ZAYO'],
  utilities_regulated: ['NEE', 'DUK', 'SO', 'AEP', 'D', 'XEL', 'EXC', 'ED', 'PEG', 'PCG'],
  reits_digital: ['EQIX', 'DLR', 'AMT', 'CCI', 'SBAC', 'CONE', 'COR', 'UNIT', 'IRM', 'NRZ'],
};

export const TICKER_TO_GROUP_OVERRIDE: Record<string, BusinessModelGroup> = {
  SOFI: 'consumer_fintech',
  UPST: 'consumer_fintech',
  LC: 'consumer_fintech',
  AFRM: 'consumer_fintech',
  PYPL: 'digital_wallets',
  SQ: 'b2b_fintech',
  SPOT: 'music_streaming',
  SIRI: 'music_streaming',
  TME: 'music_streaming',
  WMG: 'music_streaming',
  UMG: 'music_streaming',
  ANGH: 'music_streaming',
  TSLA: 'autos_ev',
  RIVN: 'autos_ev',
  LCID: 'autos_ev',
  NIO: 'autos_ev',
  XPEV: 'autos_ev',
  NVDA: 'semis_ai',
  AMD: 'semis_ai',
  AVGO: 'semis_ai',
  SMCI: 'compute_hardware',
  NFLX: 'video_streaming',
  ROKU: 'video_streaming',
  DIS: 'video_streaming',
  META: 'social_media',
  SNAP: 'social_media',
  PINS: 'social_media',
  UBER: 'rideshare_mobility',
  LYFT: 'rideshare_mobility',
  DASH: 'food_delivery',
  BKNG: 'travel_marketplace',
  ABNB: 'hospitality_marketplace',
  MELI: 'ecommerce_marketplace',
  SHOP: 'ecommerce_marketplace',
  HOOD: 'brokerage_trading',
  COIN: 'brokerage_trading',
  V: 'payments_networks',
  MA: 'payments_networks',
  VEEV: 'vertical_saas',
  CRWD: 'cybersecurity',
};

export const MEGA_CAP_TECH = new Set(['AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'NVDA', 'TSLA']);
