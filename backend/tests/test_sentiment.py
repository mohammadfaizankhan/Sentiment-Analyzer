import pytest

from app.sentiment import classify_sentences, parse_transcript
from app.workflow import analyze_conversation


@pytest.mark.parametrize(
    "text,expected",
    [
        ("I love this excellent service!", "Positive"),
        ("This is awful and I am very disappointed.", "Negative"),
        ("The parcel is on the table.", "Neutral"),
        ("The service is not good.", "Negative"),
        ("The service isn't bad.", "Positive"),
        ("The service isn’t good.", "Negative"),
        ("The wait was long, but the help was excellent.", "Positive"),
    ],
    ids=[
        "positive",
        "negative",
        "neutral",
        "negation",
        "negated-negative",
        "curly-apostrophe",
        "contrast",
    ],
)
def test_sentiment_examples(text, expected):
    assert analyze_conversation(text)["overall_sentiment"] == expected


def test_abbreviations_decimals_speaker_labels_and_timestamps():
    result = parse_transcript(
        "[00:12] Customer: Dr. Smith charged $12.50. That is fine.\nAgent: It is recorded."
    )
    assert len(result) == 3
    assert result[0]["text"] == "Dr. Smith charged $12.50."
    assert [row["speaker"] for row in result] == ["Customer", "Customer", "Agent"]


def test_unlabeled_lines_do_not_inherit_customer():
    result = parse_transcript("Customer: Bad service.\nThe order is on the table.")
    assert result[1]["speaker"] is None


def test_aggregation_counts_denominators_and_no_customer_inference():
    result = analyze_conversation("Great!\nTerrible!\nThe order is on the table.")
    assert [row["count"] for row in result["breakdown"]] == [1, 1, 1]
    assert result["kpis"]["negative_sentence_percentage"] == 33.3
    assert result["kpis"]["customer_negative_percentage"] is None
    assert sum(row["percentage"] for row in result["breakdown"]) == pytest.approx(100, abs=0.2)


def test_repeated_graph_invocations_do_not_share_transcript_state():
    first = analyze_conversation("I love this! I am happy!")
    second = analyze_conversation("The parcel is on the table.")
    assert first["kpis"]["sentence_count"] == 2
    assert second["kpis"]["sentence_count"] == 1
    assert second["overall_sentiment"] == "Neutral"


def test_labels_are_removed_before_sentiment_scoring():
    sentences = classify_sentences(parse_transcript("Support: The parcel is on the table."))
    assert sentences[0]["sentiment"] == "Neutral"


def test_factual_phone_call_identifiers_are_neutral():
    result = analyze_conversation("Agent: The tracking number is 12345.")
    assert result["overall_sentiment"] == "Neutral"
    assert result["sentences"][0]["sentiment"] == "Neutral"
