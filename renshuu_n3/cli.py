"""Command-line interface for validating, compiling, verifying, and serving the study guide."""

from __future__ import annotations

import argparse
import functools
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import ClassVar

from renshuu_n3.curriculum_loader import load_curriculum, validate_curriculum_file
from renshuu_n3.epub_builder import build_epub
from renshuu_n3.markdown_builder import build_markdown_guides
from renshuu_n3.models import Curriculum
from renshuu_n3.verifier import verify_build
from renshuu_n3.web_builder import build_web_site

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CURRICULUM_DIR = REPO_ROOT / "curriculum"
DEFAULT_WEB_SRC_DIR = REPO_ROOT / "web"
DEFAULT_DIST_DIR = REPO_ROOT / "dist"


class _StaticSiteHandler(SimpleHTTPRequestHandler):
    """HTTP handler enforcing explicit UTF-8 MIME types for ES modules and JSON datasets."""

    extensions_map: ClassVar[dict[str, str]] = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
    }

    def log_message(self, format: str, *args: object) -> None:
        return


def create_static_server(
    site_dir: Path, host: str = "127.0.0.1", port: int = 8000
) -> ThreadingHTTPServer:
    """Create a threaded static HTTP server rooted at site_dir."""
    handler = functools.partial(_StaticSiteHandler, directory=str(site_dir))
    return ThreadingHTTPServer((host, port), handler)


def build_targets(
    curriculum: Curriculum,
    web_src_dir: Path,
    dist_dir: Path,
    target: str = "all",
) -> None:
    """Compile requested study guide format(s) into dist_dir."""
    if target in ("all", "markdown"):
        build_markdown_guides(curriculum, dist_dir / "guide")
    if target in ("all", "epub"):
        build_epub(curriculum, dist_dir / "renshuu-n3-companion.epub")
    if target in ("all", "site"):
        build_web_site(curriculum, web_src_dir, dist_dir / "site")


def _cmd_validate(args: argparse.Namespace) -> int:
    if args.target:
        target_path = Path(args.target)
        if not target_path.is_file():
            print(f"File not found: {target_path}", file=sys.stderr)
            return 2
        errors = validate_curriculum_file(target_path)
        if errors:
            for err in errors[:100]:
                print(f"[{err.location}] {err.message}", file=sys.stderr)
            return 1
        print(f"PASSED: {target_path.name} validated cleanly.")
        return 0

    try:
        curriculum = load_curriculum(Path(args.curriculum_dir))
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    print(
        f"PASSED: {len(curriculum.lessons)} lessons, "
        f"{curriculum.total_grammar_points} grammar points, "
        f"{curriculum.total_questions} quiz items, "
        f"{len(curriculum.matrices)} matrices validated."
    )
    return 0


def _cmd_build(args: argparse.Namespace) -> int:
    try:
        curriculum = load_curriculum(Path(args.curriculum_dir))
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    dist_dir = Path(args.output_dir)
    build_targets(curriculum, Path(args.web_dir), dist_dir, target=args.target)
    print(f"Built {args.target} target(s) in {dist_dir}")
    return 0


def _cmd_verify(args: argparse.Namespace) -> int:
    try:
        curriculum = load_curriculum(Path(args.curriculum_dir))
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    dist_dir = Path(args.output_dir)
    errors = verify_build(curriculum, dist_dir, run_epubcheck=not args.skip_epubcheck)
    if errors:
        print(f"VERIFICATION FAILED ({len(errors)} error(s)):", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    print(
        f"OUTPUT VERIFICATION PASSED: {len(curriculum.lessons)} lessons, "
        f"{curriculum.total_grammar_points} grammar points, "
        f"{len(curriculum.matrices)} matrices verified in {dist_dir}"
    )
    return 0


def _cmd_serve(args: argparse.Namespace) -> int:
    dist_dir = Path(args.output_dir)
    site_dir = dist_dir / "site"
    if (
        not (site_dir / "index.html").is_file()
        or not (site_dir / "data" / "manifest.json").is_file()
    ):
        curriculum = load_curriculum(Path(args.curriculum_dir))
        build_web_site(curriculum, Path(args.web_dir), site_dir)

    server = create_static_server(site_dir, host=args.host, port=args.port)
    actual_host, actual_port = server.server_address[:2]
    print(f"Serving Renshuu N3 Companion at http://{actual_host}:{actual_port}/ (Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="renshuu-n3",
        description="Validate, compile, verify, and serve the Renshuu JLPT N3 study guide.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_val = sub.add_parser("validate", help="Validate curriculum JSON schema and ruby rules.")
    p_val.add_argument("target", nargs="?", help="Optional path to a single JSON file.")
    p_val.add_argument("--curriculum-dir", default=str(DEFAULT_CURRICULUM_DIR))
    p_val.set_defaults(func=_cmd_validate)

    p_build = sub.add_parser("build", help="Compile web site, EPUB 3.3 archive, and Markdown.")
    p_build.add_argument("--curriculum-dir", default=str(DEFAULT_CURRICULUM_DIR))
    p_build.add_argument("--web-dir", default=str(DEFAULT_WEB_SRC_DIR))
    p_build.add_argument("--output-dir", default=str(DEFAULT_DIST_DIR))
    p_build.add_argument("--target", choices=("all", "site", "epub", "markdown"), default="all")
    p_build.set_defaults(func=_cmd_build)

    p_verify = sub.add_parser("verify", help="Verify compiled outputs and run epubcheck.")
    p_verify.add_argument("--curriculum-dir", default=str(DEFAULT_CURRICULUM_DIR))
    p_verify.add_argument("--output-dir", default=str(DEFAULT_DIST_DIR))
    p_verify.add_argument("--skip-epubcheck", action="store_true")
    p_verify.set_defaults(func=_cmd_verify)

    p_serve = sub.add_parser("serve", help="Serve the modular web app over local HTTP.")
    p_serve.add_argument("--curriculum-dir", default=str(DEFAULT_CURRICULUM_DIR))
    p_serve.add_argument("--web-dir", default=str(DEFAULT_WEB_SRC_DIR))
    p_serve.add_argument("--output-dir", default=str(DEFAULT_DIST_DIR))
    p_serve.add_argument("--host", default="127.0.0.1")
    p_serve.add_argument("--port", type=int, default=8000)
    p_serve.set_defaults(func=_cmd_serve)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))
