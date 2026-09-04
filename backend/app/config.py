"""Small, backend-only settings shared by the analysis pipeline."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

MAX_FILE_BYTES = 100_000
MAX_SENTENCES = 500
MAX_SENTENCE_CHARS = 2_000
MAX_INSIGHT_CHARS = 12_000
MAX_INSIGHT_SENTENCES = 100
MAX_CONTEXT_SENTENCES = 20
MIN_AI_WORDS = 3
DEFAULT_NVIDIA_MODEL = "nvidia/nemotron-3-super-120b-a12b"


def ambiguity_threshold() -> float:
    """A review heuristic, never a statistical confidence estimate."""
    try:
        value = float(os.getenv("AMBIGUITY_THRESHOLD", "0.20"))
    except ValueError as exc:
        raise RuntimeError("AMBIGUITY_THRESHOLD must be a number between 0 and 1.") from exc
    if not 0 <= value <= 1:
        raise RuntimeError("AMBIGUITY_THRESHOLD must be between 0 and 1.")
    return value
