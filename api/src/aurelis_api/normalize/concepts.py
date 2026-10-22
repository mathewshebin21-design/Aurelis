"""Statement templates: each line maps to an ordered list of XBRL concepts.

The first concept with a value for a period wins, so a company that switched
from `SalesRevenueNet` to `RevenueFromContractWithCustomerExcludingAssessedTax`
(ASC 606) still produces one continuous revenue line, and every value records
which concept it came from.

Lines with `derive` are computed from other lines only when no candidate
concept was reported; lines with `always_derived` are never read from XBRL.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

Kind = Literal["money", "per_share", "shares"]
Statement = Literal["income", "balance", "cashflow"]


@dataclass(frozen=True)
class LineDef:
    key: str
    label: str
    statement: Statement
    concepts: tuple[str, ...] = ()
    kind: Kind = "money"
    instant: bool = False
    derive: str | None = None
    always_derived: bool = False
    taxonomy: str = "us-gaap"
    tags: tuple[str, ...] = field(default=())


LINES: tuple[LineDef, ...] = (
    # ── Income statement (duration) ─────────────────────────────────────────
    LineDef(
        "revenue",
        "Revenue",
        "income",
        (
            "Revenues",
            "RevenueFromContractWithCustomerExcludingAssessedTax",
            "RevenueFromContractWithCustomerIncludingAssessedTax",
            "SalesRevenueNet",
            "SalesRevenueGoodsNet",
            "RevenuesNetOfInterestExpense",
        ),
    ),
    LineDef(
        "cost_of_revenue",
        "Cost of revenue",
        "income",
        (
            "CostOfRevenue",
            "CostOfGoodsAndServicesSold",
            "CostOfGoodsSold",
            "CostOfServices",
        ),
    ),
    LineDef("gross_profit", "Gross profit", "income", ("GrossProfit",), derive="gross_profit_from_revenue_less_cost"),
    LineDef(
        "rnd",
        "Research & development",
        "income",
        (
            "ResearchAndDevelopmentExpense",
            "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost",
        ),
    ),
    LineDef("sga", "Selling, general & administrative", "income", ("SellingGeneralAndAdministrativeExpense",)),
    LineDef("operating_income", "Operating income (EBIT)", "income", ("OperatingIncomeLoss",)),
    LineDef(
        "depreciation_amortization",
        "Depreciation & amortisation",
        "cashflow",
        (
            "DepreciationDepletionAndAmortization",
            "DepreciationAndAmortization",
            "DepreciationAmortizationAndAccretionNet",
            "Depreciation",
        ),
    ),
    LineDef("ebitda", "EBITDA", "income", always_derived=True, derive="ebitda_from_ebit_plus_da"),
    LineDef(
        "interest_expense",
        "Interest expense",
        "income",
        (
            "InterestExpense",
            "InterestExpenseNonoperating",
            "InterestExpenseDebt",
        ),
    ),
    LineDef(
        "pretax_income",
        "Pre-tax income",
        "income",
        (
            "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
            "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
            "IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic",
        ),
    ),
    LineDef("income_tax", "Income tax", "income", ("IncomeTaxExpenseBenefit",)),
    LineDef("net_income", "Net income", "income", ("NetIncomeLoss", "ProfitLoss", "NetIncomeLossAvailableToCommonStockholdersBasic")),
    LineDef("eps_basic", "EPS — basic", "income", ("EarningsPerShareBasic",), kind="per_share"),
    LineDef("eps_diluted", "EPS — diluted", "income", ("EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"), kind="per_share"),
    LineDef(
        "diluted_shares",
        "Diluted weighted-average shares",
        "income",
        (
            "WeightedAverageNumberOfDilutedSharesOutstanding",
            "WeightedAverageNumberOfShareOutstandingBasicAndDiluted",
        ),
        kind="shares",
    ),
    # ── Balance sheet (instant) ─────────────────────────────────────────────
    LineDef(
        "cash",
        "Cash & equivalents",
        "balance",
        (
            "CashAndCashEquivalentsAtCarryingValue",
            "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
            "Cash",
        ),
        instant=True,
    ),
    LineDef(
        "short_term_investments",
        "Short-term investments",
        "balance",
        (
            "ShortTermInvestments",
            "MarketableSecuritiesCurrent",
            "AvailableForSaleSecuritiesDebtSecuritiesCurrent",
        ),
        instant=True,
    ),
    LineDef("receivables", "Receivables", "balance", ("AccountsReceivableNetCurrent", "ReceivablesNetCurrent"), instant=True),
    LineDef("inventory", "Inventory", "balance", ("InventoryNet",), instant=True),
    LineDef("current_assets", "Total current assets", "balance", ("AssetsCurrent",), instant=True),
    LineDef("ppe", "PP&E, net", "balance", ("PropertyPlantAndEquipmentNet",), instant=True),
    LineDef("goodwill", "Goodwill", "balance", ("Goodwill",), instant=True),
    LineDef("total_assets", "Total assets", "balance", ("Assets",), instant=True),
    LineDef("accounts_payable", "Accounts payable", "balance", ("AccountsPayableCurrent",), instant=True),
    LineDef("current_liabilities", "Total current liabilities", "balance", ("LiabilitiesCurrent",), instant=True),
    LineDef("short_term_borrowings", "Short-term borrowings", "balance", ("ShortTermBorrowings", "CommercialPaper"), instant=True),
    LineDef("long_term_debt_current", "Current portion of long-term debt", "balance", ("LongTermDebtCurrent", "DebtCurrent"), instant=True),
    LineDef("long_term_debt_noncurrent", "Long-term debt, non-current", "balance", ("LongTermDebtNoncurrent",), instant=True),
    LineDef("total_debt", "Total debt", "balance", always_derived=True, derive="total_debt_from_components", instant=True),
    LineDef(
        "total_liabilities", "Total liabilities", "balance", ("Liabilities",), instant=True, derive="liabilities_from_total_less_equity"
    ),
    LineDef(
        "equity",
        "Shareholders' equity",
        "balance",
        (
            "StockholdersEquity",
            "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
        ),
        instant=True,
    ),
    LineDef("liabilities_and_equity", "Total liabilities & equity", "balance", ("LiabilitiesAndStockholdersEquity",), instant=True),
    LineDef("shares_outstanding", "Common shares outstanding", "balance", ("CommonStockSharesOutstanding",), kind="shares", instant=True),
    # ── Cash flow (duration) ────────────────────────────────────────────────
    LineDef(
        "operating_cash_flow",
        "Cash from operations",
        "cashflow",
        (
            "NetCashProvidedByUsedInOperatingActivities",
            "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
        ),
    ),
    LineDef(
        "capex",
        "Capital expenditure",
        "cashflow",
        (
            "PaymentsToAcquirePropertyPlantAndEquipment",
            "PaymentsToAcquireProductiveAssets",
        ),
    ),
    LineDef("free_cash_flow", "Free cash flow", "cashflow", always_derived=True, derive="fcf_from_cfo_less_capex"),
    LineDef(
        "share_based_compensation",
        "Share-based compensation",
        "cashflow",
        ("ShareBasedCompensation", "AllocatedShareBasedCompensationExpense"),
    ),
    LineDef("dividends_paid", "Dividends paid", "cashflow", ("PaymentsOfDividends", "PaymentsOfDividendsCommonStock")),
    LineDef("share_repurchases", "Share repurchases", "cashflow", ("PaymentsForRepurchaseOfCommonStock",)),
)

BY_KEY = {line.key: line for line in LINES}

# Concept used to detect stock splits disclosed in XBRL.
SPLIT_RATIO_CONCEPT = "StockholdersEquityNoteStockSplitConversionRatio1"


def unit_matches(kind: Kind, unit: str) -> bool:
    """Monetary units are ISO currency codes; per-share units are '<CCY>/shares'."""
    if kind == "shares":
        return unit == "shares"
    if kind == "per_share":
        return unit.endswith("/shares") and len(unit.split("/")[0]) == 3
    return len(unit) == 3 and unit.isalpha() and unit.isupper()


def currency_of(unit: str) -> str | None:
    head = unit.split("/")[0]
    return head if len(head) == 3 and head.isalpha() and head.isupper() else None
