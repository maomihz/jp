"""End-to-end integration tests for compiling, verifying, and serving study guide outputs."""

from __future__ import annotations

import json
import tempfile
import threading
import unittest
import urllib.request
from pathlib import Path

from renshuu_n3.cli import build_targets, create_static_server
from renshuu_n3.curriculum_loader import load_curriculum
from renshuu_n3.verifier import verify_build

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
CURRICULUM_DIR = REPO_ROOT / "curriculum"
WEB_SRC_DIR = REPO_ROOT / "web"


class BuildPipelineIntegrationTests(unittest.TestCase):
    def test_compile_and_verify_all_formats(self) -> None:
        curriculum = load_curriculum(CURRICULUM_DIR)
        self.assertEqual(len(curriculum.lessons), 58)
        self.assertEqual(curriculum.total_grammar_points, 220)
        self.assertEqual(curriculum.total_questions, 232)
        self.assertEqual(len(curriculum.matrices), 12)

        with tempfile.TemporaryDirectory() as tmp_name:
            dist_dir = Path(tmp_name)
            build_targets(curriculum, WEB_SRC_DIR, dist_dir, target="all")
            errors = verify_build(curriculum, dist_dir, run_epubcheck=False)
            self.assertEqual(errors, [])

    def test_static_server_serves_modules_and_unit_json(self) -> None:
        curriculum = load_curriculum(CURRICULUM_DIR)
        with tempfile.TemporaryDirectory() as tmp_name:
            dist_dir = Path(tmp_name)
            build_targets(curriculum, WEB_SRC_DIR, dist_dir, target="site")
            server = create_static_server(dist_dir / "site", host="127.0.0.1", port=0)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                port = server.server_port
                base = f"http://127.0.0.1:{port}"
                with urllib.request.urlopen(f"{base}/index.html", timeout=3) as resp:
                    self.assertEqual(resp.status, 200)
                    html_body = resp.read().decode("utf-8")
                    self.assertIn("./js/app.js", html_body)

                with urllib.request.urlopen(f"{base}/js/app.js", timeout=3) as resp:
                    self.assertEqual(resp.status, 200)
                    self.assertTrue(
                        resp.headers.get("Content-Type", "").startswith("text/javascript")
                    )

                with urllib.request.urlopen(f"{base}/favicon.svg", timeout=3) as resp:
                    self.assertEqual(resp.status, 200)

                with urllib.request.urlopen(f"{base}/data/manifest.json", timeout=3) as resp:
                    self.assertEqual(resp.status, 200)
                    manifest = json.loads(resp.read().decode("utf-8"))
                    self.assertEqual(manifest["total_renshuu_lessons"], 55)
                    self.assertEqual(manifest["total_grammar_points"], 220)
                    m06 = next(m for m in manifest["matrices"] if m["matrix_id"] == "M06")
                    self.assertIn("L17", m06["related_lessons"])
                    unit4_meta = next(u for u in manifest["units"] if u["unit_number"] == 4)
                    l17_meta = next(ls for ls in unit4_meta["lessons"] if ls["lesson_id"] == "L17")
                    self.assertIn("M06", l17_meta["related_matrices"])

                with urllib.request.urlopen(f"{base}/data/units/unit_01.json", timeout=3) as resp:
                    self.assertEqual(resp.status, 200)
                    unit1 = json.loads(resp.read().decode("utf-8"))
                    self.assertEqual(unit1["unit_number"], 1)
                    self.assertEqual(len(unit1["lessons"]), 5)
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
