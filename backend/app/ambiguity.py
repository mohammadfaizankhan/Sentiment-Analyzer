"""Flag potentially misleading lexicon results without making any network calls."""

import re

from .config import ambiguity_threshold

PATTERNS = {
    "contrast": r"\b(but|however|although|yet|despite)\b",
    "negation": r"\b(not|never|hardly|barely|no longer)\b|\b\w+n't\b",
    "qualified_language": r"\b(i guess|i suppose|sort of|kind of|if you say so)\b",
    "indirect_complaint": r"\b(still (waiting|unresolved|broken|not)|charged (twice|again)|already (called|contacted)|called (\w+ ){0,2}times|waiting for|been waiting|another (delay|charge))\b",
    "possible_sarcasm": r"\b(yeah,? (right|exactly)|just what i needed|exactly what i needed|thanks for nothing)\b",
    "escalation_language": r"\b(manager|supervisor|escalat\w*|formal complaint)\b",
}


def ambiguity_reasons(text: str, score: float, positive: float, negative: float) -> list[str]:
    normalized = text.lower().replace("’", "'")
    reasons = [name for name, pattern in PATTERNS.items() if re.search(pattern, normalized)]
    if positive > 0 and negative > 0:
        reasons.append("mixed_polarity")
    if abs(score) < ambiguity_threshold():
        reasons.append("weak_polarity")
    return reasons
