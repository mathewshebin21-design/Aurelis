"""Turn as-reported XBRL facts into normalised statement lines with provenance.

Every output line is one of:
  reported — copied from one XBRL fact (concept + accession recorded)
  derived  — computed by a named rule from other lines (rule_id recorded)
  missing  — no value; `notes` explains why. Nothing is imputed.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, field, replace
from datetime import date
from decimal import Decimal

from .concepts import BY_KEY, LINES, LineDef, currency_of, unit_matches
from .periods import duration_kind, fiscal_period_for, infer_fye, parse_fye
from .restatements import FactRecord, Selected, select_latest
from .splits import SplitAction, adjust, split_factor

PeriodKey = tuple[str, int, str]  # (period_type "FY"|"Q", fiscal_year, fiscal_period "FY"|"Q1".."Q4")


@dataclass
class LineValue:
    line_key: str
    statement: str
    period_type: str
    fiscal_year: int
    fiscal_period: str
    period_start: date | None
    period_end: date
    value: Decimal | None
    unit: str | None
    currency: str | None
    status: str
    source_concept: str | None = None
    source_accession: str | None = None
    source_form: str | None = None
    source_filed: date | None = None
    rule_id: str | None = None
    restated: bool = False
    original_value: Decimal | None = None
    split_factor: Decimal | None = None
    notes: list[str] = field(default_factory=list)

    @property
    def period(self) -> PeriodKey:
        return (self.period_type, self.fiscal_year, self.fiscal_period)


@dataclass
class NormalizationResult:
    lines: list[LineValue]
    reporting_currency: str | None
    fiscal_year_end: tuple[int, int] | None
    warnings: list[str]


def num(v: LineValue) -> Decimal:
    """Value of a line already known to be present (callers check `value is not None`)."""
    if v.value is None:
        raise ValueError(f"{v.line_key} has no value")
    return v.value


def reporting_currency(facts: Iterable[FactRecord]) -> str | None:
    anchor = {"Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "Assets", "NetIncomeLoss"}
    counts: Counter[str] = Counter()
    fallback: Counter[str] = Counter()
    for f in facts:
        ccy = currency_of(f.unit)
        if ccy and "/" not in f.unit:
            fallback[ccy] += 1
            if f.concept in anchor:
                counts[ccy] += 1
    best = counts or fallback
    return best.most_common(1)[0][0] if best else None


def _reported(line: LineDef, sel: Selected, pk: PeriodKey, currency: str | None) -> LineValue:
    f = sel.fact
    notes = []
    if sel.restated:
        notes.append(
            f"Restated ({sel.restatement_cause}): originally {sel.original.value} in {sel.original.accession} "
            f"({sel.original.form}, filed {sel.original.filed}); now {f.value} per {f.accession} ({f.form}, filed {f.filed})"
        )
    return LineValue(
        line_key=line.key,
        statement=line.statement,
        period_type=pk[0],
        fiscal_year=pk[1],
        fiscal_period=pk[2],
        period_start=f.start,
        period_end=f.end,
        value=f.value,
        unit=f.unit,
        currency=currency,
        status="reported",
        source_concept=f"{f.taxonomy}:{f.concept}",
        source_accession=f.accession,
        source_form=f.form,
        source_filed=f.filed,
        restated=sel.restated,
        original_value=sel.original.value if sel.restated else None,
        notes=notes,
    )


def _derived(line: LineDef, base: LineValue, value: Decimal, rule: str, inputs: list[LineValue], start: date | None = None) -> LineValue:
    return LineValue(
        line_key=line.key,
        statement=line.statement,
        period_type=base.period_type,
        fiscal_year=base.fiscal_year,
        fiscal_period=base.fiscal_period,
        period_start=start if start is not None else base.period_start,
        period_end=base.period_end,
        value=value,
        unit=base.unit,
        currency=base.currency,
        status="derived",
        rule_id=rule,
        restated=any(i.restated for i in inputs),
        notes=[f"{rule}: from " + ", ".join(f"{i.line_key}[{i.fiscal_period} {i.fiscal_year}]" for i in inputs)],
    )


def normalize(
    facts: list[FactRecord],
    *,
    fiscal_year_end: str | None = None,
    split_actions: list[SplitAction] | None = None,
) -> NormalizationResult:
    warnings: list[str] = []
    actions = split_actions or []
    selected = select_latest(facts)
    currency = reporting_currency(facts)

    fy_ends = [
        k[4]
        for k, s in selected.items()
        if k[3] is not None and duration_kind(k[3], k[4]) == "FY" and k[1] in BY_KEY["revenue"].concepts + BY_KEY["net_income"].concepts
    ]
    fye = parse_fye(fiscal_year_end) or infer_fye(fy_ends)
    if fye is None:
        return NormalizationResult([], currency, None, ["Cannot determine fiscal year end; no statements produced"])
    if parse_fye(fiscal_year_end) is None:
        warnings.append(f"Fiscal year end inferred from reported periods: {fye[0]:02d}-{fye[1]:02d}")

    # Index selected facts by concept for fast lookup.
    by_concept: dict[str, list[Selected]] = defaultdict(list)
    for (tax, concept, _unit, _s, _e), sel in selected.items():
        by_concept[f"{tax}:{concept}"].append(sel)

    values: dict[tuple[str, PeriodKey], LineValue] = {}
    # Duration pieces that are not standalone periods, used to derive quarters: (line, fy, months) -> value
    ytd: dict[tuple[str, int, int], LineValue] = {}

    for line in LINES:
        if line.always_derived or not line.concepts:
            continue
        want_ccy = currency
        for concept in line.concepts:  # priority order: earlier concepts win per period
            for sel in by_concept.get(f"{line.taxonomy}:{concept}", []):
                f = sel.fact
                if not unit_matches(line.kind, f.unit):
                    continue
                if line.kind != "shares" and currency_of(f.unit) != want_ccy:
                    continue
                if line.instant:
                    if f.start is not None:
                        continue
                    fp = fiscal_period_for(f.end, fye)
                    keys: list[PeriodKey] = [("Q", fp.fiscal_year, f"Q{fp.quarter}")]
                    if fp.quarter == 4:
                        keys.append(("FY", fp.fiscal_year, "FY"))
                    for pk in keys:
                        values.setdefault((line.key, pk), _reported(line, sel, pk, want_ccy))
                    continue
                if f.start is None:
                    continue
                kind = duration_kind(f.start, f.end)
                fp = fiscal_period_for(f.end, fye)
                if kind == "FY":
                    values.setdefault(
                        (line.key, ("FY", fp.fiscal_year, "FY")), _reported(line, sel, ("FY", fp.fiscal_year, "FY"), want_ccy)
                    )
                elif kind == "Q":
                    pk = ("Q", fp.fiscal_year, f"Q{fp.quarter}")
                    values.setdefault((line.key, pk), _reported(line, sel, pk, want_ccy))
                elif kind in ("H1", "9M"):
                    months = 6 if kind == "H1" else 9
                    ytd.setdefault(
                        (line.key, fp.fiscal_year, months), _reported(line, sel, ("Q", fp.fiscal_year, f"YTD{months}"), want_ccy)
                    )

    _derive_quarters(values, ytd)
    _derive_lines(values)
    _apply_splits(values, actions)
    lines = _with_missing(values)
    return NormalizationResult(lines, currency, fye, warnings)


def _derive_quarters(values: dict[tuple[str, PeriodKey], LineValue], ytd: dict[tuple[str, int, int], LineValue]) -> None:
    """Fill 3-month quarters from year-to-date figures (10-Q cash flows are YTD-only)."""
    duration_lines = [d for d in LINES if not d.instant and not d.always_derived and d.kind == "money"]
    years = {pk[1] for (_k, pk) in values} | {y for (_k, y, _m) in ytd}
    for line in duration_lines:
        for y in sorted(years):
            q = {i: values.get((line.key, ("Q", y, f"Q{i}"))) for i in range(1, 5)}
            cum = {3: q[1], 6: ytd.get((line.key, y, 6)), 9: ytd.get((line.key, y, 9)), 12: values.get((line.key, ("FY", y, "FY")))}

            def put(i: int, later: LineValue, earlier: LineValue, rule: str, line: LineDef = line, y: int = y, q: dict = q) -> None:
                if later.period_start != earlier.period_start or later.value is None or earlier.value is None:
                    return  # pieces must share the fiscal-year start to be subtracted
                pk: PeriodKey = ("Q", y, f"Q{i}")
                base = replace(later, period_type="Q", fiscal_period=f"Q{i}")
                values[(line.key, pk)] = _derived(BY_KEY[line.key], base, num(later) - num(earlier), rule, [later, earlier], start=None)
                q[i] = values[(line.key, pk)]

            if q[2] is None and cum[6] and cum[3]:
                put(2, cum[6], cum[3], "q2_from_h1_less_q1")
            if q[3] is None and cum[9] and cum[6]:
                put(3, cum[9], cum[6], "q3_from_9m_less_h1")
            if q[4] is None and cum[12]:
                if cum[9]:
                    put(4, cum[12], cum[9], "q4_from_fy_less_9m")
                elif q[1] and q[2] and q[3] and all(v.value is not None for v in (q[1], q[2], q[3])):
                    total = num(q[1]) + num(q[2]) + num(q[3])
                    fy = cum[12]
                    base = replace(fy, period_type="Q", fiscal_period="Q4")
                    values[(line.key, ("Q", y, "Q4"))] = _derived(
                        BY_KEY[line.key], base, num(fy) - total, "q4_from_fy_less_q1_q2_q3", [fy, q[1], q[2], q[3]], start=None
                    )


def _derive_lines(values: dict[tuple[str, PeriodKey], LineValue]) -> None:
    periods = {pk for (_k, pk) in values}

    def get(key: str, pk: PeriodKey) -> LineValue | None:
        v = values.get((key, pk))
        return v if v is not None and v.value is not None else None

    for pk in periods:
        rev, cogs = get("revenue", pk), get("cost_of_revenue", pk)
        if get("gross_profit", pk) is None and rev and cogs:
            values[("gross_profit", pk)] = _derived(
                BY_KEY["gross_profit"], rev, num(rev) - num(cogs), "gross_profit_from_revenue_less_cost", [rev, cogs]
            )
        ebit, da = get("operating_income", pk), get("depreciation_amortization", pk)
        if ebit and da:
            values[("ebitda", pk)] = _derived(BY_KEY["ebitda"], ebit, num(ebit) + num(da), "ebitda_from_ebit_plus_da", [ebit, da])
        cfo, capex = get("operating_cash_flow", pk), get("capex", pk)
        if cfo and capex:
            values[("free_cash_flow", pk)] = _derived(
                BY_KEY["free_cash_flow"], cfo, num(cfo) - abs(num(capex)), "fcf_from_cfo_less_capex", [cfo, capex]
            )
        parts = [
            p for p in (get("short_term_borrowings", pk), get("long_term_debt_current", pk), get("long_term_debt_noncurrent", pk)) if p
        ]
        if parts:
            d = _derived(BY_KEY["total_debt"], parts[0], sum((num(p) for p in parts), Decimal(0)), "total_debt_from_components", parts)
            if len(parts) < 3:
                d.notes.append("Partial: not every debt component was reported for this period")
            values[("total_debt", pk)] = d
        le, eq = get("liabilities_and_equity", pk), get("equity", pk)
        if get("total_liabilities", pk) is None and le and eq:
            d = _derived(BY_KEY["total_liabilities"], le, num(le) - num(eq), "liabilities_from_total_less_equity", [le, eq])
            d.notes.append("Includes non-controlling interests and mezzanine equity if the issuer reports them outside equity")
            values[("total_liabilities", pk)] = d


def _apply_splits(values: dict[tuple[str, PeriodKey], LineValue], actions: list[SplitAction]) -> None:
    if not actions:
        return
    for v in values.values():
        line = BY_KEY[v.line_key]
        if line.kind == "money" or v.value is None or v.source_filed is None:
            continue
        factor = split_factor(v.period_end, v.source_filed, actions)
        if factor != 1:
            v.value = adjust(v.value, line.kind, factor)
            v.split_factor = factor
            v.notes.append(f"Adjusted for stock split(s) after filing: factor {factor}")


def _with_missing(values: dict[tuple[str, PeriodKey], LineValue]) -> list[LineValue]:
    """Add explicit `missing` rows so gaps are visible rather than silently absent."""
    out = list(values.values())
    by_period: dict[PeriodKey, dict[str, LineValue]] = defaultdict(dict)
    for (key, pk), v in values.items():
        by_period[pk][key] = v
    for pk, present in by_period.items():
        anchor = next(iter(present.values()))
        statements_present = {BY_KEY[k].statement for k, v in present.items() if v.status != "missing"}
        for line in LINES:
            if line.key in present or line.statement not in statements_present:
                continue
            if pk[0] == "Q" and line.kind == "per_share" and pk[2] == "Q4":
                reason = "Q4 per-share values are not reported in 10-Qs and cannot be derived by subtraction"
            elif line.always_derived or line.derive:
                reason = "Not reported, and the inputs needed to derive it are missing"
            else:
                reason = "None of the mapped XBRL concepts was reported for this period: " + ", ".join(line.concepts)
            out.append(
                LineValue(
                    line_key=line.key,
                    statement=line.statement,
                    period_type=pk[0],
                    fiscal_year=pk[1],
                    fiscal_period=pk[2],
                    period_start=None,
                    period_end=anchor.period_end,
                    value=None,
                    unit=None,
                    currency=anchor.currency,
                    status="missing",
                    notes=[reason],
                )
            )
    out.sort(key=lambda v: (v.period_type, v.fiscal_year, v.fiscal_period, v.statement, v.line_key))
    return out
