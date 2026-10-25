"""Filing text extraction, sectioning and chunking (synthetic HTML)."""

from aurelis_api.research.text import chunk_section, html_to_text, split_sections

IXBRL = """<html><head><title>x</title><style>p{}</style></head><body>
<div style="display:none"><ix:header><ix:hidden>HIDDEN-XBRL</ix:hidden></ix:header></div>
<p>Visible&nbsp;<b>text</b></p><script>var hidden=1;</script>
<table><tr><td>Revenue</td><td>1,200</td></tr></table><div style="display: none">also hidden</div><p>After</p>
</body></html>"""


def test_html_to_text_skips_hidden_inline_xbrl_and_scripts():
    t = html_to_text(IXBRL)
    assert "HIDDEN" not in t and "var hidden" not in t and "also hidden" not in t
    assert "Visible text" in t and "Revenue 1,200" in t and t.endswith("After")


def body(items):
    return "\n".join(f"Item {k}. {title}\n" + (f"{title} body text. " * n) for k, title, n in items)


TOC = "Table of Contents\nItem 1. Business\nItem 1A. Risk Factors\nItem 7. MD&A\nItem 16. Form 10-K Summary\n"


def test_10k_sections_skip_table_of_contents():
    text = (
        "Cover page text " * 30
        + "\n"
        + TOC
        + body(
            [("1", "Business", 80), ("1A", "Risk Factors", 200), ("7", "MD&A", 150), ("15", "Exhibits", 20), ("16", "Form 10-K Summary", 1)]
        )
    )
    secs = {s.key: s for s in split_sections(text, "10-K")}
    assert set(secs) == {"1", "1A", "7", "15", "16"}
    assert text[secs["1"].start :].startswith("Item 1. Business\nBusiness body")  # body, not the TOC line
    assert secs["16"].start > secs["15"].start  # TOC's "Item 16" must not capture the cover pages
    assert secs["1A"].end == secs["7"].start


def test_10q_part_two_reuses_item_numbers():
    toc = "Item 1. Financial Statements\nItem 2. MD&A\nItem 1. Legal Proceedings\nItem 1A. Risk Factors\nItem 2. Unregistered Sales\n"
    text = toc + body(
        [
            ("1", "Financial Statements", 150),
            ("2", "MD&A", 120),
            ("3", "Market Risk", 5),
            ("4", "Controls", 10),
            ("1", "Legal Proceedings", 15),
            ("1A", "Risk Factors", 90),
            ("2", "Unregistered Sales", 8),
            ("5", "Other", 3),
        ]
    )
    secs = {s.key: s for s in split_sections(text, "10-Q")}
    assert text[secs["2"].start :].startswith("Item 2. MD&A")
    assert text[secs["1A"].start :].startswith("Item 1A. Risk Factors\nRisk Factors body")
    assert "Legal Proceedings" not in text[secs["4"].start : secs["4"].end]


def test_annual_report_layout_falls_back_to_full_document():
    # Items only appear in a cross-reference index at the end (common for large banks).
    text = (
        "Management's discussion " * 400
        + "\nItem 1. Business\nsee page 5\nItem 7. MD&A\nsee page 40\nItem 15. Exhibits\n"
        + "exhibit " * 600
    )
    (only,) = split_sections(text, "10-K")
    assert only.key == "ALL" and "not located reliably" in only.title


def test_chunks_cover_section_with_overlap_and_word_boundaries():
    text = body([("1", "Business", 200)])
    (sec,) = split_sections(text, "10-K") or [None]
    chunks = chunk_section(text, sec, size=500, overlap=100)
    assert len(chunks) > 5 and chunks[0].start == sec.start and chunks[-1].end == sec.end
    for a, b in zip(chunks, chunks[1:], strict=False):
        assert b.start < a.end  # overlap
        assert text[b.start - 1] == " " or text[b.start - 1] == "\n"  # starts on a word boundary
        assert b.text in text[b.start : b.end] or text[b.start : b.end].strip() == b.text
