"""Programmatic calculations; the LLM never supplies counts or numeric polarity."""

from collections import Counter
from statistics import mean, pstdev

from .sentiment import LABELS, label_for

CUSTOMER_LABELS = {"Customer", "Caller", "Client"}
AGENT_LABELS = {"Agent", "Advisor", "Representative", "Support"}


def distribution(sentences: list[dict], field: str) -> tuple[dict, dict]:
    counts = Counter(sentence[field] for sentence in sentences)
    return (
        {label.lower(): counts[label] for label in LABELS},
        {label.lower(): round(100 * counts[label] / len(sentences), 1) for label in LABELS},
    )


def overall_label(sentences: list[dict]) -> str:
    baseline = label_for(mean(sentence["compound_score"] for sentence in sentences))
    if all(sentence["sentiment"] == sentence["vader_sentiment"] for sentence in sentences):
        return baseline
    # After a contextual change, use the final label majority. Preserve the VADER
    # baseline on a tie when it is tied; otherwise the unresolved tie is Neutral.
    counts = Counter(sentence["sentiment"] for sentence in sentences)
    winners = [label for label, count in counts.items() if count == max(counts.values())]
    return winners[0] if len(winners) == 1 else baseline if baseline in winners else "Neutral"


def sentiment_trend(sentences: list[dict]) -> list[dict]:
    if len(sentences) < 3:
        return []
    # Integer boundaries form three non-empty, contiguous, exhaustive segments.
    bounds = [0, len(sentences) // 3, 2 * len(sentences) // 3, len(sentences)]
    trend = []
    for index, phase in enumerate(("Beginning", "Middle", "End")):
        segment = sentences[bounds[index] : bounds[index + 1]]
        score = mean(sentence["compound_score"] for sentence in segment)
        trend.append(
            {
                "phase": phase,
                "compound_score": round(score, 4),
                "sentiment": label_for(score),
                "sentence_ids": [s["id"] for s in segment],
            }
        )
    return trend


def aggregate(sentences: list[dict]) -> dict:
    total = len(sentences)
    counts, percentages = distribution(sentences, "sentiment")
    baseline_counts, baseline_distribution = distribution(sentences, "vader_sentiment")
    score = mean(sentence["compound_score"] for sentence in sentences)
    customers = [s for s in sentences if s["speaker"] in CUSTOMER_LABELS]
    customer_negative = sum(s["sentiment"] == "Negative" for s in customers)
    customer_score = mean(s["compound_score"] for s in customers) if customers else None
    first, last = sentences[0], sentences[-1]
    difference = last["compound_score"] - first["compound_score"]
    change = (
        ("Improved" if difference >= 0.05 else "Declined" if difference <= -0.05 else "Steady")
        if total > 1
        else None
    )
    volatility = round(pstdev(s["compound_score"] for s in sentences), 4)
    corrected = sum(s["sentiment"] != s["vader_sentiment"] for s in sentences)
    return {
        "overall_sentiment": overall_label(sentences),
        "compound_score": round(score, 4),
        "distribution": percentages,
        "analyzer": "hybrid" if corrected else "vader",
        "vader_baseline": {
            "overall_sentiment": label_for(score),
            "compound_score": round(score, 4),
            "counts": baseline_counts,
            "distribution": baseline_distribution,
        },
        "breakdown": [
            {
                "sentiment": label,
                "count": counts[label.lower()],
                "percentage": percentages[label.lower()],
            }
            for label in LABELS
        ],
        "sentences": sentences,
        "kpis": {
            "sentence_count": total,
            "counts": counts,
            "percentages": percentages,
            "overall_sentiment": overall_label(sentences),
            "overall_compound_score": round(score, 4),
            "sentiment_volatility": volatility,
            "negative_sentence_percentage": percentages["negative"],
            "customer_sentence_count": len(customers),
            "customer_negative_percentage": round(100 * customer_negative / len(customers), 1)
            if customers
            else None,
            "customer_sentiment": overall_label(customers) if customers else None,
            "customer_compound_score": round(customer_score, 4) if customers else None,
            "opening_sentiment": first["vader_sentiment"],
            "closing_sentiment": last["vader_sentiment"],
            "sentiment_change": change,
            "trend": sentiment_trend(sentences),
            "ambiguous_sentence_count": sum(s["ambiguous"] for s in sentences),
            "context_reviewed_count": sum(
                s["analyzer"] == "nemotron-contextual" for s in sentences
            ),
            "context_corrected_count": corrected,
        },
        "notices": ["This is a very short transcript; call-level conclusions may be limited."]
        if total < 3
        else [],
    }
