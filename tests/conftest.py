"""Run the Flask app from app/ with every data store pointed at a temp dir."""
import os
import sys
import tempfile
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[1] / "app"
sys.path.insert(0, str(APP_DIR))

_tmp = Path(tempfile.mkdtemp(prefix="cyberdeck-tests-"))
os.environ["CYBERDECK_DATA"] = str(_tmp)
os.environ.setdefault("CYBERDECK_VAULT", str(_tmp / "vault"))

import datapaths  # noqa: E402

datapaths.persist_data_env(force=True)
