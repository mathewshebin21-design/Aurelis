"""Filing text: HTML → plain text → Item sections → overlapping chunks with character offsets.

Offsets index into the stored plain text of the filing, so every chunk (and
every quotation the verifier checks) can be located exactly in its source.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass
from html.parser import HTMLParser

_BLOCK = {"p", "div", "br", "tr", "li", "h1", "h2", "h3", "h4", "h5", "h6", "table", "section", "article"}
_SKIP = {"script", "style", "head", "title"}
_HIDDEN_IX = {"ix:header", "ix:hidden"}


_VOID = {"br", "img", "hr", "meta", "input", "link", "col", "area", "base", "wbr", "source"}


class _TextExtractor(HTMLParser):
    """Collects visible text. Hidden subtrees (scripts, styles, inline-XBRL headers,
    display:none blocks) are skipped by tracking them on a tag stack."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._stack: list[tuple[str, bool]] = []  # (tag, hidden)

    @property
    def _hidden(self) -> bool:
        return any(h for _, h in self._stack)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        style = (dict(attrs).get("style") or "").replace(" ", "").lower()
        hidden = tag in _SKIP or tag in _HIDDEN_IX or "display:none" in style
        if tag in _BLOCK and not self._hidden:
            self.parts.append("\n")
        elif tag in ("td", "th") and not self._hidden:
            self.parts.append(" ")
        if tag not in _VOID:
            self._stack.append((tag, hidden))

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in _BLOCK and not self._hidden:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        # Tolerate malformed HTML: close back to the matching open tag if there is one.
        for i in range(len(self._stack) - 1, -1, -1):
            if self._stack[i][0] == tag:
                del self._stack[i:]
                break
        if tag in _BLOCK and not self._hidden:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self._hidden:
            self.parts.append(data)


def html_to_text(raw: str) -> str:
    """Readable plain text from an (inline-XBRL) filing document."""
    p = _TextExtractor()
    p.feed(raw)
    text = html.unescape("".join(p.parts)).replace("\xa0", " ")
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


# 10-K items (Regulation S-K). 10-Q Part I uses Items 1–4 with different meanings; see `section_names`.
TEN_K_ITEMS = {
    "1": "Business",
    "1A": "Risk Factors",
    "1B": "Unresolved Staff Comments",
    "1C": "Cybersecurity",
    "2": "Properties",
    "3": "Legal Proceedings",
    "4": "Mine Safety Disclosures",
    "5": "Market for Common Equity",
    "6": "Reserved",
    "7": "Management's Discussion and Analysis",
    "7A": "Quantitative and Qualitative Disclosures About Market Risk",
    "8": "Financial Statements and Supplementary Data",
    "9": "Changes in and Disagreements with Accountants",
    "9A": "Controls and Procedures",
    "9B": "Other Information",
    "9C": "Foreign Jurisdictions that Prevent Inspections",
    "10": "Directors and Executive Officers",
    "11": "Executive Compensation",
    "12": "Security Ownership",
    "13": "Certain Relationships",
    "14": "Principal Accountant Fees",
    "15": "Exhibits",
    "16": "Form 10-K Summary",
}
TEN_Q_ITEMS = {
    "1": "Financial Statements",
    "2": "Management's Discussion and Analysis",
    "3": "Market Risk",
    "4": "Controls and Procedures",
    "1A": "Risk Factors",
}

_ITEM_RE = re.compile(r"^item\s*(\d{1,2}[a-c]?)\s*[.:\-—–]?\s*(.{0,120})$", re.IGNORECASE | re.MULTILINE)


@dataclass(frozen=True)
class Section:
    key: str  # e.g. "1A"
    title: str
    start: int
    end: int


def split_sections(text: str, form: str) -> list[Section]:
    """Locate Item sections.

    The table of contents repeats every heading. Items are therefore chosen in canonical
    order: the first item takes its longest occurrence (the body, not the TOC line), and each
    later item must start after the previously chosen one. That keeps TOC entries (e.g. a
    one-line "Item 16" before the body) from swallowing the cover pages."""
    names = TEN_Q_ITEMS if form.startswith("10-Q") else TEN_K_ITEMS
    order = list(names)  # dicts above are in filing order (10-Q: Part I items, then Part II's 1A)
    every = [(m.start(), m.group(1).upper()) for m in _ITEM_RE.finditer(text)]
    heads = [(p, k) for p, k in every if k in names]
    if not heads:
        return [Section("ALL", "Full document", 0, len(text))]
    positions = [p for p, _ in every]  # any Item heading bounds a section, tracked or not

    def span(pos: int) -> int:
        later = [p for p in positions if p > pos]
        return (later[0] if later else len(text)) - pos

    chosen: dict[str, int] = {}
    floor = -1
    for key in order:
        cands = [p for p, k in heads if k == key and p > floor]
        if not cands:
            continue
        pos = max(cands, key=span)
        chosen[key] = pos
        floor = pos
    starts = sorted((p, k) for k, p in chosen.items())
    sections = [Section(k, names[k], p, p + span(p)) for p, k in starts]  # each ends at the next heading of any kind
    return (
        sections
        if _plausible(sections, len(text), form)
        else [Section("ALL", "Full document (item headings not located reliably)", 0, len(text))]
    )


def _plausible(sections: list[Section], total: int, form: str) -> bool:
    """Reject layouts where Item headings only appear in a cross-reference index.

    Some issuers (e.g. large banks) file an "annual report" layout: the Items are listed in an
    index at the end, so the "longest span" heuristic attributes the whole report to Item 15/16.
    Mislabelled sections are worse than none, so such documents fall back to one section."""
    if total == 0:
        return False
    size = {s.key: s.end - s.start for s in sections}
    largest = max(size, key=lambda k: size[k])
    if form.startswith("10-K"):
        tail_items = {"10", "11", "12", "13", "14", "15", "16"}
        core = size.get("1A", 0) + size.get("7", 0)
        return largest not in tail_items and core >= 0.05 * total
    return size.get("2", 0) >= 0.03 * total  # 10-Q: MD&A must be substantive


@dataclass(frozen=True)
class Chunk:
    section: str
    ordinal: int
    start: int
    end: int
    text: str


def chunk_section(text: str, section: Section, size: int = 1500, overlap: int = 200) -> list[Chunk]:
    """Overlapping chunks that end on sentence or paragraph boundaries where possible."""
    out: list[Chunk] = []
    pos, n = section.start, 0
    while pos < section.end:
        hard = min(pos + size, section.end)
        end = hard
        if hard < section.end:
            window = text[pos + size // 2 : hard]
            cut = max(window.rfind("\n"), window.rfind(". "))
            if cut != -1:
                end = pos + size // 2 + cut + 1
        piece = text[pos:end].strip()
        if len(piece) > 40:  # skip page-number fragments and blank headings
            out.append(Chunk(section.key, n, pos, end, piece))
            n += 1
        if end >= section.end:
            break
        nxt = max(end - overlap, pos + 1)
        space = text.find(" ", nxt, end)  # start the overlap on a word boundary
        pos = space + 1 if space != -1 else nxt
    return out
