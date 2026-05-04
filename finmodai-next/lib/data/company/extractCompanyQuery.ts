import { inferTickerFromPrompt } from '@/lib/analyst/retrieval';
import type { CompanyQuery } from '@/lib/data/company/types';

const COMPANY_ALIASES: Array<{ pattern: RegExp; ticker: string; companyName: string }> = [
  // ── Mega-cap Tech ──────────────────────────────────────────────────────────
  { pattern: /\balphabet\b|\bgoogle\b|\bgoogl\b/i, ticker: 'GOOGL', companyName: 'Alphabet Inc.' },
  { pattern: /\bamazon(?:'s|s)?\b|\bamzn\b/i, ticker: 'AMZN', companyName: 'Amazon.com, Inc.' },
  { pattern: /\bapple\b|\baapl\b/i, ticker: 'AAPL', companyName: 'Apple Inc.' },
  { pattern: /\bmicrosoft\b|\bmsft\b/i, ticker: 'MSFT', companyName: 'Microsoft Corporation' },
  { pattern: /\bmeta\b|\bfacebook\b|\bmeta platforms\b/i, ticker: 'META', companyName: 'Meta Platforms, Inc.' },
  { pattern: /\bnvidia\b|\bnvda\b/i, ticker: 'NVDA', companyName: 'NVIDIA Corporation' },
  { pattern: /\btesla\b|\btsla\b/i, ticker: 'TSLA', companyName: 'Tesla, Inc.' },
  { pattern: /\bnetflix\b|\bnflx\b/i, ticker: 'NFLX', companyName: 'Netflix, Inc.' },

  // ── Software & Cloud ───────────────────────────────────────────────────────
  { pattern: /\bsalesforce\b|\bcrm\b/i, ticker: 'CRM', companyName: 'Salesforce, Inc.' },
  { pattern: /\bservicenow\b|\bservice now\b/i, ticker: 'NOW', companyName: 'ServiceNow, Inc.' },
  { pattern: /\bworkday\b|\bwday\b/i, ticker: 'WDAY', companyName: 'Workday, Inc.' },
  { pattern: /\bsnowflake\b/i, ticker: 'SNOW', companyName: 'Snowflake Inc.' },
  { pattern: /\bdatadog\b|\bddog\b/i, ticker: 'DDOG', companyName: 'Datadog, Inc.' },
  { pattern: /\bpalantir\b|\bpltr\b/i, ticker: 'PLTR', companyName: 'Palantir Technologies Inc.' },
  { pattern: /\bautodesk\b|\badsk\b/i, ticker: 'ADSK', companyName: 'Autodesk, Inc.' },
  { pattern: /\boracle\b|\borcl\b/i, ticker: 'ORCL', companyName: 'Oracle Corporation' },
  { pattern: /\badobe\b|\badbe\b/i, ticker: 'ADBE', companyName: 'Adobe Inc.' },
  { pattern: /\bintuit\b|\bintu\b/i, ticker: 'INTU', companyName: 'Intuit Inc.' },
  { pattern: /\bpalo alto\b|\bpanw\b/i, ticker: 'PANW', companyName: 'Palo Alto Networks, Inc.' },
  { pattern: /\bcrowdstrike\b|\bcrwd\b/i, ticker: 'CRWD', companyName: 'CrowdStrike Holdings, Inc.' },
  { pattern: /\bfortinet\b|\bftnt\b/i, ticker: 'FTNT', companyName: 'Fortinet, Inc.' },
  { pattern: /\bzscaler\b|\bzs\b/i, ticker: 'ZS', companyName: 'Zscaler, Inc.' },
  { pattern: /\bokta\b/i, ticker: 'OKTA', companyName: 'Okta, Inc.' },
  { pattern: /\bhubspot\b|\bhubs\b/i, ticker: 'HUBS', companyName: 'HubSpot, Inc.' },
  { pattern: /\batlassian\b|\bteam\b/i, ticker: 'TEAM', companyName: 'Atlassian Corporation' },
  { pattern: /\btwilio\b|\btwlo\b/i, ticker: 'TWLO', companyName: 'Twilio Inc.' },
  { pattern: /\bdocusign\b|\bdocu\b/i, ticker: 'DOCU', companyName: 'DocuSign, Inc.' },
  { pattern: /\bzoom\b|\bzm\b/i, ticker: 'ZM', companyName: 'Zoom Video Communications, Inc.' },
  { pattern: /\bshopify\b|\bshop\b/i, ticker: 'SHOP', companyName: 'Shopify Inc.' },
  { pattern: /\bblock\b|\bsquare\b|\bsq\b/i, ticker: 'SQ', companyName: 'Block, Inc.' },
  { pattern: /\bsofi\b/i, ticker: 'SOFI', companyName: 'SoFi Technologies, Inc.' },
  { pattern: /\brobinhood\b|\bhood\b/i, ticker: 'HOOD', companyName: 'Robinhood Markets, Inc.' },
  { pattern: /\btwitter\b|\bx corp\b/i, ticker: 'X', companyName: 'X Corp.' },

  // ── Semiconductors ─────────────────────────────────────────────────────────
  { pattern: /\badvanced micro devices\b|\bamd\b/i, ticker: 'AMD', companyName: 'Advanced Micro Devices, Inc.' },
  { pattern: /\bbroadcom\b|\bavgo\b/i, ticker: 'AVGO', companyName: 'Broadcom Inc.' },
  { pattern: /\bqualcomm\b|\bqcom\b/i, ticker: 'QCOM', companyName: 'Qualcomm Incorporated' },
  { pattern: /\bintel\b|\bintc\b/i, ticker: 'INTC', companyName: 'Intel Corporation' },
  { pattern: /\btexas instruments\b|\btxn\b/i, ticker: 'TXN', companyName: 'Texas Instruments Incorporated' },
  { pattern: /\bapplied materials\b|\bamat\b/i, ticker: 'AMAT', companyName: 'Applied Materials, Inc.' },
  { pattern: /\basml\b/i, ticker: 'ASML', companyName: 'ASML Holding N.V.' },
  { pattern: /\blam research\b|\blrcx\b/i, ticker: 'LRCX', companyName: 'Lam Research Corporation' },
  { pattern: /\bkla\b|\bklac\b/i, ticker: 'KLAC', companyName: 'KLA Corporation' },
  { pattern: /\bmicron\b|\bmu\b/i, ticker: 'MU', companyName: 'Micron Technology, Inc.' },
  { pattern: /\btsmc\b|\btaiwan semiconductor\b|\btsm\b/i, ticker: 'TSM', companyName: 'Taiwan Semiconductor Manufacturing' },
  { pattern: /\bmarvell\b|\bmrvl\b/i, ticker: 'MRVL', companyName: 'Marvell Technology, Inc.' },
  { pattern: /\barm holdings\b|\barm\b/i, ticker: 'ARM', companyName: 'Arm Holdings plc' },

  // ── Hardware & IT Services ─────────────────────────────────────────────────
  { pattern: /\bibm\b/i, ticker: 'IBM', companyName: 'International Business Machines Corporation' },
  { pattern: /\baccenture\b|\bacn\b/i, ticker: 'ACN', companyName: 'Accenture plc' },
  { pattern: /\bdell\b/i, ticker: 'DELL', companyName: 'Dell Technologies Inc.' },
  { pattern: /\bhp inc\b|\bhpq\b/i, ticker: 'HPQ', companyName: 'HP Inc.' },
  { pattern: /\bhewlett packard enterprise\b|\bhpe\b/i, ticker: 'HPE', companyName: 'Hewlett Packard Enterprise Company' },
  { pattern: /\bcisco\b|\bcsco\b/i, ticker: 'CSCO', companyName: 'Cisco Systems, Inc.' },

  // ── Social & Consumer Internet ─────────────────────────────────────────────
  { pattern: /\bsnap\b|\bsnapchat\b/i, ticker: 'SNAP', companyName: 'Snap Inc.' },
  { pattern: /\bpinterest\b|\bpins\b/i, ticker: 'PINS', companyName: 'Pinterest, Inc.' },
  { pattern: /\breddit\b|\brddt\b/i, ticker: 'RDDT', companyName: 'Reddit, Inc.' },
  { pattern: /\buber\b/i, ticker: 'UBER', companyName: 'Uber Technologies, Inc.' },
  { pattern: /\blyft\b/i, ticker: 'LYFT', companyName: 'Lyft, Inc.' },
  { pattern: /\bdoordash\b|\bdash\b/i, ticker: 'DASH', companyName: 'DoorDash, Inc.' },
  { pattern: /\bairbnb\b/i, ticker: 'ABNB', companyName: 'Airbnb, Inc.' },
  { pattern: /\bcoinbase\b/i, ticker: 'COIN', companyName: 'Coinbase Global, Inc.' },
  { pattern: /\bspotify\b/i, ticker: 'SPOT', companyName: 'Spotify Technology S.A.' },
  { pattern: /\broblox\b|\brblx\b/i, ticker: 'RBLX', companyName: 'Roblox Corporation' },

  // ── Gaming & Media ─────────────────────────────────────────────────────────
  { pattern: /\belectronic arts\b|\bea\b/i, ticker: 'EA', companyName: 'Electronic Arts Inc.' },
  { pattern: /\btake-two\b|\btake two\b|\bttwo\b/i, ticker: 'TTWO', companyName: 'Take-Two Interactive Software, Inc.' },
  { pattern: /\bactivision\b|\batvi\b/i, ticker: 'ATVI', companyName: 'Activision Blizzard, Inc.' },
  { pattern: /\bdisney\b|\bdis\b/i, ticker: 'DIS', companyName: 'The Walt Disney Company' },
  { pattern: /\bcomcast\b|\bcmcsa\b/i, ticker: 'CMCSA', companyName: 'Comcast Corporation' },
  { pattern: /\bwarner\b|\bwbd\b/i, ticker: 'WBD', companyName: 'Warner Bros. Discovery, Inc.' },
  { pattern: /\bparamount\b|\bpara\b/i, ticker: 'PARA', companyName: 'Paramount Global' },
  { pattern: /\bfox\b|\bfoxa\b/i, ticker: 'FOXA', companyName: 'Fox Corporation' },

  // ── Financials: Banks ──────────────────────────────────────────────────────
  { pattern: /\bjpmorgan\b|\bjp morgan\b|\bjpm\b/i, ticker: 'JPM', companyName: 'JPMorgan Chase & Co.' },
  { pattern: /\bgoldman\b|\bgoldman sachs\b/i, ticker: 'GS', companyName: 'The Goldman Sachs Group, Inc.' },
  { pattern: /\bmorgan stanley\b/i, ticker: 'MS', companyName: 'Morgan Stanley' },
  { pattern: /\bbank of america\b|\bbac\b/i, ticker: 'BAC', companyName: 'Bank of America Corporation' },
  { pattern: /\bcitigroup\b|\bciti\b/i, ticker: 'C', companyName: 'Citigroup Inc.' },
  { pattern: /\bwells fargo\b|\bwfc\b/i, ticker: 'WFC', companyName: 'Wells Fargo & Company' },
  { pattern: /\bus bancorp\b|\busb\b/i, ticker: 'USB', companyName: 'U.S. Bancorp' },
  { pattern: /\bpnc\b|\bpnc financial\b/i, ticker: 'PNC', companyName: 'The PNC Financial Services Group, Inc.' },
  { pattern: /\btruist\b|\btfc\b/i, ticker: 'TFC', companyName: 'Truist Financial Corporation' },
  { pattern: /\bregions\b|\brf\b/i, ticker: 'RF', companyName: 'Regions Financial Corporation' },

  // ── Financials: Asset Management & Exchanges ──────────────────────────────
  { pattern: /\bblackrock\b|\bblk\b/i, ticker: 'BLK', companyName: 'BlackRock, Inc.' },
  { pattern: /\bcharles schwab\b|\bschwab\b/i, ticker: 'SCHW', companyName: 'The Charles Schwab Corporation' },
  { pattern: /\bberkshire\b/i, ticker: 'BRK.B', companyName: 'Berkshire Hathaway Inc.' },
  { pattern: /\bcme group\b|\bcme\b/i, ticker: 'CME', companyName: 'CME Group Inc.' },
  { pattern: /\bice\b|\bintercontinental exchange\b/i, ticker: 'ICE', companyName: 'Intercontinental Exchange, Inc.' },
  { pattern: /\bmoody's\b|\bmoodys\b|\bmco\b/i, ticker: 'MCO', companyName: "Moody's Corporation" },
  { pattern: /\bs&p global\b|\bspgi\b/i, ticker: 'SPGI', companyName: 'S&P Global Inc.' },
  { pattern: /\bmsci\b/i, ticker: 'MSCI', companyName: 'MSCI Inc.' },
  { pattern: /\bkкr\b|\bkkr\b/i, ticker: 'KKR', companyName: 'KKR & Co. Inc.' },
  { pattern: /\bapollo\b|\bapo\b/i, ticker: 'APO', companyName: 'Apollo Global Management, Inc.' },
  { pattern: /\bblackstone\b|\bbx\b/i, ticker: 'BX', companyName: 'Blackstone Inc.' },

  // ── Financials: Payments ───────────────────────────────────────────────────
  { pattern: /\bvisa\b/i, ticker: 'V', companyName: 'Visa Inc.' },
  { pattern: /\bmastercard\b/i, ticker: 'MA', companyName: 'Mastercard Incorporated' },
  { pattern: /\bpaypal\b|\bpypl\b/i, ticker: 'PYPL', companyName: 'PayPal Holdings, Inc.' },
  { pattern: /\bamerican express\b|\bamex\b/i, ticker: 'AXP', companyName: 'American Express Company' },

  // ── Consumer & Retail ──────────────────────────────────────────────────────
  { pattern: /\bwalmart\b|\bwmt\b/i, ticker: 'WMT', companyName: 'Walmart Inc.' },
  { pattern: /\bcostco\b/i, ticker: 'COST', companyName: 'Costco Wholesale Corporation' },
  { pattern: /\btarget\b|\btgt\b/i, ticker: 'TGT', companyName: 'Target Corporation' },
  { pattern: /\bhome depot\b|\bhd\b/i, ticker: 'HD', companyName: 'The Home Depot, Inc.' },
  { pattern: /\blowe's\b|\blowes\b|\blow\b/i, ticker: 'LOW', companyName: "Lowe's Companies, Inc." },
  { pattern: /\bmcdonald's\b|\bmcdonalds\b|\bmcd\b/i, ticker: 'MCD', companyName: "McDonald's Corporation" },
  { pattern: /\bstarbucks\b|\bsbux\b/i, ticker: 'SBUX', companyName: 'Starbucks Corporation' },
  { pattern: /\bchipotle\b|\bcmg\b/i, ticker: 'CMG', companyName: 'Chipotle Mexican Grill, Inc.' },
  { pattern: /\byum brands\b|\byum\b/i, ticker: 'YUM', companyName: 'Yum! Brands, Inc.' },
  { pattern: /\bdunkin\b|\brestaurant brands\b|\bqsr\b/i, ticker: 'QSR', companyName: 'Restaurant Brands International Inc.' },
  { pattern: /\bnike\b|\bnke\b/i, ticker: 'NKE', companyName: 'Nike, Inc.' },
  { pattern: /\blululemon\b|\blulu\b/i, ticker: 'LULU', companyName: 'Lululemon Athletica Inc.' },
  { pattern: /\btjx\b|\btj maxx\b|\bmarshalls\b/i, ticker: 'TJX', companyName: 'The TJX Companies, Inc.' },
  { pattern: /\bross stores\b|\bross\b|\brost\b/i, ticker: 'ROST', companyName: 'Ross Stores, Inc.' },
  { pattern: /\bdollar general\b|\bdg\b/i, ticker: 'DG', companyName: 'Dollar General Corporation' },
  { pattern: /\bdollar tree\b|\bdltr\b/i, ticker: 'DLTR', companyName: 'Dollar Tree, Inc.' },
  { pattern: /\bkroger\b|\bkr\b/i, ticker: 'KR', companyName: 'The Kroger Co.' },
  { pattern: /\bprocter.*gamble\b|\bp&g\b|\bpg\b/i, ticker: 'PG', companyName: 'The Procter & Gamble Company' },
  { pattern: /\bcolgate\b|\bcl\b/i, ticker: 'CL', companyName: 'Colgate-Palmolive Company' },
  { pattern: /\bkimberly.clark\b|\bkmb\b/i, ticker: 'KMB', companyName: 'Kimberly-Clark Corporation' },
  { pattern: /\bunilever\b|\bul\b/i, ticker: 'UL', companyName: 'Unilever PLC' },
  { pattern: /\bnestlé\b|\bnestle\b|\bnsrgy\b/i, ticker: 'NSRGY', companyName: 'Nestlé S.A.' },
  { pattern: /\bpepsi\b|\bpepsico\b|\bpep\b/i, ticker: 'PEP', companyName: 'PepsiCo, Inc.' },
  { pattern: /\bcoca.cola\b|\bcoke\b|\bko\b/i, ticker: 'KO', companyName: 'The Coca-Cola Company' },
  { pattern: /\bmondelez\b|\bmdlz\b/i, ticker: 'MDLZ', companyName: 'Mondelez International, Inc.' },
  { pattern: /\bkraft heinz\b|\bkhc\b/i, ticker: 'KHC', companyName: 'The Kraft Heinz Company' },
  { pattern: /\bgeneral mills\b|\bgis\b/i, ticker: 'GIS', companyName: 'General Mills, Inc.' },
  { pattern: /\bkellogg\b|\bkelanova\b|\bk\b/i, ticker: 'K', companyName: 'Kellanova' },
  { pattern: /\bwhole foods\b/i, ticker: 'AMZN', companyName: 'Amazon.com, Inc.' },

  // ── Healthcare: Managed Care & Pharma Distribution ─────────────────────────
  { pattern: /\bunitedhealth\b|\bunh\b/i, ticker: 'UNH', companyName: 'UnitedHealth Group Incorporated' },
  { pattern: /\belevance\b|\banthem\b|\belv\b/i, ticker: 'ELV', companyName: 'Elevance Health, Inc.' },
  { pattern: /\bcigna\b|\bci\b/i, ticker: 'CI', companyName: 'The Cigna Group' },
  { pattern: /\bhumana\b|\bhum\b/i, ticker: 'HUM', companyName: 'Humana Inc.' },
  { pattern: /\bcvs health\b|\bcvs\b/i, ticker: 'CVS', companyName: 'CVS Health Corporation' },
  { pattern: /\bwalgreens\b|\bwba\b/i, ticker: 'WBA', companyName: 'Walgreens Boots Alliance, Inc.' },
  { pattern: /\bmckesson\b|\bmck\b/i, ticker: 'MCK', companyName: 'McKesson Corporation' },

  // ── Healthcare: Pharma & Biotech ───────────────────────────────────────────
  { pattern: /\bjohnson.*johnson\b|\bjnj\b/i, ticker: 'JNJ', companyName: 'Johnson & Johnson' },
  { pattern: /\bpfizer\b|\bpfe\b/i, ticker: 'PFE', companyName: 'Pfizer Inc.' },
  { pattern: /\beli lilly\b|\belly\b|\blly\b/i, ticker: 'LLY', companyName: 'Eli Lilly and Company' },
  { pattern: /\babbvie\b|\babbv\b/i, ticker: 'ABBV', companyName: 'AbbVie Inc.' },
  { pattern: /\bmerck\b|\bmrk\b/i, ticker: 'MRK', companyName: 'Merck & Co., Inc.' },
  { pattern: /\bbristol.myers\b|\bbristol myers\b|\bbmy\b/i, ticker: 'BMY', companyName: 'Bristol-Myers Squibb Company' },
  { pattern: /\bastrazeneca\b|\bazn\b/i, ticker: 'AZN', companyName: 'AstraZeneca PLC' },
  { pattern: /\bnovo nordisk\b|\bnvo\b/i, ticker: 'NVO', companyName: 'Novo Nordisk A/S' },
  { pattern: /\bamgen\b|\bamgn\b/i, ticker: 'AMGN', companyName: 'Amgen Inc.' },
  { pattern: /\bgilead\b|\bgild\b/i, ticker: 'GILD', companyName: 'Gilead Sciences, Inc.' },
  { pattern: /\bbiogen\b|\bbiib\b/i, ticker: 'BIIB', companyName: 'Biogen Inc.' },
  { pattern: /\bregeneron\b|\bregn\b/i, ticker: 'REGN', companyName: 'Regeneron Pharmaceuticals, Inc.' },
  { pattern: /\bvertex\b|\bvrtx\b/i, ticker: 'VRTX', companyName: 'Vertex Pharmaceuticals Incorporated' },
  { pattern: /\bmoderna\b|\bmrna\b/i, ticker: 'MRNA', companyName: 'Moderna, Inc.' },
  { pattern: /\bbiontech\b|\bbntx\b/i, ticker: 'BNTX', companyName: 'BioNTech SE' },
  { pattern: /\bilumina\b|\bilmn\b/i, ticker: 'ILMN', companyName: 'Illumina, Inc.' },
  { pattern: /\bintuitive surgical\b|\bisrg\b/i, ticker: 'ISRG', companyName: 'Intuitive Surgical, Inc.' },
  { pattern: /\bmedtronic\b|\bmdt\b/i, ticker: 'MDT', companyName: 'Medtronic plc' },
  { pattern: /\bstryker\b|\bsyk\b/i, ticker: 'SYK', companyName: 'Stryker Corporation' },
  { pattern: /\bboston scientific\b|\bbsx\b/i, ticker: 'BSX', companyName: 'Boston Scientific Corporation' },
  { pattern: /\bedwards lifesciences\b|\bew\b/i, ticker: 'EW', companyName: 'Edwards Lifesciences Corporation' },
  { pattern: /\bdanaher\b|\bdhr\b/i, ticker: 'DHR', companyName: 'Danaher Corporation' },
  { pattern: /\babbott\b|\babt\b/i, ticker: 'ABT', companyName: 'Abbott Laboratories' },
  { pattern: /\bthermo fisher\b|\btmo\b/i, ticker: 'TMO', companyName: 'Thermo Fisher Scientific Inc.' },

  // ── Energy ─────────────────────────────────────────────────────────────────
  { pattern: /\bexxon\b|\bexxonmobil\b|\bxom\b/i, ticker: 'XOM', companyName: 'Exxon Mobil Corporation' },
  { pattern: /\bchevron\b|\bcvx\b/i, ticker: 'CVX', companyName: 'Chevron Corporation' },
  { pattern: /\bconocophillips\b|\bcop\b/i, ticker: 'COP', companyName: 'ConocoPhillips' },
  { pattern: /\beog resources\b|\beog\b/i, ticker: 'EOG', companyName: 'EOG Resources, Inc.' },
  { pattern: /\bschlumberger\b|\bslb\b/i, ticker: 'SLB', companyName: 'SLB' },
  { pattern: /\bhalliburton\b|\bhal\b/i, ticker: 'HAL', companyName: 'Halliburton Company' },
  { pattern: /\bnext era\b|\bnextera\b|\bnee\b/i, ticker: 'NEE', companyName: 'NextEra Energy, Inc.' },
  { pattern: /\bdukeenergy\b|\bduke energy\b|\bduk\b/i, ticker: 'DUK', companyName: 'Duke Energy Corporation' },

  // ── Industrials & Defense ──────────────────────────────────────────────────
  { pattern: /\bcaterpillar\b|\bcat\b/i, ticker: 'CAT', companyName: 'Caterpillar Inc.' },
  { pattern: /\bdeere\b|\bjohn deere\b|\bde\b/i, ticker: 'DE', companyName: 'Deere & Company' },
  { pattern: /\b3m\b|\bmmm\b/i, ticker: 'MMM', companyName: '3M Company' },
  { pattern: /\bhoneywell\b|\bhon\b/i, ticker: 'HON', companyName: 'Honeywell International Inc.' },
  { pattern: /\bge aerospace\b|\bgeneral electric\b|\bge\b/i, ticker: 'GE', companyName: 'GE Aerospace' },
  { pattern: /\bunion pacific\b|\bunp\b/i, ticker: 'UNP', companyName: 'Union Pacific Corporation' },
  { pattern: /\bups\b|\bunited parcel\b/i, ticker: 'UPS', companyName: 'United Parcel Service, Inc.' },
  { pattern: /\bfedex\b|\bfdx\b/i, ticker: 'FDX', companyName: 'FedEx Corporation' },
  { pattern: /\blockheed\b|\blmt\b/i, ticker: 'LMT', companyName: 'Lockheed Martin Corporation' },
  { pattern: /\bnorthrop\b|\bnoc\b/i, ticker: 'NOC', companyName: 'Northrop Grumman Corporation' },
  { pattern: /\bgeneral dynamics\b|\bgd\b/i, ticker: 'GD', companyName: 'General Dynamics Corporation' },
  { pattern: /\brtx\b|\brtx corporation\b|\brtx corp\b|\braytheon\b/i, ticker: 'RTX', companyName: 'RTX Corporation' },
  { pattern: /\bboeing\b|\bba\b/i, ticker: 'BA', companyName: 'The Boeing Company' },
  { pattern: /\bairbus\b|\beadsy\b/i, ticker: 'EADSY', companyName: 'Airbus SE' },
  { pattern: /\bl3harris\b|\blhx\b/i, ticker: 'LHX', companyName: 'L3Harris Technologies, Inc.' },

  // ── Telecom ────────────────────────────────────────────────────────────────
  { pattern: /\bat&t\b|\batt\b/i, ticker: 'T', companyName: 'AT&T Inc.' },
  { pattern: /\bverizon\b|\bvz\b/i, ticker: 'VZ', companyName: 'Verizon Communications Inc.' },
  { pattern: /\bt-mobile\b|\btmobile\b|\btmus\b/i, ticker: 'TMUS', companyName: 'T-Mobile US, Inc.' },

  // ── Autos ──────────────────────────────────────────────────────────────────
  { pattern: /\bgeneral motors\b|\bgm\b/i, ticker: 'GM', companyName: 'General Motors Company' },
  { pattern: /\bford\b|\bford motor\b/i, ticker: 'F', companyName: 'Ford Motor Company' },
  { pattern: /\brivian\b|\brivn\b/i, ticker: 'RIVN', companyName: 'Rivian Automotive, Inc.' },
  { pattern: /\blucid\b|\blcid\b/i, ticker: 'LCID', companyName: 'Lucid Group, Inc.' },
  { pattern: /\bstellantis\b|\bstla\b/i, ticker: 'STLA', companyName: 'Stellantis N.V.' },
  { pattern: /\btoyota\b|\btm\b/i, ticker: 'TM', companyName: 'Toyota Motor Corporation' },

  // ── Airlines & Travel ──────────────────────────────────────────────────────
  { pattern: /\bdelta\b|\bdal\b/i, ticker: 'DAL', companyName: 'Delta Air Lines, Inc.' },
  { pattern: /\bunited airlines\b|\bual\b/i, ticker: 'UAL', companyName: 'United Airlines Holdings, Inc.' },
  { pattern: /\bsouthwest\b|\bluv\b/i, ticker: 'LUV', companyName: 'Southwest Airlines Co.' },
  { pattern: /\bamerican airlines\b|\baal\b/i, ticker: 'AAL', companyName: 'American Airlines Group Inc.' },
  { pattern: /\bbooking\b|\bbkng\b/i, ticker: 'BKNG', companyName: 'Booking Holdings Inc.' },
  { pattern: /\bexpedia\b|\bexpe\b/i, ticker: 'EXPE', companyName: 'Expedia Group, Inc.' },
  { pattern: /\bmarriott\b|\bmar\b/i, ticker: 'MAR', companyName: 'Marriott International, Inc.' },
  { pattern: /\bhilton\b|\bhlt\b/i, ticker: 'HLT', companyName: 'Hilton Worldwide Holdings Inc.' },
  { pattern: /\bcarnival\b|\bccl\b/i, ticker: 'CCL', companyName: 'Carnival Corporation' },
  { pattern: /\broyal caribbean\b|\brcl\b/i, ticker: 'RCL', companyName: 'Royal Caribbean Cruises Ltd.' },

  // ── Real Estate ────────────────────────────────────────────────────────────
  { pattern: /\bamerican tower\b|\bamt\b/i, ticker: 'AMT', companyName: 'American Tower Corporation' },
  { pattern: /\bprologis\b|\bpld\b/i, ticker: 'PLD', companyName: 'Prologis, Inc.' },
  { pattern: /\bpublic storage\b|\bpsa\b/i, ticker: 'PSA', companyName: 'Public Storage' },
  { pattern: /\bsimon property\b|\bspg\b/i, ticker: 'SPG', companyName: 'Simon Property Group, Inc.' },
  { pattern: /\bequinix\b|\beqix\b/i, ticker: 'EQIX', companyName: 'Equinix, Inc.' },

  // ── Emerging & International ───────────────────────────────────────────────
  { pattern: /\balibaba\b|\bbaba\b/i, ticker: 'BABA', companyName: 'Alibaba Group Holding Limited' },
  { pattern: /\btencent\b|\btcehy\b/i, ticker: 'TCEHY', companyName: 'Tencent Holdings Limited' },
  { pattern: /\bbaidu\b|\bbidu\b/i, ticker: 'BIDU', companyName: 'Baidu, Inc.' },
  { pattern: /\bjd.com\b|\bjd\b/i, ticker: 'JD', companyName: 'JD.com, Inc.' },
  { pattern: /\bmeituan\b|\bmpngy\b/i, ticker: 'MPNGY', companyName: 'Meituan' },
  { pattern: /\bsamsun\b|\bssnlf\b/i, ticker: 'SSNLF', companyName: 'Samsung Electronics Co., Ltd.' },
  { pattern: /\bsap\b/i, ticker: 'SAP', companyName: 'SAP SE' },
  { pattern: /\bvolkswagen\b|\bvwagy\b/i, ticker: 'VWAGY', companyName: 'Volkswagen AG' },
  { pattern: /\blouis vuitton\b|\blvmh\b|\blvmuy\b/i, ticker: 'LVMUY', companyName: 'LVMH Moët Hennessy Louis Vuitton SE' },
  { pattern: /\bhermes\b|\bhmzy\b/i, ticker: 'HMZY', companyName: 'Hermès International S.A.' },

  // ── Crypto & Fintech ───────────────────────────────────────────────────────
  { pattern: /\bmicrostrategy\b|\bmstr\b/i, ticker: 'MSTR', companyName: 'MicroStrategy Incorporated' },
  { pattern: /\bmarathon digital\b|\bmara\b/i, ticker: 'MARA', companyName: 'Marathon Digital Holdings, Inc.' },
  { pattern: /\briot platforms\b|\briot\b/i, ticker: 'RIOT', companyName: 'Riot Platforms, Inc.' },
  { pattern: /\bgrayscale\b|\bgbtc\b/i, ticker: 'GBTC', companyName: 'Grayscale Bitcoin Trust' },
];

const NON_COMPANY_TICKER_STOPWORDS = new Set(['DCF', 'LBO', 'IPO', 'EV', 'IRR', 'MOIC']);

function normalizeTicker(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.trim().toUpperCase();
  return /^[A-Z.]{1,10}$/.test(cleaned) ? cleaned : undefined;
}

function extractCompanyNameFromPrompt(prompt: string): string | undefined {
  const match =
    prompt.match(/(?:for|of|on|analyze)\s+([A-Za-z0-9.'& -]+?)(?:\s+(?:with|at|growing|using|based|assuming|starting|raising)\b|$)/i) ||
    prompt.match(/(?:model|analysis)\s+for\s+([A-Za-z0-9.'& -]+)$/i);

  const value = match?.[1]?.trim().replace(/[.,]+$/, '');
  if (!value) return undefined;
  if (/^(a|an|the)\s+/i.test(value)) return undefined;
  if (/^(company|business|startup|saas company)$/i.test(value)) return undefined;
  return value;
}

export function extractCompanyQuery(input: CompanyQuery): { ticker?: string; companyName?: string } {
  const ticker = normalizeTicker(input.ticker);
  const companyName = input.companyName?.trim() || undefined;
  const prompt = input.prompt?.trim() || '';

  if (ticker || companyName) {
    return { ticker, companyName };
  }

  if (prompt) {
    const inferredTicker = normalizeTicker(inferTickerFromPrompt(prompt));
    if (inferredTicker && !NON_COMPANY_TICKER_STOPWORDS.has(inferredTicker)) {
      const alias = COMPANY_ALIASES.find((candidate) => candidate.ticker === inferredTicker);
      return {
        ticker: inferredTicker,
        companyName: alias?.companyName,
      };
    }

    for (const alias of COMPANY_ALIASES) {
      if (alias.pattern.test(prompt)) {
        return { ticker: alias.ticker, companyName: alias.companyName };
      }
    }

    const extractedName = extractCompanyNameFromPrompt(prompt);
    if (extractedName) return { companyName: extractedName };
  }

  return {};
}
