"""SYNTHETIC TEST FIXTURES — not real SEC data.

Payloads mimic the *shape* of SEC EDGAR JSON (company_tickers_exchange.json,
submissions, companyfacts) for two fictional issuers with CIKs in an unused
range. Values are chosen to make expected results easy to verify by hand;
they describe no real company.

Fixture Corp (CIK 9999901): fiscal year ends late September on a 52/53-week
calendar (FY2023 ends 2023-09-30, FY2024 ends 2024-09-28).
Euro Fixture SE (CIK 9999902): reports in EUR, December year end.
"""

from __future__ import annotations

from typing import Any

CIK = 9999901
CIK_EUR = 9999902

# Accessions (fictional)
K22 = "0009999901-22-000010"  # FY2022 10-K, filed 2022-11-01
K23 = "0009999901-23-000010"  # FY2023 10-K, filed 2023-11-03
K23A = "0009999901-24-000001"  # FY2023 10-K/A, filed 2024-01-15 (restates net income)
Q1_24 = "0009999901-24-000002"  # Q1 FY2024 10-Q, filed 2024-02-02
Q2_24 = "0009999901-24-000003"  # Q2 FY2024 10-Q, filed 2024-05-03
Q3_24 = "0009999901-24-000004"  # Q3 FY2024 10-Q, filed 2024-08-02 (discloses 4-for-1 split)
K24 = "0009999901-24-000010"  # FY2024 10-K, filed 2024-11-01

FY22 = ("2021-09-26", "2022-09-24")
FY23 = ("2022-09-25", "2023-09-30")
FY24 = ("2023-10-01", "2024-09-28")
Q1 = ("2023-10-01", "2023-12-30")
Q2 = ("2023-12-31", "2024-03-30")
Q3 = ("2024-03-31", "2024-06-29")
H1 = ("2023-10-01", "2024-03-30")
M9 = ("2023-10-01", "2024-06-29")

FILED = {
    K22: "2022-11-01",
    K23: "2023-11-03",
    K23A: "2024-01-15",
    Q1_24: "2024-02-02",
    Q2_24: "2024-05-03",
    Q3_24: "2024-08-02",
    K24: "2024-11-01",
}
FORM = {K22: "10-K", K23: "10-K", K23A: "10-K/A", Q1_24: "10-Q", Q2_24: "10-Q", Q3_24: "10-Q", K24: "10-K"}
FP = {
    K22: ("FY", 2022),
    K23: ("FY", 2023),
    K23A: ("FY", 2023),
    Q1_24: ("Q1", 2024),
    Q2_24: ("Q2", 2024),
    Q3_24: ("Q3", 2024),
    K24: ("FY", 2024),
}


def _row(period: tuple[str, str] | str, val: float, accn: str) -> dict[str, Any]:
    fp, fy = FP[accn]
    row: dict[str, Any] = {"val": val, "accn": accn, "fy": fy, "fp": fp, "form": FORM[accn], "filed": FILED[accn]}
    if isinstance(period, tuple):
        row["start"], row["end"] = period
    else:
        row["end"] = period
    return row


def _concept(unit: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {"label": "synthetic", "description": "synthetic", "units": {unit: rows}}


def company_facts() -> dict[str, Any]:
    usd = "USD"
    return {
        "cik": CIK,
        "entityName": "Fixture Corp (synthetic)",
        "facts": {
            "us-gaap": {
                # Revenue switches concept after FY2022 (pre-/post-ASC 606 style).
                "SalesRevenueNet": _concept(usd, [_row(FY22, 800_000_000, K22), _row(FY22, 800_000_000, K23)]),
                "RevenueFromContractWithCustomerExcludingAssessedTax": _concept(
                    usd,
                    [
                        _row(FY23, 1_000_000_000, K23),
                        _row(FY23, 1_000_000_000, K24),
                        _row(FY24, 1_200_000_000, K24),
                        _row(Q1, 280_000_000, Q1_24),
                        _row(Q2, 300_000_000, Q2_24),
                        _row(H1, 580_000_000, Q2_24),
                        _row(Q3, 290_000_000, Q3_24),
                        _row(M9, 870_000_000, Q3_24),
                    ],
                ),
                # Cost of revenue not reported for FY2022 → gross profit cannot be derived there.
                "CostOfGoodsAndServicesSold": _concept(usd, [_row(FY23, 600_000_000, K23), _row(FY24, 700_000_000, K24)]),
                "OperatingIncomeLoss": _concept(
                    usd, [_row(FY22, 150_000_000, K22), _row(FY23, 200_000_000, K23), _row(FY24, 260_000_000, K24)]
                ),
                "DepreciationDepletionAndAmortization": _concept(usd, [_row(FY23, 50_000_000, K23), _row(FY24, 60_000_000, K24)]),
                # FY2023 net income restated by a 10-K/A: 100m → 95m.
                "NetIncomeLoss": _concept(
                    usd,
                    [
                        _row(FY22, 110_000_000, K22),
                        _row(FY23, 100_000_000, K23),
                        _row(FY23, 95_000_000, K23A),
                        _row(FY23, 95_000_000, K24),
                        _row(FY24, 150_000_000, K24),
                    ],
                ),
                # 4-for-1 split in mid-2024. FY2023 EPS is re-reported split-adjusted in the FY2024 10-K;
                # FY2022 EPS is never re-reported after the split and must be adjusted by the pipeline.
                "EarningsPerShareDiluted": _concept(
                    "USD/shares",
                    [
                        _row(FY22, 5.00, K22),
                        _row(FY22, 5.00, K23),
                        _row(FY23, 6.00, K23),
                        _row(FY23, 1.50, K24),
                        _row(FY24, 1.80, K24),
                    ],
                ),
                "StockholdersEquityNoteStockSplitConversionRatio1": _concept("pure", [_row("2024-06-29", 4, Q3_24)]),
                # Cash flow: 10-Qs report year-to-date only.
                "NetCashProvidedByUsedInOperatingActivities": _concept(
                    usd,
                    [
                        _row(FY23, 240_000_000, K23),
                        _row(FY24, 300_000_000, K24),
                        _row(Q1, 60_000_000, Q1_24),
                        _row(H1, 130_000_000, Q2_24),
                        _row(M9, 210_000_000, Q3_24),
                    ],
                ),
                "PaymentsToAcquirePropertyPlantAndEquipment": _concept(usd, [_row(FY23, 40_000_000, K23), _row(FY24, 45_000_000, K24)]),
                # Balance sheet (instants).
                "Assets": _concept(
                    usd,
                    [
                        _row("2023-09-30", 2_000_000_000, K23),
                        _row("2023-09-30", 2_000_000_000, K24),
                        _row("2024-09-28", 2_300_000_000, K24),
                    ],
                ),
                "Liabilities": _concept(usd, [_row("2023-09-30", 1_200_000_000, K23), _row("2024-09-28", 1_350_000_000, K24)]),
                "StockholdersEquity": _concept(usd, [_row("2023-09-30", 800_000_000, K23), _row("2024-09-28", 950_000_000, K24)]),
                "LiabilitiesAndStockholdersEquity": _concept(
                    usd, [_row("2023-09-30", 2_000_000_000, K23), _row("2024-09-28", 2_300_000_000, K24)]
                ),
                "LongTermDebtNoncurrent": _concept(usd, [_row("2024-09-28", 400_000_000, K24)]),
                "LongTermDebtCurrent": _concept(usd, [_row("2024-09-28", 50_000_000, K24)]),
                "CashAndCashEquivalentsAtCarryingValue": _concept(
                    usd, [_row("2024-09-28", 300_000_000, K24), _row("2024-06-29", 280_000_000, Q3_24)]
                ),
            },
            "dei": {
                "EntityCommonStockSharesOutstanding": _concept("shares", [_row("2024-10-20", 400_000_000, K24)]),
            },
        },
    }


def submissions() -> dict[str, Any]:
    accs = [K24, Q3_24, Q2_24, Q1_24, K23A, K23, K22]
    report = {
        K22: "2022-09-24",
        K23: "2023-09-30",
        K23A: "2023-09-30",
        Q1_24: "2023-12-30",
        Q2_24: "2024-03-30",
        Q3_24: "2024-06-29",
        K24: "2024-09-28",
    }
    return {
        "cik": str(CIK),
        "name": "Fixture Corp (synthetic)",
        "entityType": "operating",
        "sic": "3571",
        "sicDescription": "Synthetic Test Industry",
        "fiscalYearEnd": "0928",
        "stateOfIncorporation": "DE",
        "tickers": ["FXTR"],
        "exchanges": ["Nasdaq"],
        "filings": {
            "recent": {
                "accessionNumber": accs,
                "form": [FORM[a] for a in accs],
                "filingDate": [FILED[a] for a in accs],
                "reportDate": [report[a] for a in accs],
                "primaryDocument": [f"fxtr-{a[-6:]}.htm" for a in accs],
            }
        },
    }


def tickers() -> dict[str, Any]:
    return {
        "fields": ["cik", "name", "ticker", "exchange"],
        "data": [[CIK, "Fixture Corp (synthetic)", "FXTR", "Nasdaq"], [CIK_EUR, "Euro Fixture SE (synthetic)", "EUFX", None]],
    }


def eur_company_facts() -> dict[str, Any]:
    acc = "0009999902-25-000001"
    row = {"accn": acc, "fy": 2024, "fp": "FY", "form": "20-F", "filed": "2025-03-01"}
    return {
        "cik": CIK_EUR,
        "entityName": "Euro Fixture SE (synthetic)",
        "facts": {
            "ifrs-full": {},
            "us-gaap": {
                "Revenues": {"units": {"EUR": [{**row, "start": "2024-01-01", "end": "2024-12-31", "val": 5_000_000}]}},
                "Assets": {"units": {"EUR": [{**row, "end": "2024-12-31", "val": 9_000_000}]}},
            },
        },
    }
