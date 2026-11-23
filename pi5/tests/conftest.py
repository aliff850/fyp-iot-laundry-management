from pathlib import Path
import sys

PI5_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = PI5_DIR.parent

for path in (REPO_ROOT, PI5_DIR):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))
