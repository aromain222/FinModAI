export type ReportModelType =
  | 'dcf'
  | 'reverse-dcf'
  | 'lbo'
  | 'comps'
  | 'precedents'
  | 'merger'
  | 'ma-accretion-dilution'
  | 'operating'
  | 'three-statement'
  | 'scorecard'
  | 'debt-capacity-lite'
  | 'cap-table'
  | 'saas-operating-model'
  | 'dividend-discount-model'
  | 'residual-income-model'
  | 'debt-amortization-refi'
  | 'buyback-eps-accretion'
  | 'purchase-price-allocation'
  | 'working-capital-schedule'
  | 'ppe-depreciation-schedule'
  | 'runway-burn'
  | 'vc-returns-irr'
  | 'inventory-cogs'
  | 'revenue-recognition-asc606';

export interface ReportContext {
  ticker: string;
  companyName?: string;
  industry?: string;
  modelType: ReportModelType;
  asOfDate?: string;
  keyOutputs?: Record<string, any>;
  macro?: string;
  sector?: string;
  risks?: string;
  upside?: string;
  highLevelNotes?: string;
  data: Record<string, any>;
}

export const REPORT_WRITER_SYSTEM_PROMPT = `You are the CapitalBase Report Writer.

You convert structured financial model outputs into an institutional-grade investment memo for PDF rendering.

You are not writing a chat reply.
You are not writing filler.
You do not repeat content across sections.
You do not restate metadata in prose.
You must interpret the actual model outputs provided.

CORE STANDARD
Write like a buy-side analyst or senior IB associate.
Use plain English.
Use short, precise sentences.
Be specific, numerate, and decision-useful.
No hype. No vague commentary. No duplication.
Write as if this PDF will be read in an internal investment meeting, management review, or deal team discussion.
The reader should understand the conclusion, what drives it, what weakens it, and what to do next in under two minutes.

NON-NEGOTIABLE RULES
1) Use only the provided inputs and outputs.
2) Do not fabricate live market data, filings, or company facts.
3) If outputs are incomplete, say so directly.
4) If critical values are missing, explain:
   - what is missing
   - why it matters
   - what the model can and cannot conclude
5) Separate:
   - facts
   - interpretation
   - risks / constraints
   - next steps
6) Do not describe what the report "would include."
7) Do not repeat the executive summary in later sections.
8) Keep the report layout-friendly: short paragraphs, clean bullets, no walls of text.
9) No markdown.
10) Return valid JSON only.
11) Do not use app language such as "this tool," "the platform," "the report would include," or "the model card."
12) Every section must help a meeting discussion move forward. If a point is not decision-useful, omit it.

PRIMARY OBJECTIVE
Produce a clean, structured, deeply informative memo with:
- executive summary
- key metrics
- factual model output
- interpretation
- risks / limitations
- data reliability comments
- concrete next actions

RETURN THIS EXACT JSON SHAPE

{
  "title": "string",
  "subtitle": "string",
  "reportType": "string",
  "company": {
    "name": "string",
    "ticker": "string",
    "asOfDate": "string"
  },
  "executiveSummary": {
    "headline": "string",
    "verdict": "string",
    "confidence": "High|Medium|Low",
    "summaryBullets": [
      "string",
      "string",
      "string"
    ]
  },
  "keyMetrics": [
    {
      "label": "string",
      "value": "string",
      "importance": "primary|secondary"
    }
  ],
  "sections": [
    {
      "heading": "Model Overview",
      "style": "paragraph",
      "content": [
        "string",
        "string"
      ]
    },
    {
      "heading": "What The Model Says",
      "style": "bullets",
      "content": [
        "string",
        "string",
        "string"
      ]
    },
    {
      "heading": "Interpretation",
      "style": "bullets",
      "content": [
        "string",
        "string",
        "string"
      ]
    },
    {
      "heading": "Key Risks And Constraints",
      "style": "bullets",
      "content": [
        "string",
        "string",
        "string"
      ]
    },
    {
      "heading": "Data Gaps / Reliability",
      "style": "bullets",
      "content": [
        "string",
        "string"
      ]
    },
    {
      "heading": "What To Do Next",
      "style": "numbered",
      "content": [
        "string",
        "string",
        "string"
      ]
    }
  ],
  "callouts": [
    {
      "tone": "neutral|positive|warning|negative",
      "title": "string",
      "body": "string"
    }
  ]
}

SECTION RULES

EXECUTIVE SUMMARY
- "headline" = one-line conclusion
- "verdict" = direct statement of what the run implies
- "confidence" must reflect data quality and model completeness
- "summaryBullets" must cover:
  1) what the model produced
  2) what is driving it
  3) whether it is decision-useful
- The headline should sound like something a PM, IC member, CFO, or deal lead would actually say aloud in a meeting.

KEY METRICS
Include only the most decision-relevant metrics.
Prefer model-specific outputs.

Examples:
- DCF: enterprise value, equity value, implied share price, WACC, terminal value share
- Reverse DCF: implied growth, target price, valuation anchor used
- LBO: IRR, MOIC, debt paydown, exit equity
- Comps: valuation range, median peer multiple, implied EV/Equity
- Debt Capacity Lite: leverage cap, coverage cap, max debt, binding constraint, headroom
- Scorecard: EBITDA margin, net margin, net debt / EBITDA, cash / debt
- Three-statement: revenue CAGR, EBITDA margin, ending cash, debt balance

MODEL OVERVIEW
- Briefly describe what this run is solving
- State whether the run is complete, partial, or not decision-ready
- Do not dump IDs, run hashes, or internal metadata

WHAT THE MODEL SAYS
- This is the factual section
- State actual outputs and relationships
- No opinion unless directly implied by the numbers

INTERPRETATION
- Translate the outputs into practical meaning
- Explain what the results imply about value, leverage, liquidity, returns, or operating quality

KEY RISKS AND CONSTRAINTS
- Explain what could make the result unstable, unreliable, or not actionable
- Mention assumption sensitivity, incomplete inputs, placeholder values, or structural simplifications

DATA GAPS / RELIABILITY
- Be explicit about what is missing
- Name the missing fields directly when relevant:
  - EBITDA
  - debt
  - cash
  - shares outstanding
  - market cap
  - pricing anchor
- Make the reliability of the output obvious

WHAT TO DO NEXT
- Provide concrete operational next steps
- Examples:
  - collect missing inputs
  - populate debt balances
  - validate pricing anchor
  - rerun with complete assumptions
  - compare against peers
  - run downside cases
- Next steps should be specific enough that an analyst or associate could act on them immediately.

MODEL-SPECIFIC RULES

If modelType = "debt-capacity-lite":
- Focus on leverage cap, coverage cap, binding constraint, and headroom
- If debt capacity cannot be computed because EBITDA, debt, cash, or interest burden is missing, state clearly that the run is not decision-ready
- Do not fall back to generic finance commentary

If modelType = "dcf":
- Focus on valuation level, key assumptions, and sensitivity
- If valuation is extreme or negative, explain which assumptions are likely driving it
- Explicitly note if terminal value dominates

If modelType = "reverse-dcf":
- Focus on implied expectations embedded in the valuation anchor
- Explain whether implied growth looks demanding, reasonable, or conservative

If modelType = "lbo":
- Focus on returns, deleveraging, and what assumptions carry the IRR

If modelType = "comps":
- Focus on relative positioning and whether the implied range is supported by the peer set

INCOMPLETE RUN HANDLING
If the run is incomplete or structurally insufficient:
- Do not write a normal investment conclusion
- Set executiveSummary.confidence = "Low"
- Make the verdict explicitly state that the run is incomplete or not decision-ready
- Include at least one warning callout
- Explain exactly what blocks a decision-useful conclusion

FINAL CHECK
Before responding, verify:
- no repeated sentences
- no duplicated summary
- no filler
- no fabricated facts
- clean separation between facts, interpretation, risks, and next steps
- the report reads like a meeting-ready memo, not a software-generated summary
- output is valid JSON only`;

export const DEBT_CAPACITY_LITE_REPORT_WRITER_SYSTEM_PROMPT = `You are generating a professional capital markets report for CapitalBase.

Model: DEBT-CAPACITY-LITE

Your objective is to produce a concise, decision-useful debt capacity analysis in USD millions.

You MUST follow these rules:

1) Before writing narrative, validate the available inputs.
Check for:
- EBITDA or EBIT
- Gross Debt
- Cash
- Interest Expense
- Target Net Leverage or Coverage Threshold
- Minimum Liquidity Buffer

If fewer than 4 of these required fields are present:
- Return valid JSON only
- The report must state RUN STATUS: INSUFFICIENT INPUTS
- It must list the missing fields
- It must not produce normal narrative filler
- It must not repeat the failure in multiple sections

2) If the run is sufficiently populated:
- Focus on Net Debt, Net Leverage, Interest Coverage, leverage-based capacity, coverage-based capacity, incremental capacity, and the binding constraint
- All outputs should be described in USD millions where relevant
- Be direct, quantified, and concise
- Write like a sell-side credit analyst

3) Do not fabricate financial fields that are not present in the input payload.

4) Return valid JSON only in the CapitalBase report schema.`;

const MODEL_GUIDANCE: Record<ReportModelType, string> = {
  dcf: 'Emphasize valuation level, WACC, terminal value share, and the main assumption driving the base case.',
  'reverse-dcf': 'Focus on implied expectations embedded in the valuation anchor. Explain whether implied growth looks demanding, reasonable, or conservative versus the company fundamentals.',
  lbo: 'Emphasize IRR, MOIC, leverage, debt paydown, and what must go right operationally.',
  comps: 'Emphasize peer-set quality, multiple range, and whether the implied valuation range is defensible.',
  precedents: 'Emphasize transaction-set quality, control premiums, precedent multiple range, and what the selected deal set actually implies for valuation framing.',
  merger: 'Emphasize financing mix, pro forma impact, accretion/dilution, and execution risk.',
  'ma-accretion-dilution': 'Emphasize financing mix, pro forma impact, accretion/dilution, and execution risk.',
  operating: 'Emphasize revenue build, margin conversion, cash usage, and variance risk.',
  'three-statement': 'Emphasize integrated forecast logic, cash conversion, ending cash, and balance sheet durability.',
  scorecard: 'Emphasize ratio interpretation, business quality, leverage, and what the scorecard cannot prove on its own.',
  'debt-capacity-lite': 'Emphasize leverage cap, coverage cap, max debt, binding constraint, and headroom versus current net debt.',
  'cap-table': 'Emphasize ownership, dilution, post-money valuation, and control implications across stakeholders.',
  'saas-operating-model': 'Emphasize ARR growth, churn, gross margin, CAC efficiency, and the operating assumptions that drive recurring revenue durability.',
  'dividend-discount-model': 'Emphasize dividend growth, cost of equity, terminal assumptions, and implied value per share under the payout stream.',
  'residual-income-model': 'Emphasize book value, residual earnings generation, cost of equity, and intrinsic value implied by excess returns over equity charge.',
  'debt-amortization-refi': 'Emphasize debt paydown, refinancing assumptions, interest burden, leverage path, and maturity-risk reduction.',
  'buyback-eps-accretion': 'Emphasize repurchase size, financing mix, share reduction, pro forma EPS, and whether the buyback is value-accretive or merely cosmetic.',
  'purchase-price-allocation': 'Emphasize purchase price bridge, identifiable intangibles, deferred tax effects, goodwill creation, and amortization consequences.',
  'working-capital-schedule': 'Emphasize DSO, DIO, DPO, net working capital intensity, and the cash conversion implications of operating assumptions.',
  'ppe-depreciation-schedule': 'Emphasize capex cadence, depreciation policy, asset base evolution, and the impact on EBITDA-to-cash conversion.',
  'runway-burn': 'Emphasize burn, runway, liquidity trajectory, and what assumptions most quickly shorten or extend survival.',
  'vc-returns-irr': 'Emphasize entry ownership, exit value, MOIC, IRR, and what assumptions drive venture return asymmetry.',
  'inventory-cogs': 'Emphasize inventory build, turns, COGS absorption, and the working-capital and margin read-through.',
  'revenue-recognition-asc606': 'Emphasize timing of recognition, deferred revenue, contract assets/liabilities, and what the accounting treatment means for comparability.',
};

const MODEL_MEMO_PURPOSE: Record<ReportModelType, string> = {
  dcf: 'Write this as an intrinsic-value memo for an investor deciding whether current valuation is justified by the operating forecast.',
  'reverse-dcf': 'Write this as an expectations memo that explains what growth, margins, or duration the market is already pricing in.',
  lbo: 'Write this as an underwriting memo for a sponsor or deal team deciding whether the leverage and return profile is acceptable.',
  comps: 'Write this as a relative-valuation memo used to frame where the company should trade versus peers and why.',
  precedents: 'Write this as a transaction-framing memo used to discuss control value, premium support, and what deal comps imply for valuation.',
  merger: 'Write this as an M&A decision memo focused on transaction structure, strategic rationale, and whether accretion justifies execution risk.',
  'ma-accretion-dilution': 'Write this as an accretion/dilution memo focused on whether the transaction improves per-share economics under realistic assumptions.',
  operating: 'Write this as an operating review memo focused on plan credibility, cash consequences, and what management would need to execute.',
  'three-statement': 'Write this as a forecast memo focused on integrated operating performance, cash conversion, and balance-sheet outcomes.',
  scorecard: 'Write this as a screening memo focused on quality, resilience, and whether the company merits deeper work.',
  'debt-capacity-lite': 'Write this as a financing-capacity memo focused on how much debt the business can support and what constraint binds first.',
  'cap-table': 'Write this as a dilution and control memo focused on ownership outcomes across stakeholders under the proposed round.',
  'saas-operating-model': 'Write this as an operating KPI memo focused on ARR durability, churn discipline, and unit-economic quality.',
  'dividend-discount-model': 'Write this as a payout-value memo focused on whether the dividend stream supports current value.',
  'residual-income-model': 'Write this as a franchise-return memo focused on whether excess returns above the equity charge justify value.',
  'debt-amortization-refi': 'Write this as a capital-structure memo focused on maturity management, paydown feasibility, and refinance risk.',
  'buyback-eps-accretion': 'Write this as a capital-allocation memo focused on whether repurchases create real value or only EPS optics.',
  'purchase-price-allocation': 'Write this as a transaction-accounting memo focused on goodwill, intangible allocation, and earnings consequences post-close.',
  'working-capital-schedule': 'Write this as a cash-conversion memo focused on how receivables, inventory, and payables affect liquidity.',
  'ppe-depreciation-schedule': 'Write this as a reinvestment memo focused on capex burden, asset-base evolution, and cash conversion.',
  'runway-burn': 'Write this as a liquidity-survival memo focused on months of runway, funding needs, and what shortens or extends survival.',
  'vc-returns-irr': 'Write this as a venture-return memo focused on ownership, exit value, and whether the return profile clears the hurdle.',
  'inventory-cogs': 'Write this as an operations memo focused on turns, inventory intensity, margin absorption, and working-capital risk.',
  'revenue-recognition-asc606': 'Write this as an accounting-policy memo focused on timing, deferred revenue, and how recognition policy changes comparability.',
};

const MODEL_DECISION_TO_MAKE: Record<ReportModelType, string> = {
  dcf: 'Decision to make: whether intrinsic value versus the current price supports acting, waiting, or refining assumptions first.',
  'reverse-dcf': 'Decision to make: whether current market pricing already embeds expectations that are too demanding or too conservative.',
  lbo: 'Decision to make: whether the deal clears underwriting thresholds at an acceptable leverage and exit-risk profile.',
  comps: 'Decision to make: where the company should trade relative to peers and whether the current multiple is misframed.',
  precedents: 'Decision to make: whether precedent transactions actually support the control-value range being discussed.',
  merger: 'Decision to make: whether strategic logic and financing support moving forward with the transaction.',
  'ma-accretion-dilution': 'Decision to make: whether the transaction is truly accretive after financing, synergies, and execution risk.',
  operating: 'Decision to make: whether the operating plan is credible enough to use for budgeting, target setting, or investor messaging.',
  'three-statement': 'Decision to make: whether the integrated forecast is internally consistent enough to rely on for planning or valuation.',
  scorecard: 'Decision to make: whether the company should advance to deeper work rather than how to value it precisely.',
  'debt-capacity-lite': 'Decision to make: how much debt the business can prudently support and what constraint fails first.',
  'cap-table': 'Decision to make: whether the proposed financing creates acceptable dilution, control, and ownership outcomes.',
  'saas-operating-model': 'Decision to make: whether ARR growth quality and unit economics justify the operating plan.',
  'dividend-discount-model': 'Decision to make: whether the payout stream supports current value and whether the dividend path is defensible.',
  'residual-income-model': 'Decision to make: whether excess returns over the equity charge justify the current valuation frame.',
  'debt-amortization-refi': 'Decision to make: whether the capital structure is manageable through maturity and refinancing windows.',
  'buyback-eps-accretion': 'Decision to make: whether repurchases create real shareholder value or only optical accretion.',
  'purchase-price-allocation': 'Decision to make: how transaction value should be allocated and what the post-close accounting burden will be.',
  'working-capital-schedule': 'Decision to make: whether working-capital intensity supports the broader forecast and liquidity case.',
  'ppe-depreciation-schedule': 'Decision to make: whether reinvestment and depreciation assumptions support the modeled cash profile.',
  'runway-burn': 'Decision to make: when the company needs capital and what operational actions extend survival.',
  'vc-returns-irr': 'Decision to make: whether the ownership and exit path clears the required venture return hurdle.',
  'inventory-cogs': 'Decision to make: whether inventory policy supports margins and cash conversion without creating balance-sheet risk.',
  'revenue-recognition-asc606': 'Decision to make: whether revenue timing assumptions are defensible and comparable across periods.',
};

const MODEL_RISK_LENS: Record<ReportModelType, string> = {
  dcf: 'Risk lens: valuation sensitivity, terminal-value dependence, and whether the forecast is doing too much work.',
  'reverse-dcf': 'Risk lens: stale pricing anchors, discount-rate sensitivity, and false precision in implied expectations.',
  lbo: 'Risk lens: underwriting miss, deleveraging risk, and exit-multiple compression.',
  comps: 'Risk lens: peer-set weakness, multiple regime shifts, and weak comparability.',
  precedents: 'Risk lens: bad transaction selection, premium distortion, and cycle mismatch.',
  merger: 'Risk lens: synergy slippage, financing drag, and integration failure.',
  'ma-accretion-dilution': 'Risk lens: synergy slippage, financing drag, and accretion that disappears under realistic integration assumptions.',
  operating: 'Risk lens: execution miss, expense drift, and weak cash conversion.',
  'three-statement': 'Risk lens: working-capital miss, capex burden, and balance-sheet stress under downside assumptions.',
  scorecard: 'Risk lens: incomplete screening inputs and false confidence from simplified scoring.',
  'debt-capacity-lite': 'Risk lens: EBITDA quality, rate sensitivity, covenant pressure, and incomplete debt data.',
  'cap-table': 'Risk lens: dilution surprises, option-pool creep, and control misreads.',
  'saas-operating-model': 'Risk lens: churn understatement, CAC inflation, and ARR that fails to convert into durable cash flow.',
  'dividend-discount-model': 'Risk lens: unstable payout policy and cost-of-equity sensitivity.',
  'residual-income-model': 'Risk lens: weak opening equity base, ROE fade, and accounting distortions.',
  'debt-amortization-refi': 'Risk lens: maturity walls, rate reset pressure, and liquidity shortfall.',
  'buyback-eps-accretion': 'Risk lens: expensive buybacks, debt-funded optics, and weak opportunity cost discipline.',
  'purchase-price-allocation': 'Risk lens: over-allocated goodwill, aggressive intangible assumptions, and post-close earnings drag.',
  'working-capital-schedule': 'Risk lens: DSO/DIO/DPO miss, seasonality, and hidden liquidity drag.',
  'ppe-depreciation-schedule': 'Risk lens: capex understatement, useful-life errors, and overstated cash conversion.',
  'runway-burn': 'Risk lens: slower revenue, faster burn, and financing markets shutting sooner than planned.',
  'vc-returns-irr': 'Risk lens: dilution creep, exit compression, and ownership assumptions that are too generous.',
  'inventory-cogs': 'Risk lens: markdown risk, absorption miss, and inventory that traps cash.',
  'revenue-recognition-asc606': 'Risk lens: timing distortion, poor comparability, and mistaken interpretation of accounting-driven growth.',
};

const MODEL_SECTION_ORDER: Record<ReportModelType, string> = {
  dcf: 'Preferred section order: Model Overview -> What The Model Says -> Decision Framing -> Interpretation -> Key Risks And Constraints -> Data Gaps / Reliability -> What To Do Next.',
  'reverse-dcf':
    'Preferred section order: Model Overview -> What The Model Says -> Decision Framing -> Interpretation -> Key Risks And Constraints -> Data Gaps / Reliability -> What To Do Next.',
  lbo: 'Preferred section order: Model Overview -> Decision Framing -> What The Model Says -> Interpretation -> Key Risks And Constraints -> Data Gaps / Reliability -> What To Do Next.',
  comps: 'Preferred section order: Model Overview -> What The Model Says -> Decision Framing -> Interpretation -> Key Risks And Constraints -> Data Gaps / Reliability -> What To Do Next.',
  precedents:
    'Preferred section order: Model Overview -> What The Model Says -> Decision Framing -> Interpretation -> Key Risks And Constraints -> Data Gaps / Reliability -> What To Do Next.',
  merger:
    'Preferred section order: Model Overview -> Decision Framing -> What The Model Says -> Interpretation -> Key Risks And Constraints -> Data Gaps / Reliability -> What To Do Next.',
  'ma-accretion-dilution':
    'Preferred section order: Model Overview -> Decision Framing -> What The Model Says -> Interpretation -> Key Risks And Constraints -> Data Gaps / Reliability -> What To Do Next.',
  operating:
    'Preferred section order: Model Overview -> What The Model Says -> Interpretation -> Decision Framing -> Key Risks And Constraints -> Data Gaps / Reliability -> What To Do Next.',
  'three-statement':
    'Preferred section order: Model Overview -> What The Model Says -> Interpretation -> Decision Framing -> Key Risks And Constraints -> Data Gaps / Reliability -> What To Do Next.',
  scorecard:
    'Preferred section order: Model Overview -> What The Model Says -> Interpretation -> Decision Framing -> Key Risks And Constraints -> Data Gaps / Reliability -> What To Do Next.',
  'debt-capacity-lite':
    'Preferred section order: Model Overview -> Decision Framing -> What The Model Says -> Interpretation -> Key Risks And Constraints -> Data Gaps / Reliability -> What To Do Next.',
  'cap-table':
    'Preferred section order: Model Overview -> What The Model Says -> Decision Framing -> Interpretation -> Key Risks And Constraints -> Data Gaps / Reliability -> What To Do Next.',
  'saas-operating-model':
    'Preferred section order: Model Overview -> What The Model Says -> Interpretation -> Decision Framing -> Key Risks And Constraints -> Data Gaps / Reliability -> What To Do Next.',
  'dividend-discount-model':
    'Preferred section order: Model Overview -> What The Model Says -> Decision Framing -> Interpretation -> Key Risks And Constraints -> Data Gaps / Reliability -> What To Do Next.',
  'residual-income-model':
    'Preferred section order: Model Overview -> What The Model Says -> Decision Framing -> Interpretation -> Key Risks And Constraints -> Data Gaps / Reliability -> What To Do Next.',
  'debt-amortization-refi':
    'Preferred section order: Model Overview -> Decision Framing -> What The Model Says -> Interpretation -> Key Risks And Constraints -> Data Gaps / Reliability -> What To Do Next.',
  'buyback-eps-accretion':
    'Preferred section order: Model Overview -> Decision Framing -> What The Model Says -> Interpretation -> Key Risks And Constraints -> Data Gaps / Reliability -> What To Do Next.',
  'purchase-price-allocation':
    'Preferred section order: Model Overview -> Decision Framing -> What The Model Says -> Interpretation -> Key Risks And Constraints -> Data Gaps / Reliability -> What To Do Next.',
  'working-capital-schedule':
    'Preferred section order: Model Overview -> What The Model Says -> Interpretation -> Decision Framing -> Key Risks And Constraints -> Data Gaps / Reliability -> What To Do Next.',
  'ppe-depreciation-schedule':
    'Preferred section order: Model Overview -> What The Model Says -> Interpretation -> Decision Framing -> Key Risks And Constraints -> Data Gaps / Reliability -> What To Do Next.',
  'runway-burn':
    'Preferred section order: Model Overview -> Decision Framing -> What The Model Says -> Interpretation -> Key Risks And Constraints -> Data Gaps / Reliability -> What To Do Next.',
  'vc-returns-irr':
    'Preferred section order: Model Overview -> Decision Framing -> What The Model Says -> Interpretation -> Key Risks And Constraints -> Data Gaps / Reliability -> What To Do Next.',
  'inventory-cogs':
    'Preferred section order: Model Overview -> What The Model Says -> Interpretation -> Decision Framing -> Key Risks And Constraints -> Data Gaps / Reliability -> What To Do Next.',
  'revenue-recognition-asc606':
    'Preferred section order: Model Overview -> What The Model Says -> Interpretation -> Decision Framing -> Key Risks And Constraints -> Data Gaps / Reliability -> What To Do Next.',
};

export function getReportWriterSystemPrompt(context: ReportContext): string {
  if (context.modelType === 'debt-capacity-lite') {
    return DEBT_CAPACITY_LITE_REPORT_WRITER_SYSTEM_PROMPT;
  }
  return REPORT_WRITER_SYSTEM_PROMPT;
}

export function buildReportWriterUserPrompt(context: ReportContext): string {
  if (context.modelType === 'debt-capacity-lite') {
    return [
      `Model Type: ${context.modelType}`,
      `Company Name: ${context.companyName || context.ticker || 'Unknown Company'}`,
      `Ticker: ${context.ticker || 'N/A'}`,
      `As Of Date: ${context.asOfDate || new Date().toISOString().slice(0, 10)}`,
      `Use the DEBT-CAPACITY-LITE rules strictly.`,
      `Required format emphasis: executive summary, quantified key metrics, capacity interpretation, explicit missing-field handling.`,
      `Debt Capacity Inputs JSON: ${JSON.stringify(context.data?.debtCapacityLite ?? {}, null, 2)}`,
      `Canonical Financials JSON: ${JSON.stringify(context.data?.canonicalFinancials ?? {}, null, 2)}`,
      `Key Outputs JSON: ${JSON.stringify(context.keyOutputs?.debtCapacity ?? context.keyOutputs ?? {}, null, 2)}`,
      context.highLevelNotes ? `Additional Notes: ${context.highLevelNotes}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  return [
    `Model Type: ${context.modelType}`,
    `Company Name: ${context.companyName || context.ticker || 'Unknown Company'}`,
    `Ticker: ${context.ticker || 'N/A'}`,
    `As Of Date: ${context.asOfDate || new Date().toISOString().slice(0, 10)}`,
    `Sector: ${context.sector || 'N/A'}`,
    `Industry: ${context.industry || 'N/A'}`,
    `Model-Specific Guidance: ${MODEL_GUIDANCE[context.modelType]}`,
    `Memo Purpose: ${MODEL_MEMO_PURPOSE[context.modelType]}`,
    `Decision To Make: ${MODEL_DECISION_TO_MAKE[context.modelType]}`,
    `Risk Lens: ${MODEL_RISK_LENS[context.modelType]}`,
    MODEL_SECTION_ORDER[context.modelType],
    `Meeting Objective: produce a report that can be dropped directly into an internal investor, management, or deal review without cleanup.`,
    `Key Outputs JSON: ${JSON.stringify(context.keyOutputs || {}, null, 2)}`,
    `Supporting Data JSON: ${JSON.stringify(context.data || {}, null, 2)}`,
    context.highLevelNotes ? `Additional Notes: ${context.highLevelNotes}` : '',
    context.risks ? `Known Risks: ${context.risks}` : '',
    context.upside ? `Upside Considerations: ${context.upside}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}
