#!/usr/bin/env python3
"""Generate SFT-ready train/eval datasets for Analyst Copilot."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List

ROOT = Path(__file__).resolve().parents[1]
SYSTEM_PROMPT_PATH = ROOT / "training" / "system_prompt.txt"
TRAIN_PATH = ROOT / "training" / "training.jsonl"
EVAL_PATH = ROOT / "eval" / "eval.jsonl"
EXTRACTED_SOURCES_DIR = ROOT / "training" / "extracted_sources"


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


def compact_list(value: Any, limit: int = 6) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        items = [str(x).strip() for x in value if str(x).strip()]
    elif isinstance(value, dict):
        items = [f"{k}: {v}" for k, v in value.items() if str(v).strip()]
    else:
        items = [str(value).strip()]
    deduped: List[str] = []
    seen = set()
    for item in items:
        if item.lower() in seen:
            continue
        seen.add(item.lower())
        deduped.append(item)
        if len(deduped) >= limit:
            break
    return deduped


def sentence_join(items: List[str], fallback: str) -> str:
    cleaned = [item for item in items if item]
    if not cleaned:
        return fallback
    return "; ".join(cleaned)


def load_extracted_records(phase: int) -> List[Dict[str, Any]]:
    phase_dir = EXTRACTED_SOURCES_DIR / f"phase_{phase}"
    if not phase_dir.exists():
        return []

    latest_by_id: Dict[str, tuple[float, Dict[str, Any]]] = {}
    for root, _, files in os.walk(phase_dir):
        for file_name in files:
            if not file_name.endswith(".json") or file_name == "_manifest.json":
                continue
            path = Path(root) / file_name
            data = json.loads(path.read_text(encoding="utf-8"))
            if data.get("extraction_status") != "extracted":
                continue
            record_id = data.get("id")
            if not record_id:
                continue
            mtime = path.stat().st_mtime
            current = latest_by_id.get(record_id)
            if current is None or mtime > current[0]:
                latest_by_id[record_id] = (mtime, data)

    ordered = [item[1] for item in sorted(latest_by_id.values(), key=lambda pair: pair[1].get("title", ""))]
    return ordered


def corpus_letter_example(system_prompt: str, record: Dict[str, Any]) -> Dict[str, List[Dict[str, str]]]:
    fields = record["fields"]
    title = fields.get("title") or record["title"]
    manager = fields.get("manager") or "the manager"
    positions = compact_list(fields.get("positions_discussed"), limit=5)
    themes = compact_list(fields.get("top_themes"), limit=5)
    thesis = compact_list(fields.get("thesis_points"), limit=4)
    valuation = compact_list(fields.get("valuation_language"), limit=4)
    risks_discussed = compact_list(fields.get("risks_discussed"), limit=4)
    actions = compact_list(fields.get("portfolio_actions"), limit=4)

    user = (
        f"Using the extracted source record for {title}, write a concise investor-style note on how this manager frames the portfolio. "
        "Focus on tone, positions, valuation language, and risk framing. Do not invent facts beyond the extracted record."
    )
    assistant = structured_answer(
        objective=f"Summarize how {manager} frames portfolio commentary in {title}.",
        assumptions=[
            "This is a style-and-judgment source, not a live investment recommendation.",
            "Only extracted fields are used; missing items are treated as unknown.",
            "Position references are illustrative of memo tone and prioritization.",
        ],
        math_steps=[
            f"Strategy style extracted: {fields.get('strategy_style') or 'not explicitly classified'}.",
            f"Core themes referenced: {sentence_join(themes, 'No top themes extracted.')}",
            f"Positions discussed: {sentence_join(positions, 'No positions were cleanly extracted.')}",
            f"Valuation language: {sentence_join(valuation, 'No explicit valuation language captured.')}",
        ],
        recommendation=(
            "Use this source to train thesis articulation and risk-aware portfolio commentary, but pair it with workbook and SEC sources for mechanics."
        ),
        drivers=thesis or [record.get("source_summary", "Source is primarily useful for memo-style calibration.")],
        risks=risks_discussed or compact_list(record.get("weaknesses"), limit=3) or ["Memo extraction can miss context in table-heavy PDFs."],
        next_checks=actions or [
            "Compare extracted positions against the original letter before using them in eval prompts.",
            "Pair this source with a valuation-mechanics source for model-backed outputs.",
            "Normalize noisy manager and position fields before fine-tuning.",
        ],
    )
    return make_example(system_prompt, "memo_style", user, assistant)


def corpus_presentation_example(system_prompt: str, record: Dict[str, Any]) -> Dict[str, List[Dict[str, str]]]:
    fields = record["fields"]
    title = fields.get("title") or record["title"]
    agenda = compact_list(fields.get("agenda"), limit=5)
    holdings = compact_list(fields.get("holdings_covered"), limit=6)
    valuation_points = compact_list(fields.get("valuation_points"), limit=4)

    user = (
        f"Use the extracted record for {title} to explain how a professional investor presentation compresses an investment case into slides. "
        "Keep the answer practical and structured."
    )
    assistant = structured_answer(
        objective=f"Explain slide-level investment communication patterns in {title}.",
        assumptions=[
            "Presentation structure is inferred from extracted agenda and holdings coverage.",
            "Slide outputs optimize for compression, not full underwriting detail.",
            "The source is used for communication patterns, not live facts.",
        ],
        math_steps=[
            f"Agenda or section pattern: {sentence_join(agenda, 'No agenda extracted.')}",
            f"Holdings covered: {sentence_join(holdings, 'No holdings extracted.')}",
            f"Valuation points surfaced: {sentence_join(valuation_points, 'No valuation bullets extracted.')}",
        ],
        recommendation="Use presentation sources to train concise thesis-slide outputs and contributor/detractor summaries.",
        drivers=compact_list(record.get("strengths"), limit=4),
        risks=compact_list(record.get("weaknesses"), limit=3) or ["Presentation shorthand can omit assumptions and nuance."],
        next_checks=[
            "Pair slide-compression examples with longer letters to avoid over-compressed prose.",
            "Add one source-backed quote or metric before converting to a final deck slide.",
            "Cross-check contributor/detractor labels against the original deck if using them for evals.",
        ],
    )
    return make_example(system_prompt, "memo_style", user, assistant)


def corpus_workbook_example(system_prompt: str, record: Dict[str, Any]) -> Dict[str, List[Dict[str, str]]]:
    fields = record["fields"]
    title = fields.get("title") or record["title"]
    sheet_names = compact_list(fields.get("sheet_names"), limit=10)
    schedules = compact_list(fields.get("key_schedules"), limit=6)
    outputs = compact_list(fields.get("output_tabs"), limit=5)
    formulas = compact_list(fields.get("core_formulas"), limit=6)

    user = (
        f"Using the extracted workbook record for {title}, explain how the model is structured and what it teaches about valuation mechanics."
    )
    assistant = structured_answer(
        objective=f"Map the architecture and training value of workbook {title}.",
        assumptions=[
            "Workbook extraction captures structure and sampled formula density, not full cell-by-cell logic.",
            "Tab names are used as proxies for schedule organization.",
            "Formula counts are sampled and directional rather than exhaustive.",
        ],
        math_steps=[
            f"Model type inferred: {fields.get('model_type') or 'unknown model type'}.",
            f"Key schedules: {sentence_join(schedules, 'No schedule grouping extracted.')}",
            f"Output tabs: {sentence_join(outputs, 'No output tabs extracted.')}",
            f"Formula concentration: {sentence_join(formulas, 'No formula summary extracted.')}",
        ],
        recommendation="Use workbook sources for model architecture and formula logic, not for memo tone.",
        drivers=sheet_names[:5] or compact_list(record.get("strengths"), limit=4),
        risks=compact_list(fields.get("quality_notes"), limit=4) or compact_list(record.get("weaknesses"), limit=3),
        next_checks=[
            "Open the highest-density tabs first when translating workbook logic into prompts.",
            "Pair workbook-derived examples with one memo-style source so outputs stay investor-readable.",
            "Add unit and sign checks when converting workbook logic into generated explanations.",
        ],
    )
    return make_example(system_prompt, "valuation_mechanics", user, assistant)


def corpus_finance_handbook_example(system_prompt: str, record: Dict[str, Any]) -> Dict[str, List[Dict[str, str]]]:
    fields = record["fields"]
    title = fields.get("title") or record["title"]
    subject_areas = compact_list(fields.get("subject_areas"), limit=6)
    chapter_titles = compact_list(fields.get("chapter_titles"), limit=6)
    frameworks = compact_list(fields.get("core_frameworks"), limit=6)
    learning_modes = compact_list(fields.get("applied_learning_modes"), limit=5)

    user = (
        f"Using the extracted handbook record for {title}, explain what an analyst should learn from it and how it should shape corporate finance reasoning."
    )
    assistant = structured_answer(
        objective=f"Translate the training value of handbook {title} into analyst-relevant corporate finance reasoning.",
        assumptions=[
            "This source is a broad teaching reference, not a company-specific memo or model.",
            "Chapter structure and extracted section types are used as proxies for curriculum design.",
            "The goal is to learn reusable finance logic, not to reproduce textbook prose.",
        ],
        math_steps=[
            f"Subject areas emphasized: {sentence_join(subject_areas, 'No subject areas extracted.')}",
            f"Representative chapters: {sentence_join(chapter_titles, 'No chapter titles extracted.')}",
            f"Core frameworks: {sentence_join(frameworks, 'No core frameworks extracted.')}",
            f"Applied learning modes: {sentence_join(learning_modes, 'No applied learning modes extracted.')}",
        ],
        recommendation="Use the handbook to train first-principles investment, financing, payout, and valuation reasoning, but pair it with real filings and memos for market realism.",
        drivers=compact_list(fields.get("analyst_relevance"), limit=5) or compact_list(record.get("strengths"), limit=4),
        risks=compact_list(record.get("weaknesses"), limit=3) or ["Educational sources can bias the model toward lecture-style phrasing if overweighted."],
        next_checks=[
            "Use the handbook for mechanics and decision frameworks rather than citation-heavy factual tasks.",
            "Pair textbook logic with SEC and investor-letter sources so outputs stay practical.",
            "Keep concept questions and live cases as evaluation-style prompts rather than pure prose training.",
        ],
    )
    return make_example(system_prompt, "valuation_mechanics", user, assistant)


def corpus_macro_handbook_example(system_prompt: str, record: Dict[str, Any]) -> Dict[str, List[Dict[str, str]]]:
    fields = record["fields"]
    title = fields.get("title") or record["title"]
    subject_areas = compact_list(fields.get("subject_areas"), limit=6)
    chapter_titles = compact_list(fields.get("chapter_titles"), limit=6)
    frameworks = compact_list(fields.get("core_frameworks"), limit=6)
    principles = compact_list(fields.get("signal_design_principles"), limit=6)

    user = (
        f"Using the extracted macro handbook record for {title}, explain how a strategist should think about quantamental signals and macro trading design."
    )
    assistant = structured_answer(
        objective=f"Map the training value of {title} into practical macro-strategy reasoning.",
        assumptions=[
            "This source focuses on systematic macro process rather than discretionary market commentary.",
            "The extracted themes emphasize point-in-time data discipline and signal construction.",
            "The goal is to train mechanism-based macro logic, not to copy handbook wording.",
        ],
        math_steps=[
            f"Subject areas emphasized: {sentence_join(subject_areas, 'No subject areas extracted.')}",
            f"Representative chapters: {sentence_join(chapter_titles, 'No chapter titles extracted.')}",
            f"Core frameworks: {sentence_join(frameworks, 'No core frameworks extracted.')}",
            f"Signal design principles: {sentence_join(principles, 'No signal design principles extracted.')}",
        ],
        recommendation="Use the handbook to train point-in-time macro reasoning, signal design discipline, and the causal link between economic states and tradable market positions.",
        drivers=compact_list(fields.get("analyst_relevance"), limit=5) or compact_list(record.get("strengths"), limit=4),
        risks=compact_list(record.get("weaknesses"), limit=3) or ["Methodology-heavy macro sources can underweight real-time narrative and event interpretation."],
        next_checks=[
            "Pair macro-handbook examples with current-event strategy prompts so outputs stay investor-relevant.",
            "Preserve point-in-time and no-lookahead principles in any downstream signal generation.",
            "Separate macro process training from company-specific valuation training.",
        ],
    )
    return make_example(system_prompt, "financial_reasoning", user, assistant)


def corpus_reference_article_example(system_prompt: str, record: Dict[str, Any]) -> Dict[str, List[Dict[str, str]]]:
    fields = record["fields"]
    title = fields.get("title") or record["title"]
    sections = compact_list(fields.get("sections"), limit=8)
    mechanisms = compact_list(fields.get("key_mechanisms"), limit=6)

    user = (
        f"Using the extracted reference article for {title}, explain the core macro indicators investors should watch and why they affect equities."
    )
    assistant = structured_answer(
        objective=f"Turn {title} into a concise market-mechanism primer for investors.",
        assumptions=[
            "This source is a reference explainer rather than a primary market document.",
            "Its value is in clear causal links between economic indicators and market pricing.",
            "The output should focus on mechanisms that generalize across market regimes.",
        ],
        math_steps=[
            f"Sections covered: {sentence_join(sections, 'No sections extracted.')}",
            f"Key market mechanisms: {sentence_join(mechanisms, 'No mechanisms extracted.')}",
            f"Topic focus: {fields.get('topic') or 'macro indicators and equity-market transmission'}.",
        ],
        recommendation="Use the article to train plain-English explanations of GDP, labor, inflation, retail sales, and production data, but rely on primary sources for live market calls.",
        drivers=compact_list(fields.get("analyst_relevance"), limit=5) or compact_list(record.get("strengths"), limit=4),
        risks=compact_list(record.get("weaknesses"), limit=3) or ["Secondary educational articles should not dominate a source-grounded analyst corpus."],
        next_checks=[
            "Use reference articles for explainer prompts, not source attribution on live data.",
            "Pair indicator primers with actual macro event notes to keep outputs practical.",
            "Prefer official releases when asking the model for current readings or dates.",
        ],
        citations=[f"[SOURCE] {record.get('file_path') or title}"],
    )
    return make_example(system_prompt, "financial_reasoning", user, assistant)


def corpus_earnings_transcript_example(system_prompt: str, record: Dict[str, Any]) -> Dict[str, List[Dict[str, str]]]:
    fields = record["fields"]
    title = fields.get("title") or record["title"]
    company_name = fields.get("company_name") or "the company"
    quarter = fields.get("quarter") or "the reported quarter"
    themes = compact_list(fields.get("management_themes"), limit=6)
    highlights = compact_list(fields.get("financial_highlights"), limit=6)
    excerpts = compact_list(fields.get("transcript_excerpts"), limit=3)
    outlook = compact_list(fields.get("guidance_or_outlook"), limit=5)
    qa_topics = compact_list(fields.get("qa_topics"), limit=5)

    user = (
        f"Using the extracted earnings transcript for {title}, explain what investors should focus on from management's remarks and the Q&A. "
        "Keep it grounded in the record."
    )
    assistant = structured_answer(
        objective=f"Translate the {quarter} earnings transcript for {company_name} into investor-relevant takeaways.",
        assumptions=[
            "Prepared remarks and Q&A are both useful because management emphasis and analyst pushback can differ.",
            "Transcript excerpts are used for interpretation and framing, not long verbatim quotation.",
            "The goal is to identify what management highlighted, what investors challenged, and what that means for underwriting.",
        ],
        math_steps=[
            f"Management themes: {sentence_join(themes, 'No management themes extracted.')}",
            f"Financial highlights emphasized: {sentence_join(highlights, 'No financial highlights extracted.')}",
            f"Transcript excerpts: {sentence_join(excerpts, 'No transcript excerpts extracted.')}",
            f"Guidance or outlook commentary: {sentence_join(outlook, 'No explicit outlook signals extracted.')}",
            f"Q&A focus areas: {sentence_join(qa_topics, 'No Q&A topics extracted.')}",
        ],
        recommendation=(
            "Use earnings transcripts to train how the model distinguishes reported numbers from the real signal in guidance, "
            "capacity constraints, monetization commentary, and management tone."
        ),
        drivers=compact_list(fields.get("analyst_relevance"), limit=5) or compact_list(record.get("strengths"), limit=4),
        risks=compact_list(record.get("weaknesses"), limit=3) or ["Transcripts can overweight management framing unless paired with filings or releases."],
        next_checks=[
            "Cross-check transcript claims against the press release and financial statements before changing model assumptions.",
            "Treat repeated management themes as more important than isolated talking points.",
            "Use the Q&A to identify what sophisticated investors still view as unresolved.",
        ],
        citations=[f"[SOURCE] {record.get('file_path') or title}"],
    )
    return make_example(system_prompt, "financial_reasoning", user, assistant)


def corpus_earnings_reference_example(system_prompt: str, record: Dict[str, Any]) -> Dict[str, List[Dict[str, str]]]:
    fields = record["fields"]
    title = fields.get("title") or record["title"]
    company_name = fields.get("company_name") or "the company"
    quarter = fields.get("quarter") or "the reported quarter"
    sections = compact_list(fields.get("sections"), limit=6)
    key_metrics = compact_list(fields.get("key_metrics"), limit=6)
    themes = compact_list(fields.get("management_themes"), limit=6)

    user = (
        f"Using the extracted earnings reference package for {title}, explain how an analyst should pull the most decision-useful information "
        f"from {company_name}'s {quarter} materials."
    )
    assistant = structured_answer(
        objective=f"Turn the {quarter} earnings reference package for {company_name} into an analyst workflow.",
        assumptions=[
            "This source may be a press release, prepared-remarks package, statement reference, or official investor-material summary.",
            "The value is in KPI extraction and management framing, not in recreating every page.",
            "Results interpretation should stay grounded in the extracted reference package.",
        ],
        math_steps=[
            f"Sections available: {sentence_join(sections, 'No sections extracted.')}",
            f"Key metrics emphasized: {sentence_join(key_metrics, 'No key metrics extracted.')}",
            f"Management themes: {sentence_join(themes, 'No management themes extracted.')}",
            f"Source name: {fields.get('source_name') or record.get('source_type') or 'earnings reference package'}.",
        ],
        recommendation=(
            "Use earnings reference packages to train KPI prioritization, segment attribution, and investor-facing compression, "
            "then pair them with transcripts or filings when you need tone or disclosure detail."
        ),
        drivers=compact_list(fields.get("analyst_relevance"), limit=5) or compact_list(record.get("strengths"), limit=4),
        risks=compact_list(record.get("weaknesses"), limit=3) or ["Reference packages can compress context and omit the adversarial Q&A layer."],
        next_checks=[
            "Separate reported metrics from narrative framing before updating any thesis.",
            "Use releases and statement packages for factual baselines, then layer on transcript nuance.",
            "Link the key metrics to the model assumptions most likely to move valuation or sentiment.",
        ],
        citations=[f"[SOURCE] {record.get('file_path') or title}"],
    )
    return make_example(system_prompt, "financial_reasoning", user, assistant)


def corpus_sec_example(system_prompt: str, record: Dict[str, Any]) -> Dict[str, List[Dict[str, str]]]:
    fields = record["fields"]
    title = fields.get("title") or record["title"]
    advisors = compact_list(fields.get("advisors"), limit=4)
    analyses = compact_list(fields.get("valuation_analyses"), limit=6)
    discount_rates = compact_list(fields.get("discount_rate_range"), limit=4)
    terminals = compact_list(fields.get("terminal_multiple_range"), limit=4)

    user = (
        f"Use the extracted SEC methodology record for {title} to summarize the disclosed valuation work and how it should inform merger-model training."
    )
    assistant = structured_answer(
        objective=f"Summarize transaction-methodology content in {title}.",
        assumptions=[
            "This record is curated from SEC valuation disclosures and is treated as methodology training, not memo voice.",
            "Ranges are extracted as disclosed and not interpolated beyond the record.",
            "Peer and transaction sets are used for methodology examples rather than live valuation calls.",
        ],
        math_steps=[
            f"Advisors involved: {sentence_join(advisors, 'No advisors extracted.')}",
            f"Analyses disclosed: {sentence_join(analyses, 'No analyses extracted.')}",
            f"Discount-rate ranges: {sentence_join(discount_rates, 'No discount-rate ranges extracted.')}",
            f"Terminal-multiple ranges: {sentence_join(terminals, 'No terminal multiple ranges extracted.')}",
        ],
        recommendation="Use SEC methodology sources to train DCF/comps parameter extraction and valuation-language grounding, not final memo tone.",
        drivers=compact_list(fields.get("peer_set"), limit=5) or compact_list(record.get("strengths"), limit=4),
        risks=compact_list(record.get("weaknesses"), limit=3) or ["Legalistic disclosure language can degrade memo quality if overweighted."],
        next_checks=[
            "Pair extracted methodology ranges with a clean workbook to teach mechanics end to end.",
            "Keep transaction-methodology examples separate from style-heavy investor-letter prompts.",
            "Replace manual overrides with stored local filing text when available.",
        ],
    )
    return make_example(system_prompt, "transaction_methodology", user, assistant)


def corpus_sec_public_filing_example(system_prompt: str, record: Dict[str, Any]) -> Dict[str, List[Dict[str, str]]]:
    fields = record["fields"]
    title = fields.get("title") or record["title"]
    forms = compact_list(fields.get("forms_covered"), limit=6)
    capital_markets = compact_list(fields.get("capital_markets_activity"), limit=4)
    capital_allocation = compact_list(fields.get("capital_allocation_activity"), limit=4)
    liquidity_notes = compact_list(fields.get("liquidity_notes"), limit=4)
    controls_and_risk = compact_list(fields.get("controls_and_risk_notes"), limit=5)

    user = (
        f"Using the extracted SEC public-filing record for {title}, explain what an analyst should pull from recent company filings and "
        "how those disclosures should affect underwriting."
    )
    assistant = structured_answer(
        objective=f"Translate recent SEC filing signals in {title} into underwriting-relevant takeaways.",
        assumptions=[
            "This record summarizes recent 10-Q and 8-K disclosures rather than a full historical filing set.",
            "Disclosures are used to identify financing, liquidity, governance, and risk signals, not to recreate full financial statements.",
            "Analyst takeaways should stay grounded in stated filings rather than inferred management intent.",
        ],
        math_steps=[
            f"Forms covered: {sentence_join(forms, 'No forms extracted.')}",
            f"Capital markets activity: {sentence_join(capital_markets, 'No capital markets signal extracted.')}",
            f"Capital allocation activity: {sentence_join(capital_allocation, 'No capital allocation signal extracted.')}",
            f"Liquidity notes: {sentence_join(liquidity_notes, 'No liquidity notes extracted.')}",
            f"Controls and risk disclosures: {sentence_join(controls_and_risk, 'No controls or risk notes extracted.')}",
        ],
        recommendation=(
            "Use recent public filings to update financing assumptions, liquidity runway, governance changes, and capital allocation posture "
            "before changing any valuation or credit underwriting view."
        ),
        drivers=compact_list(fields.get("analyst_relevance"), limit=5) or compact_list(record.get("strengths"), limit=4),
        risks=compact_list(record.get("weaknesses"), limit=3) or [
            "8-K items can be episodic and should not be over-weighted against recurring 10-Q disclosures."
        ],
        next_checks=[
            "Link the filing signals to the latest model assumptions for debt, buybacks, and liquidity.",
            "Separate recurring disclosure items from one-time board or financing events.",
            "Pull actual reported line items from structured facts if you need model-ready numbers rather than narrative signals.",
        ],
    )
    return make_example(system_prompt, "financial_reasoning", user, assistant)


def corpus_sec_merger_process_example(system_prompt: str, record: Dict[str, Any]) -> Dict[str, List[Dict[str, str]]]:
    fields = record["fields"]
    title = fields.get("title") or record["title"]
    consideration_terms = compact_list(fields.get("consideration_terms"), limit=4)
    ownership_mix = compact_list(fields.get("ownership_mix"), limit=3)
    vote_mechanics = compact_list(fields.get("vote_mechanics"), limit=4)
    closing_conditions = compact_list(fields.get("closing_conditions"), limit=3)
    timeline_notes = compact_list(fields.get("timeline_notes"), limit=3)

    user = (
        f"Using the extracted SEC merger-process record for {title}, explain what an analyst should pull from a registration statement "
        "before building merger-case assumptions."
    )
    assistant = structured_answer(
        objective=f"Turn the merger-process disclosures in {title} into an analyst-ready transaction checklist.",
        assumptions=[
            "This source is about process, consideration, and shareholder mechanics rather than standalone valuation ranges.",
            "Registration statements are treated as primary sources for transaction terms and required approvals.",
            "Ownership math and vote requirements should be extracted before making pro forma assumptions.",
        ],
        math_steps=[
            f"Consideration terms: {sentence_join(consideration_terms, 'No consideration terms extracted.')}",
            f"Ownership mix: {sentence_join(ownership_mix, 'No ownership split extracted.')}",
            f"Vote mechanics: {sentence_join(vote_mechanics, 'No vote mechanics extracted.')}",
            f"Closing conditions: {sentence_join(closing_conditions, 'No closing conditions extracted.')}",
            f"Timeline notes: {sentence_join(timeline_notes, 'No timing notes extracted.')}",
        ],
        recommendation=(
            "Use merger registration statements to anchor exchange ratio, ownership split, vote thresholds, and transaction timing "
            "before moving on to synergy or valuation work."
        ),
        drivers=compact_list(fields.get("analyst_relevance"), limit=5) or compact_list(record.get("strengths"), limit=4),
        risks=compact_list(record.get("weaknesses"), limit=3) or [
            "Process disclosures can be misread if they are not separated from valuation and fairness-opinion sections."
        ],
        next_checks=[
            "Reconcile the exchange ratio with the implied ownership split and fully diluted share counts.",
            "Check whether approvals, antitrust, or financing conditions remain outstanding.",
            "Pair process extracts with any separate valuation disclosure source before training merger analysis prompts.",
        ],
    )
    return make_example(system_prompt, "transaction_methodology", user, assistant)


def corpus_market_data_snapshot_example(system_prompt: str, record: Dict[str, Any]) -> Dict[str, List[Dict[str, str]]]:
    fields = record["fields"]
    title = fields.get("title") or record["title"]
    providers = compact_list(fields.get("providers_queried"), limit=8)
    quote_snapshot = compact_list(fields.get("quote_snapshot"), limit=6)
    fundamental_snapshot = compact_list(fields.get("fundamental_snapshot"), limit=6)
    provider_differences = compact_list(fields.get("provider_differences"), limit=6)
    market_context = compact_list(fields.get("market_context"), limit=4)

    user = (
        f"Using the extracted market-data snapshot record for {title}, explain how an analyst should reconcile "
        "quote and fundamentals data across providers before using the numbers in a model."
    )
    assistant = structured_answer(
        objective=f"Turn cross-provider market-data snapshots in {title} into a clean underwriting workflow.",
        assumptions=[
            "Provider outputs can disagree because of timing, endpoint coverage, and field definitions.",
            "Quote fields and fundamental fields should be reconciled separately rather than blended invisibly.",
            "If fields conflict, the analyst should prefer traceable values and preserve the source of each field.",
        ],
        math_steps=[
            f"Providers queried: {sentence_join(providers, 'No providers recorded.')}",
            f"Quote snapshot: {sentence_join(quote_snapshot, 'No quote snapshot recorded.')}",
            f"Fundamental snapshot: {sentence_join(fundamental_snapshot, 'No fundamentals snapshot recorded.')}",
            f"Provider differences: {sentence_join(provider_differences, 'No provider differences recorded.')}",
            f"Market context: {sentence_join(market_context, 'No market context recorded.')}",
        ],
        recommendation=(
            "Use cross-provider snapshots to teach provenance discipline, sanity-check market cap versus share count, "
            "and identify when a model should stop and ask for confirmation instead of silently filling gaps."
        ),
        drivers=compact_list(fields.get("analyst_relevance"), limit=5) or compact_list(record.get("strengths"), limit=4),
        risks=compact_list(record.get("weaknesses"), limit=3) or [
            "Provider snapshots can go stale quickly and should not be treated as durable fundamentals without timestamps."
        ],
        next_checks=[
            "Recalculate market cap from price and shares when both are available and compare it to provider-reported market cap.",
            "Separate stale quote issues from missing-fundamental issues before changing model assumptions.",
            "Prefer one explicit provider per field in downstream UI and model outputs.",
        ],
    )
    return make_example(system_prompt, "financial_reasoning", user, assistant)


def corpus_case_example(system_prompt: str, record: Dict[str, Any]) -> Dict[str, List[Dict[str, str]]]:
    fields = record["fields"]
    title = fields.get("title") or record["title"]
    methods = compact_list(fields.get("valuation_methods"), limit=6)
    assumptions = compact_list(fields.get("core_assumptions"), limit=5)

    user = (
        f"Using the extracted case record for {title}, outline how an analyst should approach the case and what outputs should be produced."
    )
    assistant = structured_answer(
        objective=f"Turn {title} into a reusable analyst case framework.",
        assumptions=[
            "This is an eval-style case source rather than a live company writeup.",
            "Only extracted assumptions and methods are used.",
            "Expected outputs should map to explicit case asks, not generic boilerplate.",
        ],
        math_steps=[
            f"Case type: {fields.get('case_type') or 'valuation case'}.",
            f"Expected valuation methods: {sentence_join(methods, 'No methods extracted.')}",
            f"Core assumptions captured: {sentence_join(assumptions, 'No assumptions extracted.')}",
            f"Decision required: {sentence_join(compact_list(fields.get('decision_required'), limit=3), 'No explicit decision prompt extracted.')}",
        ],
        recommendation="Use case-study records to train eval prompts and reasoning scaffolds, not final investor memo voice.",
        drivers=compact_list(fields.get("expected_outputs"), limit=5) or compact_list(record.get("strengths"), limit=4),
        risks=compact_list(record.get("weaknesses"), limit=3) or ["Educational cases can overfit the model to classroom phrasing."],
        next_checks=[
            "Build one grading rubric row for each expected output.",
            "Add a reasonableness check to every valuation case prompt.",
            "Hold out a subset of case records for eval-only use.",
        ],
    )
    return make_example(system_prompt, "eval_cases", user, assistant)


def corpus_generic_example(system_prompt: str, record: Dict[str, Any]) -> Dict[str, List[Dict[str, str]]]:
    fields = record["fields"]
    title = fields.get("title") or record["title"]
    notes = compact_list(fields.get("notes"), limit=5)
    user = f"Summarize what {title} adds to an investor training corpus and where it should be weighted."
    assistant = structured_answer(
        objective=f"Classify the training value of {title}.",
        assumptions=[
            "Generic extracted records are used when a source does not fit a narrower template.",
            "Classification is based on extracted notes and source metadata only.",
        ],
        math_steps=[
            f"Primary bucket: {record.get('primary_bucket')}.",
            f"Secondary bucket: {record.get('secondary_bucket') or 'none'}.",
            f"Extracted notes: {sentence_join(notes, 'No notes extracted.')}",
        ],
        recommendation="Use the source as supporting material unless a cleaner memo-style or mechanics source covers the same need better.",
        drivers=compact_list(record.get("strengths"), limit=4),
        risks=compact_list(record.get("weaknesses"), limit=3) or ["Generic records are lower signal than specialized templates."],
        next_checks=[
            "Promote the source only if it fills a gap that better-ranked materials do not cover.",
            "Normalize the extraction if you want to reuse it in many prompts.",
            "Keep generic records from dominating the dataset mix.",
        ],
    )
    return make_example(system_prompt, "memo_style", user, assistant)


def gen_corpus_examples(system_prompt: str, phase: int) -> List[Dict]:
    rows: List[Dict] = []
    for record in load_extracted_records(phase):
        template_key = record.get("template_key")
        if template_key == "investor_letter":
            rows.append(corpus_letter_example(system_prompt, record))
        elif template_key == "investor_presentation":
            rows.append(corpus_presentation_example(system_prompt, record))
        elif template_key == "workbook":
            rows.append(corpus_workbook_example(system_prompt, record))
        elif template_key == "finance_handbook":
            rows.append(corpus_finance_handbook_example(system_prompt, record))
        elif template_key == "macro_handbook":
            rows.append(corpus_macro_handbook_example(system_prompt, record))
        elif template_key == "reference_article":
            rows.append(corpus_reference_article_example(system_prompt, record))
        elif template_key == "earnings_transcript":
            rows.append(corpus_earnings_transcript_example(system_prompt, record))
        elif template_key == "earnings_reference":
            rows.append(corpus_earnings_reference_example(system_prompt, record))
        elif template_key == "sec_merger_doc":
            rows.append(corpus_sec_example(system_prompt, record))
        elif template_key == "sec_public_filing":
            rows.append(corpus_sec_public_filing_example(system_prompt, record))
        elif template_key == "sec_merger_process":
            rows.append(corpus_sec_merger_process_example(system_prompt, record))
        elif template_key == "market_data_snapshot":
            rows.append(corpus_market_data_snapshot_example(system_prompt, record))
        elif template_key == "case_study":
            rows.append(corpus_case_example(system_prompt, record))
        else:
            rows.append(corpus_generic_example(system_prompt, record))
    return rows


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

    out.extend(mark_eval_variant(gen_table_extraction_examples(system_prompt, 6)[:6]))
    out.extend(mark_eval_variant(gen_scrape_plan_examples(system_prompt, 6)[:6]))
    out.extend(mark_eval_variant(gen_web_research_examples(system_prompt, 3)[:3]))
    out.extend(mark_eval_variant(gen_modeling_template_examples(system_prompt, 3)[:3]))

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


def dedupe_rows(rows: List[Dict]) -> List[Dict]:
    unique: List[Dict] = []
    seen: set[str] = set()
    for row in rows:
        key = json.dumps(row, sort_keys=True, ensure_ascii=False)
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    return unique


def remove_overlaps(primary: List[Dict], candidates: List[Dict]) -> List[Dict]:
    primary_keys = {json.dumps(row, sort_keys=True, ensure_ascii=False) for row in primary}
    filtered: List[Dict] = []
    for row in candidates:
        key = json.dumps(row, sort_keys=True, ensure_ascii=False)
        if key in primary_keys:
            continue
        filtered.append(row)
    return filtered


def mark_eval_variant(rows: List[Dict]) -> List[Dict]:
    tagged: List[Dict] = []
    for row in rows:
        cloned = json.loads(json.dumps(row))
        user_content = cloned["messages"][1]["content"]
        if "\n" in user_content:
            first_line, rest = user_content.split("\n", 1)
            cloned["messages"][1]["content"] = f"{first_line}\nEvaluation-only variant.\n{rest}"
        else:
            cloned["messages"][1]["content"] = f"{user_content}\nEvaluation-only variant."
        tagged.append(cloned)
    return tagged


def main() -> None:
    system_prompt = read_system_prompt()

    training_rows: List[Dict] = []
    training_rows.extend(gen_corpus_examples(system_prompt, 1))
    training_rows.extend(gen_valuation_examples(system_prompt, 36))
    training_rows.extend(gen_saas_examples(system_prompt, 30))
    training_rows.extend(gen_fintech_examples(system_prompt, 28))
    training_rows.extend(gen_accounting_examples(system_prompt, 24))
    training_rows.extend(gen_web_research_examples(system_prompt, 20))
    training_rows.extend(gen_table_extraction_examples(system_prompt, 24))
    training_rows.extend(gen_scrape_plan_examples(system_prompt, 14))
    training_rows.extend(gen_modeling_template_examples(system_prompt, 14))
    training_rows = dedupe_rows(training_rows)

    eval_rows: List[Dict] = []
    eval_rows.extend(gen_corpus_examples(system_prompt, 2))
    eval_rows.extend(gen_eval_examples(system_prompt, 36))
    eval_rows = dedupe_rows(eval_rows)
    eval_rows = remove_overlaps(training_rows, eval_rows)
    if len(eval_rows) < 36:
        supplemental: List[Dict] = []
        supplemental.extend(mark_eval_variant(gen_valuation_examples(system_prompt, 24)))
        supplemental.extend(mark_eval_variant(gen_saas_examples(system_prompt, 24)))
        supplemental.extend(mark_eval_variant(gen_fintech_examples(system_prompt, 24)))
        supplemental.extend(mark_eval_variant(gen_accounting_examples(system_prompt, 16)))
        supplemental = dedupe_rows(supplemental)
        supplemental = remove_overlaps(training_rows, supplemental)
        supplemental = remove_overlaps(eval_rows, supplemental)
        eval_rows.extend(supplemental)
    eval_rows = eval_rows[:36]

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
