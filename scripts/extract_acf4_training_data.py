from __future__ import annotations

import argparse
import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from pypdf import PdfReader


DEFAULT_PDF_PATH = Path("/Users/averyromain/Downloads/acf4Ebook.pdf")
DEFAULT_OUTPUT_DIR = Path("/Users/averyromain/FinModAI/data/training/acf4ebook")
MAX_CHUNK_CHARS = 2200
MIN_CHUNK_CHARS = 900


CHAPTER_LINE_RE = re.compile(r"^\s*(?:\d+(?:\.\d+)?)?\s*CHAPTER\s+(\d+)\s+(.+)$", re.IGNORECASE)
CHAPTER_ONLY_RE = re.compile(r"^\s*(?:\d+(?:\.\d+)?)?\s*CHAPTER\s+(\d+)\s*$", re.IGNORECASE)
TOP_LEVEL_SECTION_RE = re.compile(r"^\s*(\d+)\.\s+(.+)$")
LIVE_CASE_RE = re.compile(r"Live Case Study\s+([IVXLC]+)\.?\s*(.+)?", re.IGNORECASE)
ILLUSTRATION_RE = re.compile(r"Illustration\s+(\d+(?:\.\d+)?)[:.]?\s*(.+)?", re.IGNORECASE)
CONCEPT_RE = re.compile(r"^\s*(\d+\.\d+)\.\s+(.+)")


@dataclass
class PageRecord:
    page: int
    text: str


@dataclass
class ChapterMarker:
    number: int
    title: str
    start_page: int


def slugify_name(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = value.strip("-")
    return value or "document"


def build_paths(args: argparse.Namespace) -> tuple[Path, Path, str]:
    pdf_path = Path(args.pdf).expanduser()
    dataset_slug = args.slug or slugify_name(pdf_path.stem)
    output_dir = Path(args.output_dir).expanduser() if args.output_dir else DEFAULT_OUTPUT_DIR.parent / dataset_slug
    return pdf_path, output_dir, dataset_slug


def normalize_text(text: str) -> str:
    if not text:
        return ""

    text = unicodedata.normalize("NFKC", text)
    text = text.replace("\u00ad", "")
    text = text.replace("\ufb01", "fi").replace("\ufb02", "fl")
    text = text.replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"(?m)^\s*\d+\s*$", "", text)
    return text.strip()


def read_pdf_pages(path: Path) -> list[PageRecord]:
    reader = PdfReader(str(path))
    pages: list[PageRecord] = []
    for index, page in enumerate(reader.pages, start=1):
        raw_text = page.extract_text() or ""
        text = normalize_text(raw_text)
        if text:
            pages.append(PageRecord(page=index, text=text))
    return pages


def find_chapter_markers(pages: Iterable[PageRecord]) -> list[ChapterMarker]:
    markers: list[ChapterMarker] = []
    seen_chapters: set[int] = set()

    for page in pages:
        lines = [line.strip() for line in page.text.splitlines() if line.strip()]
        header_window = lines[:10]
        for idx, line in enumerate(header_window):
            match = CHAPTER_LINE_RE.match(line)
            chapter_number: int | None = None
            title: str | None = None

            if match:
                chapter_number = int(match.group(1))
                title = compact_title(match.group(2))
            else:
                chapter_only = CHAPTER_ONLY_RE.match(line)
                if chapter_only and idx + 1 < len(header_window):
                    chapter_number = int(chapter_only.group(1))
                    title = compact_title(header_window[idx + 1])

            if chapter_number is None:
                continue
            if chapter_number in seen_chapters:
                break

            markers.append(ChapterMarker(number=chapter_number, title=title or f"Chapter {chapter_number}", start_page=page.page))
            seen_chapters.add(chapter_number)
            break

    return markers


def find_top_level_section_markers(pages: Iterable[PageRecord]) -> list[ChapterMarker]:
    markers: list[ChapterMarker] = []
    seen_sections: set[int] = set()

    for page in pages:
        lines = [line.strip() for line in page.text.splitlines() if line.strip()]
        header_window = lines[:5]
        for line in header_window:
            match = TOP_LEVEL_SECTION_RE.match(line)
            if not match:
                continue

            section_number = int(match.group(1))
            if section_number in seen_sections:
                break

            title = compact_title(match.group(2))
            markers.append(ChapterMarker(number=section_number, title=title or f"Section {section_number}", start_page=page.page))
            seen_sections.add(section_number)
            break

    return markers


def normalize_heading(value: str | None) -> str | None:
    if not value:
        return None
    value = value.replace("\n", " ")
    value = re.sub(r"\s+", " ", value).strip(" .:-")
    return value or None


def compact_title(value: str | None, max_chars: int = 140) -> str | None:
    value = normalize_heading(value)
    if not value:
        return None
    if len(value) <= max_chars:
        return value
    return f"{value[: max_chars - 1].rstrip()}…"


def chapter_for_page(page_number: int, markers: list[ChapterMarker]) -> ChapterMarker | None:
    current: ChapterMarker | None = None
    for marker in markers:
        if marker.start_page <= page_number:
            current = marker
        else:
            break
    return current


def detect_section_type(text: str) -> tuple[str, str | None]:
    first_lines = [line.strip() for line in text.splitlines()[:6] if line.strip()]
    joined = "\n".join(first_lines)

    live_case = LIVE_CASE_RE.search(joined)
    if live_case:
        return "live_case", normalize_heading(" ".join(part for part in live_case.groups() if part))

    illustration = ILLUSTRATION_RE.search(joined)
    if illustration:
        return "illustration", normalize_heading(" ".join(part for part in illustration.groups() if part))

    for line in first_lines:
        concept = CONCEPT_RE.match(line)
        if concept:
            return "concept_question", normalize_heading(f"{concept.group(1)} {concept.group(2)}")

    return "chapter_text", None


def paragraphs_from_page(text: str) -> list[str]:
    pieces = [piece.strip() for piece in re.split(r"\n\s*\n", text) if piece.strip()]
    normalized: list[str] = []
    for piece in pieces:
        piece = re.sub(r"\s*\n\s*", " ", piece).strip()
        piece = re.sub(r"\s{2,}", " ", piece)
        if len(piece) < 40:
            continue
        normalized.append(piece)
    return normalized


def chunk_pages(pages: list[PageRecord], markers: list[ChapterMarker], pdf_path: Path, dataset_slug: str) -> list[dict]:
    chunks: list[dict] = []
    buffer: list[str] = []
    buffer_pages: list[int] = []
    chunk_id = 1

    def flush() -> None:
        nonlocal buffer, buffer_pages, chunk_id
        if not buffer:
            return

        text = "\n\n".join(buffer).strip()
        if not text:
            buffer = []
            buffer_pages = []
            return

        page_start = min(buffer_pages)
        page_end = max(buffer_pages)
        chapter = chapter_for_page(page_start, markers)
        section_type, section_heading = detect_section_type(text)

        chunks.append(
            {
                "id": f"acf4-chunk-{chunk_id:05d}",
                "source_file": str(pdf_path),
                "dataset_slug": dataset_slug,
                "page_start": page_start,
                "page_end": page_end,
                "chapter_number": chapter.number if chapter else None,
                "chapter_title": chapter.title if chapter else None,
                "section_type": section_type,
                "section_heading": section_heading,
                "text": text,
                "char_count": len(text),
                "word_count": len(text.split()),
            }
        )

        chunk_id += 1
        buffer = []
        buffer_pages = []

    for page in pages:
        paragraphs = paragraphs_from_page(page.text)
        for paragraph in paragraphs:
            projected = len("\n\n".join(buffer + [paragraph]))
            if buffer and projected > MAX_CHUNK_CHARS:
                flush()

            buffer.append(paragraph)
            buffer_pages.append(page.page)

            if len("\n\n".join(buffer)) >= MIN_CHUNK_CHARS and paragraph.endswith((".", "?", "!", ":")):
                flush()

    flush()
    return chunks


def extract_special_items(
    pages: list[PageRecord], markers: list[ChapterMarker], pdf_path: Path, dataset_slug: str
) -> list[dict]:
    items: list[dict] = []
    item_id = 1

    for page in pages:
        chapter = chapter_for_page(page.page, markers)
        for raw_piece in re.split(r"\n\s*\n", page.text):
            piece = re.sub(r"\s*\n\s*", " ", raw_piece).strip()
            if len(piece) < 50:
                continue

            section_type, section_heading = detect_section_type(piece)
            if section_type == "chapter_text":
                continue

            items.append(
                {
                    "id": f"acf4-item-{item_id:04d}",
                    "source_file": str(pdf_path),
                    "dataset_slug": dataset_slug,
                    "page": page.page,
                    "chapter_number": chapter.number if chapter else None,
                    "chapter_title": chapter.title if chapter else None,
                    "section_type": section_type,
                    "section_heading": section_heading,
                    "text": piece,
                    "word_count": len(piece.split()),
                }
            )
            item_id += 1

    return items


def write_jsonl(path: Path, rows: Iterable[dict]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def build_manifest(
    pages: list[PageRecord],
    markers: list[ChapterMarker],
    chunks: list[dict],
    special_items: list[dict],
    pdf_path: Path,
    output_dir: Path,
    dataset_slug: str,
) -> dict:
    section_counts: dict[str, int] = {}
    for row in chunks:
        section_counts[row["section_type"]] = section_counts.get(row["section_type"], 0) + 1

    return {
        "source_file": str(pdf_path),
        "dataset_slug": dataset_slug,
        "page_count": len(pages),
        "chapter_count": len(markers),
        "chunk_count": len(chunks),
        "special_item_count": len(special_items),
        "section_type_counts": section_counts,
        "chapters": [
            {"chapter_number": marker.number, "chapter_title": marker.title, "start_page": marker.start_page}
            for marker in markers
        ],
        "outputs": {
            "chunks_jsonl": str(output_dir / "chunks.jsonl"),
            "special_items_jsonl": str(output_dir / "special_items.jsonl"),
            "manifest_json": str(output_dir / "manifest.json"),
        },
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract trainable text chunks from a PDF.")
    parser.add_argument("--pdf", default=str(DEFAULT_PDF_PATH), help="Absolute path to the PDF file.")
    parser.add_argument("--output-dir", default=None, help="Directory for extracted JSONL files.")
    parser.add_argument("--slug", default=None, help="Optional dataset slug used in metadata.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    pdf_path, output_dir, dataset_slug = build_paths(args)
    output_dir.mkdir(parents=True, exist_ok=True)

    pages = read_pdf_pages(pdf_path)
    markers = find_chapter_markers(pages)
    if not markers:
        markers = find_top_level_section_markers(pages)
    chunks = chunk_pages(pages, markers, pdf_path, dataset_slug)
    special_items = extract_special_items(pages, markers, pdf_path, dataset_slug)
    manifest = build_manifest(pages, markers, chunks, special_items, pdf_path, output_dir, dataset_slug)

    write_jsonl(output_dir / "chunks.jsonl", chunks)
    write_jsonl(output_dir / "special_items.jsonl", special_items)
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
