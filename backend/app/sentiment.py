"""English transcript parsing and local, rule-based sentiment analysis."""

import re

import pysbd
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

from .ambiguity import ambiguity_reasons
from .config import MAX_SENTENCE_CHARS, MAX_SENTENCES

LABELS = ("Positive", "Negative", "Neutral")
ANALYZER = SentimentIntensityAnalyzer()
# In call transcripts, "number" refers to an identifier, not an expression of feeling.
# VADER assigns it +0.3 by default, which otherwise makes tracking-number facts positive.
ANALYZER.lexicon.pop("number", None)
SPEAKER = re.compile(
    r"^(Customer|Caller|Client|Agent|Advisor|Representative|Support)\s*:\s*",
    re.IGNORECASE,
)
TIMESTAMP = re.compile(r"^\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s+")


def label_for(score: float) -> str:
    if score >= 0.05:
        return "Positive"
    if score <= -0.05:
        return "Negative"
    return "Neutral"


def parse_transcript(text: str) -> list[dict]:
    # Each non-empty line is a turn. Segment within turns, preserving speaker labels.
    segmenter = pysbd.Segmenter(language="en", clean=False)
    sentences = []
    block_speaker = None
    for line in text.splitlines():
        line = TIMESTAMP.sub("", line.strip())
        match = SPEAKER.match(line)
        speaker = match.group(1).title() if match else block_speaker
        content = line[match.end() :] if match else line
        if match:
            block_speaker = speaker if not content.strip() else None
        if not content.strip():
            continue
        # Check before segmentation to avoid expensive work on a huge unbroken line.
        if len(content) > MAX_SENTENCES * MAX_SENTENCE_CHARS:
            raise ValueError("The transcript is too long.")
        for sentence in segmenter.segment(content):
            sentence = sentence.strip()
            if not any(character.isalpha() for character in sentence):
                continue
            if len(sentence) > MAX_SENTENCE_CHARS:
                raise ValueError(
                    f"Each sentence must be at most {MAX_SENTENCE_CHARS:,} characters."
                )
            sentences.append({"id": len(sentences) + 1, "speaker": speaker, "text": sentence})
            if len(sentences) > MAX_SENTENCES:
                raise ValueError(f"Please upload at most {MAX_SENTENCES} sentences.")
    if not sentences:
        raise ValueError(
            "The file must contain conversation text, not only numbers or punctuation."
        )
    return sentences


def classify_sentences(sentences: list[dict]) -> list[dict]:
    result = []
    for sentence in sentences:
        # Normalize curly apostrophes so VADER recognizes contractions such as isn't.
        scores = ANALYZER.polarity_scores(sentence["text"].replace("’", "'"))
        score = scores["compound"]
        reasons = ambiguity_reasons(sentence["text"], score, scores["pos"], scores["neg"])
        result.append(
            {
                **sentence,
                "sentiment": label_for(score),
                "vader_sentiment": label_for(score),
                "compound_score": score,
                "analyzer": "vader",
                "ambiguous": bool(reasons),
                "ambiguity_reasons": reasons,
                "contextual_reasoning": None,
                "context_sentence_ids": [],
            }
        )
    return result
