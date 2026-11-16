"""Deterministic post-build verification across web site, EPUB 3.3 archive, and Markdown guides."""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import urllib.parse
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

from renshuu_n3.models import UNIT_MARKDOWN_FILENAMES, Curriculum
from renshuu_n3.web_builder import WEB_STATIC_FILES

RAW_RUBY_PATTERN = re.compile(r"\{[^{}|]+\|[^{}|]+\}")
MD_LINK_PATTERN = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
HTML_ANCHOR_PATTERN = re.compile(r'<a\s+id="([^"]+)"')
FORBIDDEN_OUTPUT_ROMAJI_RE = re.compile(r"\bromanj?i\b|gp-romaji", re.IGNORECASE)


def _collect_xml_ids(xml_bytes: bytes) -> set[str]:
    root = ET.fromstring(xml_bytes)
    return {elem.attrib["id"] for elem in root.iter() if "id" in elem.attrib}


def _normalize_archive_path(base_file: str, target_part: str) -> str:
    raw_target = f"{Path(base_file).parent}/{target_part}" if target_part else base_file
    normalized: list[str] = []
    for segment in raw_target.split("/"):
        if segment in ("", "."):
            continue
        if segment == "..":
            if normalized:
                normalized.pop()
        else:
            normalized.append(segment)
    return "/".join(normalized)


def verify_site(curriculum: Curriculum, site_dir: Path) -> list[str]:
    """Verify modular web assets, ES module syntax, and split JSON datasets."""
    errors: list[str] = []
    if not site_dir.is_dir():
        return [f"Missing compiled site directory: {site_dir}"]

    for rel_path in WEB_STATIC_FILES:
        asset_path = site_dir / rel_path
        if not asset_path.is_file():
            errors.append(f"Missing site asset: {rel_path}")
            continue
        asset_text = asset_path.read_text(encoding="utf-8")
        if FORBIDDEN_OUTPUT_ROMAJI_RE.search(asset_text):
            errors.append(f"Forbidden romaji reference in site asset: {rel_path}")

    index_path = site_dir / "index.html"
    if index_path.is_file():
        index_html = index_path.read_text(encoding="utf-8")
        if RAW_RUBY_PATTERN.search(index_html):
            errors.append("dist/site/index.html contains unrendered {Base|Reading} tokens")

    if shutil.which("node"):
        for rel_path in WEB_STATIC_FILES:
            if not rel_path.endswith(".js"):
                continue
            js_path = site_dir / rel_path
            if not js_path.is_file():
                continue
            proc = subprocess.run(
                ["node", "--check", str(js_path)],
                capture_output=True,
                text=True,
                check=False,
            )
            if proc.returncode != 0:
                errors.append(f"JS syntax check failed for {rel_path}: {proc.stderr.strip()}")

    data_dir = site_dir / "data"
    manifest_path = data_dir / "manifest.json"
    if not manifest_path.is_file():
        errors.append("Missing dist/site/data/manifest.json")
        return errors

    try:
        manifest_raw = manifest_path.read_text(encoding="utf-8")
        if FORBIDDEN_OUTPUT_ROMAJI_RE.search(manifest_raw):
            errors.append("Forbidden romaji reference in dist/site/data/manifest.json")
        manifest = json.loads(manifest_raw)
    except json.JSONDecodeError as exc:
        errors.append(f"Invalid manifest.json: {exc}")
        return errors

    expected_lessons = {lesson.lesson_id for lesson in curriculum.lessons}
    expected_matrices = {matrix.matrix_id for matrix in curriculum.matrices}
    manifest_lessons = {
        str(ls["lesson_id"]) for u in manifest.get("units", []) for ls in u.get("lessons", [])
    }
    manifest_matrices = {str(m["matrix_id"]) for m in manifest.get("matrices", [])}

    if manifest_lessons != expected_lessons:
        errors.append(f"manifest.json lesson IDs mismatch: {expected_lessons ^ manifest_lessons}")
    if manifest_matrices != expected_matrices:
        errors.append(f"manifest.json matrix IDs mismatch: {expected_matrices ^ manifest_matrices}")
    if manifest.get("total_grammar_points") != curriculum.total_grammar_points:
        errors.append("manifest.json total_grammar_points count mismatch")
    if manifest.get("total_questions") != curriculum.total_questions:
        errors.append("manifest.json total_questions count mismatch")

    matrices_path = data_dir / "matrices.json"
    if not matrices_path.is_file():
        errors.append("Missing dist/site/data/matrices.json")
    else:
        matrices_raw = matrices_path.read_text(encoding="utf-8")
        if FORBIDDEN_OUTPUT_ROMAJI_RE.search(matrices_raw):
            errors.append("Forbidden romaji reference in dist/site/data/matrices.json")
        matrices_data = json.loads(matrices_raw)
        found_m = {str(m["matrix_id"]) for m in matrices_data.get("matrices", [])}
        if found_m != expected_matrices:
            errors.append("matrices.json IDs do not match curriculum")

    for unit in curriculum.units:
        unit_file = data_dir / "units" / f"unit_{unit.unit_number:02d}.json"
        if not unit_file.is_file():
            errors.append(f"Missing unit dataset: units/unit_{unit.unit_number:02d}.json")
            continue
        unit_raw = unit_file.read_text(encoding="utf-8")
        if FORBIDDEN_OUTPUT_ROMAJI_RE.search(unit_raw):
            errors.append(f"Forbidden romaji reference in {unit_file.name}")
        unit_json = json.loads(unit_raw)
        expected_unit_lessons = {ls.lesson_id for ls in unit.lessons}
        found_unit_lessons = {str(ls["lesson_id"]) for ls in unit_json.get("lessons", [])}
        if found_unit_lessons != expected_unit_lessons:
            errors.append(f"Unit {unit.unit_number} JSON lesson IDs mismatch")

    return errors


def verify_epub(
    curriculum: Curriculum, epub_path: Path, *, run_epubcheck: bool = True
) -> list[str]:
    """Verify EPUB OCF compliance, XML parsing, link integrity, ID coverage, and epubcheck."""
    errors: list[str] = []
    if not epub_path.is_file():
        return [f"Missing EPUB archive: {epub_path}"]

    with zipfile.ZipFile(epub_path, "r") as zf:
        infos = zf.infolist()
        if not infos:
            return ["EPUB archive is empty"]
        first = infos[0]
        if first.filename != "mimetype":
            errors.append(f"EPUB entry 0 is {first.filename!r}, expected 'mimetype'")
        if first.compress_type != zipfile.ZIP_STORED:
            errors.append("EPUB mimetype entry must use ZIP_STORED")
        if zf.read("mimetype") != b"application/epub+zip":
            errors.append("EPUB mimetype payload mismatch")

        names = set(zf.namelist())
        ids_by_file: dict[str, set[str]] = {}
        for name in names:
            if name.endswith((".xml", ".opf", ".ncx", ".xhtml")):
                try:
                    ids_by_file[name] = _collect_xml_ids(zf.read(name))
                except ET.ParseError as exc:
                    errors.append(f"EPUB XML parse error in {name}: {exc}")

        if "META-INF/container.xml" not in names:
            errors.append("EPUB missing META-INF/container.xml")
            return errors

        container_root = ET.fromstring(zf.read("META-INF/container.xml"))
        rootfiles = container_root.findall(
            ".//{urn:oasis:names:tc:opendocument:xmlns:container}rootfile"
        )
        if not rootfiles:
            errors.append("container.xml missing rootfile")
            return errors

        opf_path = rootfiles[0].attrib.get("full-path", "")
        if opf_path not in names:
            errors.append(f"OPF path missing in archive: {opf_path}")
            return errors

        opf_dir = str(Path(opf_path).parent)
        opf_root = ET.fromstring(zf.read(opf_path))
        opf_ns = "{http://www.idpf.org/2007/opf}"
        manifest_targets: dict[str, str] = {}
        for item in opf_root.findall(f".//{opf_ns}manifest/{opf_ns}item"):
            iid = item.attrib.get("id", "")
            href = item.attrib.get("href", "")
            full_target = f"{opf_dir}/{href}" if opf_dir != "." else href
            if full_target not in names:
                errors.append(f"Manifest item {iid!r} missing target {full_target}")
            manifest_targets[iid] = full_target

        for itemref in opf_root.findall(f".//{opf_ns}spine/{opf_ns}itemref"):
            idref = itemref.attrib.get("idref", "")
            if idref not in manifest_targets:
                errors.append(f"Spine idref {idref!r} missing from manifest")

        def resolve_ref(base_file: str, ref: str) -> None:
            if not ref or ref.startswith(("http://", "https://", "mailto:")):
                return
            path_part, _, frag = ref.partition("#")
            resolved = _normalize_archive_path(base_file, path_part)
            if resolved not in names:
                errors.append(f"Broken href {ref!r} in {base_file} -> {resolved}")
                return
            if frag and frag not in ids_by_file.get(resolved, set()):
                errors.append(
                    f"Broken fragment {ref!r} in {base_file} -> #{frag} not found in {resolved}"
                )

        xhtml_files = [n for n in names if n.endswith(".xhtml")]
        for name in names:
            if name.endswith((".xhtml", ".opf", ".ncx")):
                raw_entry_text = zf.read(name).decode("utf-8")
                if FORBIDDEN_OUTPUT_ROMAJI_RE.search(raw_entry_text):
                    errors.append(f"Forbidden romaji reference in EPUB {name}")
        for xfile in xhtml_files:
            raw_text = zf.read(xfile).decode("utf-8")
            if RAW_RUBY_PATTERN.search(raw_text):
                errors.append(f"Unrendered {{Base|Reading}} token found in EPUB {xfile}")
            xroot = ET.fromstring(raw_text.encode("utf-8"))
            for elem in xroot.iter():
                href = elem.attrib.get("href")
                if href:
                    resolve_ref(xfile, href)

        if "EPUB/toc.ncx" in names:
            ncx_root = ET.fromstring(zf.read("EPUB/toc.ncx"))
            for elem in ncx_root.iter():
                if elem.tag.endswith("content"):
                    resolve_ref("EPUB/toc.ncx", elem.attrib.get("src", ""))

        all_epub_ids = {eid for xfile in xhtml_files for eid in ids_by_file.get(xfile, set())}
        expected_lessons = {lesson.lesson_id for lesson in curriculum.lessons}
        expected_matrices = {matrix.matrix_id for matrix in curriculum.matrices}
        expected_points = {
            f"gp-{gp.id}" for lesson in curriculum.lessons for gp in lesson.grammar_points
        }

        if expected_lessons - all_epub_ids:
            errors.append(f"EPUB missing lesson IDs: {sorted(expected_lessons - all_epub_ids)}")
        if expected_matrices - all_epub_ids:
            errors.append(f"EPUB missing matrix IDs: {sorted(expected_matrices - all_epub_ids)}")
        if expected_points - all_epub_ids:
            errors.append(
                f"EPUB missing grammar point IDs: {sorted(expected_points - all_epub_ids)[:10]}"
            )

    if run_epubcheck and shutil.which("epubcheck"):
        proc = subprocess.run(
            ["epubcheck", str(epub_path)],
            capture_output=True,
            text=True,
            check=False,
        )
        if proc.returncode != 0:
            errors.append(
                f"epubcheck failed (exit {proc.returncode}): {proc.stdout}\n{proc.stderr}"
            )

    return errors


def verify_markdown(curriculum: Curriculum, guide_dir: Path) -> list[str]:
    """Verify compiled Markdown guides for zero unrendered ruby and intact cross-links."""
    errors: list[str] = []
    if not guide_dir.is_dir():
        return [f"Missing compiled Markdown guide directory: {guide_dir}"]

    expected_files = (
        ["00-master-index.md"]
        + [UNIT_MARKDOWN_FILENAMES[u.unit_number] for u in curriculum.units]
        + ["13-synonym-matrices.md"]
    )
    anchors_by_file: dict[Path, set[str]] = {}
    md_paths: list[Path] = []

    for filename in expected_files:
        path = guide_dir / filename
        if not path.is_file():
            errors.append(f"Missing Markdown file: {filename}")
            continue
        md_paths.append(path)
        text = path.read_text(encoding="utf-8")
        if RAW_RUBY_PATTERN.search(text):
            errors.append(f"Unrendered {{Base|Reading}} token in {filename}")
        if FORBIDDEN_OUTPUT_ROMAJI_RE.search(text):
            errors.append(f"Forbidden romaji reference in {filename}")
        anchors_by_file[path.resolve()] = set(HTML_ANCHOR_PATTERN.findall(text))

    for path in md_paths:
        text = path.read_text(encoding="utf-8")
        for match in MD_LINK_PATTERN.finditer(text):
            target = urllib.parse.unquote(match.group(1).strip())
            if target.startswith(("http://", "https://", "mailto:", "#")):
                continue
            path_part, _, frag = target.partition("#")
            resolved = (path.parent / path_part).resolve()
            if not resolved.is_file():
                errors.append(f"Broken Markdown link in {path.name}: {target}")
                continue
            if frag and resolved in anchors_by_file and frag not in anchors_by_file[resolved]:
                errors.append(f"Broken Markdown anchor in {path.name}: {target}")

    return errors


def verify_build(
    curriculum: Curriculum,
    dist_dir: Path,
    *,
    run_epubcheck: bool = True,
) -> list[str]:
    """Verify all three compiled study guide editions under dist_dir."""
    errors: list[str] = []
    errors.extend(verify_site(curriculum, dist_dir / "site"))
    errors.extend(
        verify_epub(
            curriculum,
            dist_dir / "renshuu-n3-companion.epub",
            run_epubcheck=run_epubcheck,
        )
    )
    errors.extend(verify_markdown(curriculum, dist_dir / "guide"))
    return errors
