"""Module entry point supporting `python -m renshuu_n3` and direct execution."""

from __future__ import annotations

import sys
from pathlib import Path

if not __package__:
    repo_root = str(Path(__file__).resolve().parent.parent)
    if repo_root not in sys.path:
        sys.path.insert(0, repo_root)

from renshuu_n3.cli import main

if __name__ == "__main__":
    sys.exit(main())
