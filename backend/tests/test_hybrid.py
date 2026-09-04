import copy
import json
from pathlib import Path
from statistics import mean, pstdev

import pytest
from test_insights import VALID_INSIGHTS

from app.ambiguity import ambiguity_reasons
from app.config import ambiguity_threshold
from app.insights import context_candidate_ids, validate_insights
from app.kpis import aggregate
from app.sentiment import classify_sentences, parse_transcript
from app.workflow import analyze_conversation


def test_manual_evaluation_dataset_is_complete_and_parseable():
    cases = json.loads(
        (Path(__file__).resolve().parents[2] / "samples/evaluation.json").read_text()
    )
    assert 15 <= len(cases) <= 25
    assert len({case["id"] for case in cases}) == len(cases)
    assert {
        "sarcasm",
        "negation",
        "escalation",
        "resolution",
        "sentiment improvement",
        "sentiment deterioration",
    }.issubset({case["category"] for case in cases})
    for case in cases:
        assert parse_transcript(case["text"])
        assert set(case["acceptable_sentiments"]).issubset({"Positive", "Negative", "Neutral"})
        assert case["review_note"]


@pytest.mark.parametrize(
    "text",
    [
        "Great, I've been waiting for three hours.",
        "Yeah, exactly what I needed after being charged twice.",
        "The agent was helpful, but I am still unhappy.",
        "I guess that works.",
        "The service wasn't terrible.",
        "I have already called three times.",
        "If this isn't fixed today I want to speak with a manager.",
    ],
)
def test_contextual_examples_are_flagged(text):
    result = analyze_conversation(text)
    assert result["sentences"][0]["ambiguous"]
    assert result["sentences"][0]["analyzer"] == "vader"


@pytest.mark.parametrize(
    "text,label",
    [
        ("I absolutely loved the service.", "Positive"),
        ("This was a terrible experience.", "Negative"),
        ("The meeting is at 3 PM.", "Neutral"),
        ("The service wasn't bad.", "Positive"),
        ("Thank you, the refund has arrived and everything is fine now.", "Positive"),
    ],
)
def test_requested_local_sentiment_examples(text, label):
    result = analyze_conversation(text)
    assert result["overall_sentiment"] == label
    assert -1 <= result["compound_score"] <= 1


def test_weak_polarity_threshold_is_configurable(monkeypatch):
    monkeypatch.setenv("AMBIGUITY_THRESHOLD", "0.1")
    assert not ambiguity_reasons("A factual statement.", 0.15, 0, 0)
    monkeypatch.setenv("AMBIGUITY_THRESHOLD", "0.2")
    assert ambiguity_reasons("A factual statement.", 0.15, 0, 0) == ["weak_polarity"]
    assert not ambiguity_reasons("A factual statement.", 0.2, 0, 0)


@pytest.mark.parametrize("value", ["bad", "nan", "-0.1", "1.1"])
def test_invalid_threshold_fails_explicitly(monkeypatch, value):
    monkeypatch.setenv("AMBIGUITY_THRESHOLD", value)
    with pytest.raises(RuntimeError):
        ambiguity_threshold()


def test_volatility_and_trend_use_original_scores():
    result = analyze_conversation("Terrible service.\nThe meeting is at 3 PM.\nExcellent service!")
    scores = [s["compound_score"] for s in result["sentences"]]
    assert result["compound_score"] == round(mean(scores), 4)
    assert result["kpis"]["sentiment_volatility"] == round(pstdev(scores), 4)
    assert [s["sentiment"] for s in result["kpis"]["trend"]] == [
        "Negative",
        "Neutral",
        "Positive",
    ]
    assert sum(result["kpis"]["counts"].values()) == 3


@pytest.mark.parametrize("count", [3, 4, 5, 8])
def test_trend_segments_cover_every_sentence_once(count):
    result = analyze_conversation("Good service.\n" * count)
    ids = [i for segment in result["kpis"]["trend"] for i in segment["sentence_ids"]]
    assert ids == list(range(1, count + 1))
    assert all(segment["sentence_ids"] for segment in result["kpis"]["trend"])


def test_single_sentence_has_zero_volatility_and_no_trend():
    result = analyze_conversation("Hi")
    assert result["kpis"]["trend"] == []
    assert result["kpis"]["sentiment_volatility"] == 0
    assert result["notices"]


def test_standalone_labels_and_customer_sentiment():
    result = analyze_conversation("Customer:\nTerrible service.\nAgent:\nHappy to help.")
    assert [s["speaker"] for s in result["sentences"]] == ["Customer", "Agent"]
    assert result["kpis"]["customer_sentiment"] == "Negative"
    assert result["kpis"]["customer_sentence_count"] == 1


def test_context_review_changes_labels_not_vader_scores(monkeypatch):
    text = "Customer: Great, I've been waiting for three hours.\nAgent: I am happy to help."
    local = analyze_conversation(text)
    ids = context_candidate_ids(local["sentences"])
    assert ids == [1]
    payload = copy.deepcopy(VALID_INSIGHTS)
    payload["contextual_reviews"] = [
        {
            "sentence_id": 1,
            "sentiment": "Negative",
            "explanation": "Praise contrasts with a complaint about a three-hour wait.",
            "sentence_ids": [1],
        }
    ]
    calls = []

    def provider(sentences):
        calls.append(sentences)
        return payload

    monkeypatch.setattr("app.workflow.generate_insights", provider)
    result = analyze_conversation(text, True)
    assert len(calls) == 1
    assert result["sentences"][0]["sentiment"] == "Negative"
    assert result["sentences"][0]["analyzer"] == "nemotron-contextual"
    assert result["sentences"][1]["analyzer"] == "vader"
    assert result["compound_score"] == local["compound_score"]
    assert result["vader_baseline"] == local["vader_baseline"]
    assert result["kpis"]["context_corrected_count"] == 1
    assert result["kpis"]["sentiment_volatility"] == local["kpis"]["sentiment_volatility"]


def test_single_sarcasm_correction_changes_overall(monkeypatch):
    payload = copy.deepcopy(VALID_INSIGHTS)
    payload["contextual_reviews"] = [
        {
            "sentence_id": 1,
            "sentiment": "Negative",
            "explanation": "The waiting complaint makes the praise sarcastic.",
            "sentence_ids": [1],
        }
    ]
    monkeypatch.setattr("app.workflow.generate_insights", lambda sentences: payload)
    result = analyze_conversation("Customer: Great, I've been waiting for three hours.", True)
    assert result["overall_sentiment"] == "Negative"
    assert result["vader_baseline"]["overall_sentiment"] == "Positive"
    assert result["kpis"]["counts"]["negative"] == 1
    assert result["analyzer"] == "hybrid"


def test_aggregation_tie_is_explainable():
    sentences = classify_sentences(parse_transcript("Great!\nTerrible!"))
    sentences[0]["sentiment"] = "Neutral"
    # Positive baseline is absent from the tied Neutral/Negative winners.
    assert aggregate(sentences)["vader_baseline"]["overall_sentiment"] == "Positive"
    assert aggregate(sentences)["overall_sentiment"] == "Neutral"
    sentences[1]["compound_score"] = -0.95
    # A negative baseline remains a tied winner and breaks the tie.
    assert aggregate(sentences)["overall_sentiment"] == "Negative"


def test_batched_review_is_capped_and_prefers_complaints():
    result = analyze_conversation(
        "The meeting is at 3 PM.\n" * 25 + "Customer: I have already called three times."
    )
    selected = context_candidate_ids(result["sentences"])
    assert len(selected) == 20
    assert 26 in selected


@pytest.mark.parametrize(
    "defect",
    [
        "unflagged",
        "missing-review",
        "duplicate-review",
        "wrong-role",
        "hallucinated-agent",
        "inconsistent-outcome",
    ],
)
def test_model_constraints_reject_invalid_context_and_roles(defect):
    sentences = classify_sentences(
        parse_transcript("Customer: I guess that works.\nAgent: Excellent service!")
    )
    payload = copy.deepcopy(VALID_INSIGHTS)
    review = {
        "sentence_id": 1,
        "sentiment": "Neutral",
        "explanation": "Tentative acceptance.",
        "sentence_ids": [1],
    }
    payload["contextual_reviews"] = [review]
    if defect == "unflagged":
        payload["contextual_reviews"] = [{**review, "sentence_id": 2, "sentence_ids": [2]}]
    if defect == "missing-review":
        payload["contextual_reviews"] = []
    if defect == "duplicate-review":
        payload["contextual_reviews"] *= 2
    if defect == "wrong-role":
        payload["customer_emotion"]["sentence_ids"] = [2]
    if defect == "hallucinated-agent":
        payload["agent_emotion"]["emotion"] = "Calm"
    if defect == "inconsistent-outcome":
        payload["resolution_status"]["status"] = "Unclear"
    with pytest.raises(ValueError):
        validate_insights(json.dumps(payload), sentences)


def test_unexpected_provider_error_preserves_exact_local_baseline(monkeypatch):
    text = "I guess that works."
    local = analyze_conversation(text)

    def fail(sentences):
        raise RuntimeError("private provider data")

    monkeypatch.setattr("app.workflow.generate_insights", fail)
    result = analyze_conversation(text, True)
    assert result["sentences"] == local["sentences"]
    assert result["kpis"] == local["kpis"]
    assert "temporarily unavailable" in result["insights_notice"]
    assert "private" not in result["insights_notice"]
