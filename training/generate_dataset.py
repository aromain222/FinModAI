#!/usr/bin/env python3
"""Generate SFT-ready train/eval datasets for Analyst Copilot."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List

ROOT = Path(__file__).resolve().parents[1]
SYSTEM_PROMPT_PATH = ROOT / "training" / "system_prompt.txt"
TRAIN_PATH = ROOT / "training" / "training.jsonl"
EVAL_PATH = ROOT / "eval" / "eval.jsonl"


def read_system_prompt() -> str:
    prompt = SYSTEM_PROMPT_PATH.read_text(encoding="utf-8").strip()
    if not prompt:
        raise ValueError("system_prompt.txt is empty")
    return prompt


def fmt_pct(x: float, digits: int = 2) -> str:
    return f"{x * 100:.{digits}f}%"


def fmt_num(x: float, digits: int = 2) -> str:
    return f"{x:.{digits}f}"


def structured_answer(
    objective: str,
    assumptions: List[str],
    math_steps: List[str],
    recommendation: str,
    drivers: List[str],
    risks: List[str],
    next_checks: List[str],
    citations: List[str] | None = None,
) -> str:
    cits = citations if citations else ["No external web sources used."]
    lines: List[str] = [
        "Objective:",
        objective,
        "",
        "Assumptions:",
    ]
    lines.extend([f"- {x}" for x in assumptions])
    lines.extend(["", "Math:"])
    lines.extend([f"{i + 1}. {x}" for i, x in enumerate(math_steps)])
    lines.extend(["", "Recommendation:", recommendation, "", "Drivers:"])
    lines.extend([f"- {x}" for x in drivers])
    lines.extend(["", "Risks:"])
    lines.extend([f"- {x}" for x in risks])
    lines.extend(["", "Next checks:"])
    lines.extend([f"- {x}" for x in next_checks])
    lines.extend(["", "Citations:"])
    lines.extend([f"- {x}" for x in cits])
    return "\n".join(lines).strip()


def make_example(system_prompt: str, task_type: str, user_body: str, assistant: str) -> Dict[str, List[Dict[str, str]]]:
    user = f"Task type: {task_type}\n{user_body.strip()}"
    return {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user},
            {"role": "assistant", "content": assistant.strip()},
        ]
    }


def gen_valuation_examples(system_prompt: str, count: int) -> List[Dict]:
    out: List[Dict] = []
    fcf5_values = [120.0, 140.0, 160.0, 180.0, 210.0, 240.0]
    wacc_values = [0.085, 0.09, 0.095, 0.10, 0.105]
    g_values = [0.02, 0.0225, 0.025, 0.0275, 0.03]
    shares_values = [220.0, 260.0, 300.0, 340.0]
    debt_values = [1200.0, 1500.0, 1800.0]

    i = 0
    while len(out) < count:
        fcf5 = fcf5_values[i % len(fcf5_values)]
        wacc = wacc_values[i % len(wacc_values)]
        g = g_values[i % len(g_values)]
        shares = shares_values[i % len(shares_values)]
        net_debt = debt_values[i % len(debt_values)]
        stage_pv = 350.0 + (i % 6) * 45.0

        tv = fcf5 * (1 + g) / (wacc - g)
        pv_tv = tv / ((1 + wacc) ** 5)
        ev = stage_pv + pv_tv
        equity = ev - net_debt
        pps = equity / shares

        user = (
            f"Company case {i+1}: Year-5 FCF is ${fcf5:.1f}m, WACC is {fmt_pct(wacc)}, terminal growth is {fmt_pct(g)}, "
            f"PV of stage-1 cash flows is ${stage_pv:.1f}m, net debt is ${net_debt:.1f}m, shares are {shares:.1f}m. "
            "Compute implied equity value per share and say whether terminal assumptions look aggressive."
        )
        assistant = structured_answer(
            objective="Compute implied per-share value from DCF terminal assumptions and assess reasonableness.",
            assumptions=[
                "FCF is in USD millions and represents unlevered FCF in Year 5.",
                "Terminal value uses Gordon Growth: TV = FCF5*(1+g)/(WACC-g).",
                "No non-operating adjustments beyond stated net debt.",
            ],
            math_steps=[
                f"Terminal value = {fcf5:.1f}*(1+{g:.4f})/({wacc:.4f}-{g:.4f}) = ${tv:.2f}m.",
                f"PV of terminal value = ${tv:.2f}m / (1+{wacc:.4f})^5 = ${pv_tv:.2f}m.",
                f"Enterprise value = stage PV ${stage_pv:.2f}m + terminal PV ${pv_tv:.2f}m = ${ev:.2f}m.",
                f"Equity value = EV ${ev:.2f}m - net debt ${net_debt:.2f}m = ${equity:.2f}m.",
                f"Implied value/share = equity ${equity:.2f}m / {shares:.1f}m shares = ${pps:.2f}.",
            ],
            recommendation=(
                "Base-case is acceptable if long-run growth stays below nominal GDP and reinvestment supports FCF durability; "
                "stress-test ±50 bps on WACC and terminal growth before underwriting."
            ),
            drivers=[
                "Terminal spread (WACC - g) dominates valuation convexity.",
                "Net debt burden materially changes equity takeout.",
                "Stage-1 PV contribution provides partial downside cushion.",
            ],
            risks=[
                "If terminal growth is too close to WACC, valuation can be overstated.",
                "Capital intensity or credit losses could reduce sustainable FCF.",
            ],
            next_checks=[
                "Run 2D sensitivity for WACC and g.",
                "Reconcile implied EV/EBITDA vs peers.",
                "Validate debt maturity and refinancing assumptions.",
            ],
        )
        out.append(make_example(system_prompt, "financial_reasoning", user, assistant))
        i += 1
    return out


def gen_saas_examples(system_prompt: str, count: int) -> List[Dict]:
    out: List[Dict] = []
    i = 0
    while len(out) < count:
        start_arr = 8.0 + (i % 7) * 1.5
        expansion = 1.4 + (i % 5) * 0.4
        contraction = 0.4 + (i % 3) * 0.2
        churn = 0.3 + (i % 4) * 0.2

        cac = 4200 + (i % 6) * 550
        arpa = 260 + (i % 5) * 35
        gm = 0.68 + (i % 4) * 0.03
        monthly_churn = 0.012 + (i % 5) * 0.002

        nrr = (start_arr + expansion - contraction - churn) / start_arr
        monthly_gp = arpa * gm
        payback = cac / monthly_gp
        ltv = (arpa * gm) / monthly_churn
        ltv_cac = ltv / cac

        user = (
            f"SaaS cohort case {i+1}: Start ARR ${start_arr:.1f}m, expansion ${expansion:.1f}m, contraction ${contraction:.1f}m, "
            f"churn ${churn:.1f}m. CAC is ${cac}, ARPA is ${arpa}/month, gross margin is {fmt_pct(gm)}, monthly churn is {fmt_pct(monthly_churn)}. "
            "Calculate NRR, CAC payback, and LTV:CAC, then interpret quality."
        )
        assistant = structured_answer(
            objective="Evaluate SaaS retention and unit economics quality for one cohort.",
            assumptions=[
                "ARR bridge uses Start + Expansion - Contraction - Churn.",
                "CAC payback = CAC / monthly gross profit per customer.",
                "LTV = (ARPA * gross margin) / monthly churn under steady-state approximation.",
            ],
            math_steps=[
                f"NRR = ({start_arr:.1f}+{expansion:.1f}-{contraction:.1f}-{churn:.1f})/{start_arr:.1f} = {fmt_pct(nrr)}.",
                f"Monthly gross profit/customer = ${arpa} * {gm:.2f} = ${monthly_gp:.2f}.",
                f"CAC payback = ${cac} / ${monthly_gp:.2f} = {payback:.2f} months.",
                f"LTV = ${arpa}*{gm:.2f}/{monthly_churn:.4f} = ${ltv:.2f}.",
                f"LTV:CAC = ${ltv:.2f}/${cac} = {ltv_cac:.2f}x.",
            ],
            recommendation=(
                "Treat the cohort as investable only if payback and retention remain stable after sales-efficiency normalization "
                "and if expansion is not promo-driven."
            ),
            drivers=[
                "Net retention level drives durable compounding.",
                "Gross margin and churn jointly determine LTV quality.",
                "CAC efficiency determines burn and scale pace.",
            ],
            risks=[
                "Churn can rise as customer mix shifts down-market.",
                "Payback can lengthen if paid acquisition saturates.",
            ],
            next_checks=[
                "Disaggregate NRR by segment and vintage.",
                "Check CAC by channel and blended vs incremental trend.",
                "Test downside with +200 bps churn shock.",
            ],
        )
        out.append(make_example(system_prompt, "financial_reasoning", user, assistant))
        i += 1
    return out


def gen_fintech_examples(system_prompt: str, count: int) -> List[Dict]:
    out: List[Dict] = []
    i = 0
    while len(out) < count:
        tpv = 7.5 + (i % 8) * 1.8
        rev = 85 + (i % 7) * 18
        card_vol = 1200 + (i % 6) * 160
        interchange_bps = 135 + (i % 5) * 12
        rewards_bps = 68 + (i % 4) * 8
        fraud_bps = 12 + (i % 3) * 3
        credit_loss_bps = 95 + (i % 5) * 15

        take_rate = rev / (tpv * 1000)
        interchange_rev = card_vol * (interchange_bps / 10000)
        variable_cost = card_vol * ((rewards_bps + fraud_bps + credit_loss_bps) / 10000)
        net_contribution = interchange_rev - variable_cost

        user = (
            f"Fintech unit-econ case {i+1}: TPV is ${tpv:.1f}bn and revenue is ${rev}m. Card volume is ${card_vol}m. "
            f"Interchange {interchange_bps} bps, rewards {rewards_bps} bps, fraud {fraud_bps} bps, credit loss {credit_loss_bps} bps. "
            "Compute take rate and card net contribution, then assess sustainability."
        )
        assistant = structured_answer(
            objective="Quantify fintech take rate and card-level net contribution.",
            assumptions=[
                "TPV in billions is converted to millions for take-rate consistency.",
                "Bps conversion: bps / 10,000.",
                "Net contribution excludes fixed overhead and funding carry.",
            ],
            math_steps=[
                f"Take rate = revenue ${rev:.2f}m / TPV ${(tpv*1000):.2f}m = {fmt_pct(take_rate, 2)} ({take_rate*10000:.1f} bps).",
                f"Interchange revenue = ${card_vol:.2f}m * {interchange_bps/10000:.4f} = ${interchange_rev:.2f}m.",
                f"Variable costs = ${card_vol:.2f}m * {(rewards_bps+fraud_bps+credit_loss_bps)/10000:.4f} = ${variable_cost:.2f}m.",
                f"Card net contribution = ${interchange_rev:.2f}m - ${variable_cost:.2f}m = ${net_contribution:.2f}m.",
            ],
            recommendation=(
                "Economics are attractive only if credit and rewards remain controlled; growth should be weighted toward low-loss cohorts "
                "and higher-fee monetization rails."
            ),
            drivers=[
                "Take rate reflects product mix and pricing power.",
                "Credit loss bps can dominate marginal profitability in stress periods.",
                "Rewards inflation compresses interchange margin quickly.",
            ],
            risks=[
                "Macro stress can push loss rates materially above underwriting assumptions.",
                "Competitive rewards pressure can erode spread economics.",
            ],
            next_checks=[
                "Track delinquencies and net charge-offs by FICO band.",
                "Monitor contribution margin by product cohort.",
                "Stress-test at +50 bps and +100 bps credit loss scenarios.",
            ],
        )
        out.append(make_example(system_prompt, "financial_reasoning", user, assistant))
        i += 1
    return out


def gen_accounting_examples(system_prompt: str, count: int) -> List[Dict]:
    out: List[Dict] = []
    i = 0
    while len(out) < count:
        cfo = 260 + (i % 8) * 35
        capex = 120 + (i % 6) * 18
        acquisitions = 15 + (i % 4) * 6
        debt_issued = 80 + (i % 5) * 20
        debt_repaid = 45 + (i % 5) * 14
        buyback = 35 + (i % 4) * 10

        cfi = -(capex + acquisitions)
        cff = debt_issued - debt_repaid - buyback
        delta_cash = cfo + cfi + cff

        ar_increase = 18 + (i % 6) * 4
        inv_increase = 10 + (i % 5) * 3
        ap_increase = 8 + (i % 4) * 2
        nwc_drag = ar_increase + inv_increase - ap_increase

        user = (
            f"Accounting tie-out case {i+1}: CFO ${cfo}m, capex ${capex}m, acquisitions ${acquisitions}m, debt issued ${debt_issued}m, "
            f"debt repaid ${debt_repaid}m, buybacks ${buyback}m. AR increased ${ar_increase}m, inventory increased ${inv_increase}m, AP increased ${ap_increase}m. "
            "Check cash-flow statement consistency and quantify working-capital drag."
        )
        assistant = structured_answer(
            objective="Validate 3-statement cash bridge and isolate working-capital effect.",
            assumptions=[
                "CFI sign convention: investments/capex are outflows (negative).",
                "CFF includes debt flows and buybacks only for this case.",
                "NWC drag approximation = ΔAR + ΔInventory - ΔAP.",
            ],
            math_steps=[
                f"CFI = -(${capex}+${acquisitions}) = ${cfi}m.",
                f"CFF = ${debt_issued}-${debt_repaid}-${buyback} = ${cff}m.",
                f"ΔCash = CFO ${cfo}m + CFI ${cfi}m + CFF ${cff}m = ${delta_cash}m.",
                f"Working-capital drag = ΔAR {ar_increase} + ΔInventory {inv_increase} - ΔAP {ap_increase} = ${nwc_drag}m.",
            ],
            recommendation=(
                "Statement tie is mechanically consistent; focus diligence on whether NWC outflow is structural (growth) or operational slippage."
            ),
            drivers=[
                "Operating cash generation vs reinvestment burden.",
                "Financing mix between debt and shareholder returns.",
                "Working-capital discipline in AR/inventory management.",
            ],
            risks=[
                "If NWC drag persists, free-cash conversion may underperform earnings.",
                "Debt-funded buybacks can pressure flexibility in downturns.",
            ],
            next_checks=[
                "Reconcile NWC moves to revenue growth and days metrics.",
                "Check covenant headroom after financing flows.",
                "Run cash conversion trend over 8 quarters.",
            ],
        )
        out.append(make_example(system_prompt, "financial_reasoning", user, assistant))
        i += 1
    return out


def gen_web_research_examples(system_prompt: str, count: int) -> List[Dict]:
    out: List[Dict] = []
    companies = [
        ("SoFi", "PayPal"),
        ("Robinhood", "Block"),
        ("Affirm", "Upstart"),
        ("Adyen", "Stripe"),
        ("Nu Holdings", "Revolut"),
    ]
    angles = [
        "unit economics durability",
        "credit risk transmission",
        "regulatory exposure",
        "growth vs profitability trade-off",
        "competitive moat and switching costs",
    ]

    i = 0
    while len(out) < count:
        a, b = companies[i % len(companies)]
        angle = angles[i % len(angles)]
        user = (
            f"Using public sources, compare {a} vs {b} on {angle}. Give a practical investor readout and cite sources."
        )
        assistant = structured_answer(
            objective=f"Compare {a} and {b} on {angle} using source-backed evidence.",
            assumptions=[
                "Use latest available public filings and investor materials as primary evidence.",
                "If periods differ, normalize interpretation directionally rather than forcing false precision.",
                "Any unsupported claim is excluded.",
            ],
            math_steps=[
                "Create a simple scorecard: growth quality, margin trajectory, balance-sheet risk, and execution consistency.",
                "Weight scorecard 30/30/20/20 to produce a directional ranking.",
                "Cross-check claims against at least two independent primary sources.",
            ],
            recommendation=(
                f"Base case: prefer the name with stronger risk-adjusted operating leverage and cleaner downside under adverse credit and funding conditions."
            ),
            drivers=[
                "Revenue durability by product mix and customer cohort behavior.",
                "Margin progression after risk/funding costs.",
                "Capital intensity and regulatory constraints.",
            ],
            risks=[
                "Reporting period mismatch can distort direct comparisons.",
                "Macro regime shift may invalidate recent trend extrapolation.",
            ],
            next_checks=[
                "Pull latest 10-K/20-F and most recent earnings deck side-by-side.",
                "Rebuild the scorecard with updated quarter data.",
                "Track revisions to guidance and consensus estimates.",
            ],
            citations=[
                "[SOURCE] https://www.sec.gov/edgar/searchedgar/companysearch",
                "[SOURCE] https://investors.example.com/latest-earnings",
            ],
        )
        out.append(make_example(system_prompt, "web_research", user, assistant))
        i += 1
    return out


def gen_table_extraction_examples(system_prompt: str, count: int) -> List[Dict]:
    out: List[Dict] = []
    i = 0
    while len(out) < count:
        revenue = 120 + (i % 6) * 25
        gross = 72 + (i % 6) * 14
        opex = 40 + (i % 5) * 10
        adj = 8 + (i % 4) * 3

        html = (
            "<table><tr><th>Quarter</th><th>Revenue</th><th>Gross Profit</th><th>OpEx</th></tr>"
            f"<tr><td>Q1</td><td>{revenue}</td><td>{gross}</td><td>{opex}</td></tr>"
            f"<tr><td>Q2</td><td>{revenue+adj}</td><td>{gross+int(adj*0.6)}</td><td>{opex+int(adj*0.5)}</td></tr>"
            "</table>"
        )
        q1_margin = gross / revenue
        q2_margin = (gross + int(adj * 0.6)) / (revenue + adj)

        user = (
            "Extract the table from this HTML snippet and compute gross margin by quarter:\n"
            f"```html\n{html}\n```"
        )
        assistant = structured_answer(
            objective="Extract tabular financial values from HTML and compute gross margin trend.",
            assumptions=[
                "Numbers are in USD millions.",
                "Gross margin = Gross Profit / Revenue.",
                "HTML snippet is the full source for this task.",
            ],
            math_steps=[
                "Parsed rows: Q1 (Revenue, Gross Profit, OpEx) and Q2 (Revenue, Gross Profit, OpEx).",
                f"Q1 gross margin = {gross}/{revenue} = {fmt_pct(q1_margin)}.",
                f"Q2 gross margin = {gross + int(adj*0.6)}/{revenue + adj} = {fmt_pct(q2_margin)}.",
                "Compare direction to determine whether unit economics improved or weakened.",
            ],
            recommendation=(
                "Use this extraction as a preprocessing step, then validate values against the original filing before investment decisions."
            ),
            drivers=[
                "Revenue/gross profit mix shift between periods.",
                "Operating expense run-rate relative to growth.",
            ],
            risks=[
                "HTML snippets may omit footnotes and restatements.",
                "Unit labels may be ambiguous without metadata.",
            ],
            next_checks=[
                "Capture source URL and retrieval timestamp.",
                "Validate parsed columns against filing PDF or XBRL tags.",
                "Extend parser to handle multi-level headers.",
            ],
        )
        out.append(make_example(system_prompt, "table_extraction", user, assistant))
        i += 1
    return out


def gen_scrape_plan_examples(system_prompt: str, count: int) -> List[Dict]:
    out: List[Dict] = []
    targets = [
        "https://example-investor-relations.com/financials",
        "https://example-regulator.gov/filings",
        "https://example-bank.com/press-releases",
        "https://example-fintech.com/newsroom",
        "https://example-exchange.com/listed-company/overview",
    ]

    i = 0
    while len(out) < count:
        url = targets[i % len(targets)]
        user = (
            f"I need a scraping plan for {url} to collect quarterly KPI tables and then analyze trends. "
            "Do this ethically and tell me what to do if bots are disallowed."
        )
        assistant = structured_answer(
            objective="Provide a compliant scrape-then-analyze workflow with explicit legal and technical safeguards.",
            assumptions=[
                "Only public, unauthenticated pages are in scope.",
                "Robots and ToS checks run before any full-page download.",
                "Request pacing is capped at 1-2 requests/second with retry backoff.",
            ],
            math_steps=[
                "Step 1: Fetch robots.txt and verify target paths are allowed for the declared user-agent.",
                "Step 2: Review ToS for automation restrictions; halt if prohibited.",
                "Step 3: Run dry-run HEAD checks, then parse tables and persist {url, fetched_at, table_json}.",
                "Step 4: Compute QoQ and YoY KPI deltas only after extraction validation.",
            ],
            recommendation=(
                "Proceed only if robots and terms permit; otherwise switch to official APIs, downloadable datasets, or manual export."
            ),
            drivers=[
                "Compliance-first sequencing reduces legal and operational risk.",
                "Structured extraction with metadata improves auditability.",
            ],
            risks=[
                "Rate-limit breaches can trigger blocking and data integrity issues.",
                "ToS ambiguity can create non-technical legal risk.",
            ],
            next_checks=[
                "Log robots decision and terms snapshot before extraction.",
                "Implement exponential backoff for 429/503 responses.",
                "Add schema validation for extracted KPI tables.",
            ],
            citations=["[SOURCE] https://www.rfc-editor.org/rfc/rfc9309"],
        )
        out.append(make_example(system_prompt, "scrape_then_analyze", user, assistant))
        i += 1
    return out


def gen_modeling_template_examples(system_prompt: str, count: int) -> List[Dict]:
    out: List[Dict] = []
    templates = [
        "fintech 3-case scenario model",
        "SaaS operating model",
        "credit-loss forecasting template",
        "LTV:CAC cohort model",
        "terminal-value sensitivity template",
    ]

    i = 0
    while len(out) < count:
        template = templates[i % len(templates)]
        user = f"Create a reusable {template} with key formulas and checks."
        assistant = structured_answer(
            objective=f"Provide a reusable {template} with explicit formulas and validation checks.",
            assumptions=[
                "Template should be auditable and easy to update each quarter.",
                "All outputs must trace back to a small set of core assumptions.",
                "Sensitivity ranges are required for key risk drivers.",
            ],
            math_steps=[
                "Define input block (historicals, assumptions, scenario toggles).",
                "Define core formulas (revenue build, margin bridge, cash conversion, valuation or unit-econ outputs).",
                "Add balancing checks (3-statement tie, sign checks, and reasonableness bounds).",
                "Add sensitivity tables for 2-3 key drivers.",
            ],
            recommendation="Use a modular tab structure and lock constants to avoid silent model drift.",
            drivers=[
                "Input transparency and assumption governance.",
                "Formula consistency across scenarios.",
                "Validation controls for accounting integrity.",
            ],
            risks=[
                "Template bloat can hide broken references.",
                "Overfitting to one regime can mislead scenario outputs.",
            ],
            next_checks=[
                "Backtest template on at least 8 historical quarters.",
                "Add versioned changelog for assumption revisions.",
                "Document stress-case assumptions explicitly.",
            ],
        )
        out.append(make_example(system_prompt, "modeling_template", user, assistant))
        i += 1
    return out


def gen_eval_examples(system_prompt: str, count: int = 36) -> List[Dict]:
    out: List[Dict] = []

    # Known-answer numeric checks
    numeric_cases = [
        ("NRR", "Start MRR 10.0, expansion 1.5, contraction 0.5, churn 0.7. Compute NRR.", 103.0, 0.2),
        ("TakeRateBps", "TPV is 8.0bn and revenue is 120m. Compute take rate in bps.", 150.0, 0.5),
        ("CACPayback", "CAC is 6000, ARPA is 300/month, gross margin 70%. Compute CAC payback months.", 28.57, 0.15),
        ("LTV_CAC", "ARPA 250, gross margin 75%, monthly churn 2.0%, CAC 5000. Compute LTV:CAC.", 1.88, 0.05),
        ("NWCDrag", "AR increases 30, inventory increases 12, AP increases 9. Compute working-capital drag.", 33.0, 0.2),
        ("CreditLossPct", "Net charge-offs are 42m on average loans of 2100m. Compute loss rate (%).", 2.0, 0.05),
    ]

    for i in range(18):
        name, prompt, expected, tol = numeric_cases[i % len(numeric_cases)]
        user = (
            f"[KNOWN_ANSWER metric={name} expected={expected} tol={tol}]\n"
            f"{prompt} Show assumptions and full calculation."
        )
        assistant = structured_answer(
            objective=f"Compute {name} accurately and explain implications.",
            assumptions=["All figures are in consistent units.", "Formula definition follows standard finance convention."],
            math_steps=["Apply metric formula directly.", "Substitute values and compute result.", "Sanity-check direction and magnitude."],
            recommendation="Use the computed metric as a screening input, not a standalone investment decision.",
            drivers=["Formula inputs and unit consistency.", "Business mix and cohort effects."],
            risks=["Definition drift across data sources.", "One-period noise can distort interpretation."],
            next_checks=["Cross-check with prior period trend.", "Reconcile to reported KPI definitions."],
        )
        out.append(make_example(system_prompt, "financial_reasoning", user, assistant))

    out.extend(gen_table_extraction_examples(system_prompt, 6)[:6])
    out.extend(gen_scrape_plan_examples(system_prompt, 6)[:6])
    out.extend(gen_web_research_examples(system_prompt, 3)[:3])
    out.extend(gen_modeling_template_examples(system_prompt, 3)[:3])

    return out[:count]


def write_jsonl(path: Path, rows: List[Dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def count_by_task(rows: List[Dict]) -> Dict[str, int]:
    bucket: Dict[str, int] = {}
    for row in rows:
        user = row["messages"][1]["content"]
        prefix = "Task type: "
        task = "unknown"
        if user.startswith(prefix):
            task = user.split("\n", 1)[0].replace(prefix, "").strip()
        bucket[task] = bucket.get(task, 0) + 1
    return bucket


def main() -> None:
    system_prompt = read_system_prompt()

    training_rows: List[Dict] = []
    training_rows.extend(gen_valuation_examples(system_prompt, 36))
    training_rows.extend(gen_saas_examples(system_prompt, 30))
    training_rows.extend(gen_fintech_examples(system_prompt, 28))
    training_rows.extend(gen_accounting_examples(system_prompt, 24))
    training_rows.extend(gen_web_research_examples(system_prompt, 20))
    training_rows.extend(gen_table_extraction_examples(system_prompt, 24))
    training_rows.extend(gen_scrape_plan_examples(system_prompt, 14))
    training_rows.extend(gen_modeling_template_examples(system_prompt, 14))

    eval_rows = gen_eval_examples(system_prompt, 36)

    if len(training_rows) < 150:
        raise ValueError(f"training set too small: {len(training_rows)}")
    if len(eval_rows) < 30:
        raise ValueError(f"eval set too small: {len(eval_rows)}")

    write_jsonl(TRAIN_PATH, training_rows)
    write_jsonl(EVAL_PATH, eval_rows)

    print(f"Wrote {len(training_rows)} training rows -> {TRAIN_PATH}")
    print(f"Wrote {len(eval_rows)} eval rows -> {EVAL_PATH}")
    print("Training task mix:", count_by_task(training_rows))
    print("Eval task mix:", count_by_task(eval_rows))


if __name__ == "__main__":
    main()
