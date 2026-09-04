from typing import Literal

from pydantic import BaseModel

from .insights import ConversationInsights

Sentiment = Literal["Positive", "Negative", "Neutral"]


class LoginResult(BaseModel):
    username: str


class SentenceResult(BaseModel):
    id: int
    speaker: str | None
    text: str
    sentiment: Sentiment
    vader_sentiment: Sentiment
    compound_score: float
    analyzer: Literal["vader", "nemotron-contextual"]
    ambiguous: bool
    ambiguity_reasons: list[str]
    contextual_reasoning: str | None
    context_sentence_ids: list[int]


class BreakdownItem(BaseModel):
    sentiment: Sentiment
    count: int
    percentage: float


class TrendSegment(BaseModel):
    phase: Literal["Beginning", "Middle", "End"]
    compound_score: float
    sentiment: Sentiment
    sentence_ids: list[int]


class SentimentCounts(BaseModel):
    positive: int
    negative: int
    neutral: int


class Distribution(BaseModel):
    positive: float
    negative: float
    neutral: float


class VaderBaseline(BaseModel):
    overall_sentiment: Sentiment
    compound_score: float
    counts: SentimentCounts
    distribution: Distribution


class CallKPIs(BaseModel):
    sentence_count: int
    negative_sentence_percentage: float
    customer_sentence_count: int
    customer_negative_percentage: float | None
    opening_sentiment: Sentiment
    closing_sentiment: Sentiment
    sentiment_change: Literal["Improved", "Declined", "Steady"] | None
    counts: SentimentCounts
    percentages: Distribution
    overall_compound_score: float
    overall_sentiment: Sentiment
    sentiment_volatility: float
    customer_sentiment: Sentiment | None
    customer_compound_score: float | None
    ambiguous_sentence_count: int
    context_reviewed_count: int
    context_corrected_count: int
    trend: list[TrendSegment]


class AnalysisResult(BaseModel):
    filename: str
    overall_sentiment: Sentiment
    compound_score: float
    distribution: Distribution
    analyzer: Literal["vader", "hybrid"]
    vader_baseline: VaderBaseline
    breakdown: list[BreakdownItem]
    sentences: list[SentenceResult]
    kpis: CallKPIs
    insights: ConversationInsights | None = None
    insights_notice: str | None = None
    notices: list[str]
