"""The orchestration boundary: API → compiled LangGraph → NLP functions."""

from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from .insights import InsightsUnavailable, generate_insights
from .kpis import aggregate
from .sentiment import classify_sentences, parse_transcript


class AnalysisState(TypedDict, total=False):
    text: str
    sentences: list[dict]
    result: dict
    include_insights: bool


def parse_node(state: AnalysisState) -> dict:
    return {"sentences": parse_transcript(state["text"])}


def classify_node(state: AnalysisState) -> dict:
    return {"sentences": classify_sentences(state["sentences"])}


def aggregate_node(state: AnalysisState) -> dict:
    return {"result": aggregate(state["sentences"])}


def insights_node(state: AnalysisState) -> dict:
    result = dict(state["result"])
    try:
        insights = generate_insights(state["sentences"])
        reviews = {item["sentence_id"]: item for item in insights["contextual_reviews"]}
        revised = []
        for sentence in state["sentences"]:
            review = reviews.get(sentence["id"])
            revised.append(
                {
                    **sentence,
                    **(
                        {
                            "sentiment": review["sentiment"],
                            "analyzer": "nemotron-contextual",
                            "contextual_reasoning": review["explanation"],
                            "context_sentence_ids": review["sentence_ids"],
                        }
                        if review
                        else {}
                    ),
                }
            )
        result = aggregate(revised)
        result["insights"] = insights
        if result["kpis"]["ambiguous_sentence_count"] > len(reviews):
            result["notices"].append(
                f"Context review covered {len(reviews)} prioritized sentences; remaining labels use VADER."
            )
    except InsightsUnavailable as exc:
        result["insights_notice"] = str(exc)
    except Exception:  # noqa: BLE001 -- preserve core results on any optional adapter failure
        # An unexpected provider/adapter failure must never discard local results.
        result = dict(state["result"])
        result["insights_notice"] = (
            "AI insights are temporarily unavailable. Core sentiment analysis completed successfully."
        )
    return {"result": result}


builder = StateGraph(AnalysisState)
builder.add_node("parse", parse_node)
builder.add_node("classify", classify_node)
builder.add_node("aggregate", aggregate_node)
builder.add_node("insights", insights_node)
builder.add_edge(START, "parse")
builder.add_edge("parse", "classify")
builder.add_edge("classify", "aggregate")
builder.add_conditional_edges(
    "aggregate", lambda state: "insights" if state.get("include_insights") else END
)
builder.add_edge("insights", END)
analysis_graph = builder.compile()


def analyze_conversation(text: str, include_insights: bool = False) -> dict:
    return analysis_graph.invoke({"text": text, "include_insights": include_insights})["result"]
