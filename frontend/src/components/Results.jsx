import { useState } from 'react';
import Badge from './Badge';

const score = value => `${value > 0 ? '+' : ''}${value.toFixed(4)}`;

function ScoreChart({ sentences }) {
  if (sentences.length < 2) return null;
  const points = sentences.map((sentence, index) => `${35 + index / (sentences.length - 1) * 630},${80 - sentence.compound_score * 60}`).join(' ');
  return <svg className="score-chart" viewBox="0 0 700 170" role="img" aria-label="Original VADER sentiment scores, in sentence order, from minus one to plus one">
    {[20, 80, 140].map((y, index) => <g key={y}><line x1="35" x2="665" y1={y} y2={y} stroke="#e0e5ef" strokeDasharray={index === 1 ? '4 4' : undefined} /><text x="0" y={y + 4}>{['+1', '0', '−1'][index]}</text></g>)}
    <polyline points={points} fill="none" stroke="#7565ed" strokeWidth="2.5" strokeLinejoin="round" />
    <text x="35" y="165">Sentence 1</text><text x="665" y="165" textAnchor="end">Sentence {sentences.length}</text>
  </svg>;
}

function SentimentDonut({ breakdown, count }) {
  const colors = { Positive: '#32d6b1', Negative: '#ff6b7a', Neutral: '#9aa7b8' };
  const stops = breakdown.map((item, index) => {
    const start = breakdown.slice(0, index).reduce((total, previous) => total + previous.count, 0) / count * 100;
    const end = start + item.count / count * 100;
    return `${colors[item.sentiment]} ${start}% ${end}%`;
  });
  return <div className="sentiment-donut" style={{ background: `conic-gradient(${stops.join(',')})` }} aria-hidden="true"><div><strong>{count}</strong><span>sentences</span></div></div>;
}

function Evidence({ ids, sentences }) {
  if (!ids.length) return null;
  return <details className="evidence"><summary>View supporting sentences ({ids.length})</summary>{ids.map(id => {
    const sentence = sentences.find(item => item.id === id);
    return sentence ? <blockquote key={id}><span>#{id}{sentence.speaker ? ` · ${sentence.speaker}` : ''}</span>{sentence.text}</blockquote> : null;
  })}</details>;
}

function Finding({ title, value, finding, sentences }) {
  return <article className="emotion-card"><h3>{title}</h3><strong>{value}</strong><p>{finding.explanation}</p><Evidence ids={finding.sentence_ids} sentences={sentences} /></article>;
}

function AIInsights({ insights: ai, sentences }) {
  const fields = [
    ['Customer emotion', ai.customer_emotion, 'emotion'],
    ['Agent emotion', ai.agent_emotion, 'emotion'],
    ['Satisfaction indication', ai.customer_satisfaction, 'level'],
    ['Resolution status', ai.resolution_status, 'status'],
    ['Call outcome', ai.call_outcome, 'status'],
    ['Escalation risk', ai.escalation_risk, 'level'],
  ];
  return <section className="panel ai-insights" aria-labelledby="insights-title">
    <div className="panel-heading"><div><span className="section-number">AI INTERPRETATION</span><h2 id="insights-title">Beyond the sentiment</h2></div><span className="ai-label">NEMOTRON</span></div>
    <div className="insights-content">
      <article className="full-width"><h3>Conversation summary</h3><p>{ai.summary.explanation}</p><Evidence ids={ai.summary.sentence_ids} sentences={sentences} /></article>
      {fields.map(([title, finding, field]) => <Finding key={title} title={title} value={finding[field]} finding={finding} sentences={sentences} />)}
      <Finding title="Complaint indicator" value={ai.complaint.present === null ? 'Unclear' : ai.complaint.present ? 'Complaint identified' : 'No complaint identified'} finding={ai.complaint} sentences={sentences} />
      {ai.primary_issue ? <Finding title="Primary issue" value={ai.primary_issue.topic} finding={ai.primary_issue} sentences={sentences} /> : <article><h3>Primary issue</h3><p>No specific issue identified.</p></article>}
      <article className="full-width"><h3>Key topics</h3>{ai.key_topics.length ? <div className="emotion-grid">{ai.key_topics.map((item, index) => <Finding key={index} title={item.topic} finding={item} sentences={sentences} />)}</div> : <p>No specific topics identified.</p>}</article>
      <article className="full-width"><h3>Emotions expressed</h3>{ai.emotions.length ? <div className="emotion-grid">{ai.emotions.map(item => <Finding key={item.emotion} title={item.emotion} finding={item} sentences={sentences} />)}</div> : <p>No specific emotion was clearly supported by the transcript.</p>}</article>
      <article className="full-width"><h3>Contextual reasoning</h3><p>{ai.reasoning.explanation}</p><Evidence ids={ai.reasoning.sentence_ids} sentences={sentences} /></article>
      <p className="insights-disclaimer">AI-inferred interpretations, with transcript evidence. Satisfaction is an indication, not a measured survey score. Unknown means there is insufficient labeled evidence. Review the supporting sentences before accepting an outcome.</p>
    </div>
  </section>;
}

export default function ResultDashboard({ result }) {
  const { kpis } = result;
  const [query, setQuery] = useState('');
  const [sentimentFilter, setSentimentFilter] = useState('All');
  const visibleSentences = result.sentences.filter(sentence =>
    (sentimentFilter === 'All' || sentence.sentiment === sentimentFilter)
    && `${sentence.speaker || ''} ${sentence.text}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="results" aria-label="Analysis results">
    {result.insights_notice && <p className="insights-notice" role="status">{result.insights_notice}</p>}
    {result.notices.map(notice => <p key={notice} className="insights-notice" role="status">{notice}</p>)}
    <section className="panel overview" aria-labelledby="overview-title">
      <div className="panel-heading"><div><span className="section-number">02 / THE BIG PICTURE</span><h2 id="overview-title">Conversation overview</h2></div><span className="complete-mark">✓ Analysis complete</span></div>
      <div className="overview-content">
        <div className={`overall ${result.overall_sentiment.toLowerCase()}`}><span className="small-label">Overall sentiment</span><strong>{result.overall_sentiment}</strong><span>Across all speakers</span></div>
        <div className="breakdown"><h3>Sentiment breakdown</h3><div className="distribution-layout"><SentimentDonut breakdown={result.breakdown} count={kpis.sentence_count} /><div className="distribution-values"><div className="stacked-bar sr-only" role="img" aria-label={result.breakdown.map(item => `${item.sentiment}: ${item.percentage}%`).join(', ')}>{result.breakdown.map(item => <span className={item.sentiment.toLowerCase()} key={item.sentiment} style={{ width: `${item.percentage}%` }} />)}</div>
          <div className="legend">{result.breakdown.map(item => <div key={item.sentiment}><span className={`legend-dot ${item.sentiment.toLowerCase()}`} /><span>{item.sentiment}</span><strong>{item.percentage}%</strong><small>{item.count} {item.count === 1 ? 'sentence' : 'sentences'}</small></div>)}</div>
        </div></div></div>
      </div>
      <div className="score-strip"><div><span>Compound score · VADER</span><strong>{score(result.compound_score)}</strong></div><p>Average original sentence polarity, from −1 to +1. This is not a confidence score.</p></div>
      {kpis.context_reviewed_count > 0 && <p className="context-note">AI reviewed {kpis.context_reviewed_count} ambiguous sentences and changed {kpis.context_corrected_count} labels. Original VADER overall: <strong>{result.vader_baseline.overall_sentiment}</strong>. Scores remain unchanged; the distribution reflects the final labels.</p>}
    </section>
    <section aria-label="Calculated conversation KPIs" className="kpi-grid">
      <article className="kpi"><span>Sentences analyzed</span><strong>{kpis.sentence_count}</strong><p>Across the full transcript</p></article>
      <article className="kpi"><span>Negative sentences</span><strong>{kpis.negative_sentence_percentage}<small>%</small></strong><p>Counted from final sentence labels</p></article>
      <article className="kpi"><span>Customer sentiment</span><strong className="trend">{kpis.customer_sentiment || 'N/A'}</strong><p>{kpis.customer_sentence_count ? `${kpis.customer_sentence_count} labeled sentences · ${kpis.customer_negative_percentage}% negative` : 'Requires Customer: labels'}</p></article>
      <article className="kpi"><span>Sentiment volatility</span><strong>{kpis.sentiment_volatility.toFixed(4)}</strong><p>Variation in original VADER scores</p></article>
    </section>
    <section className="panel" aria-labelledby="trend-title">
      <div className="panel-heading"><div><span className="section-number">THE CONVERSATION ARC</span><h2 id="trend-title">Sentiment trend</h2></div><span className="file-caption">Original VADER scores</span></div>
      <ScoreChart sentences={result.sentences} />
      {kpis.trend.length ? <ol className="trend-segments">{kpis.trend.map(segment => <li key={segment.phase}><span>{segment.phase}</span><Badge sentiment={segment.sentiment} /><strong>{score(segment.compound_score)}</strong><small>Sentences {segment.sentence_ids[0]}–{segment.sentence_ids.at(-1)}</small></li>)}</ol> : <p className="context-note">At least three sentences are needed to show a beginning, middle, and end.</p>}
    </section>
    <section className="panel sentence-panel" aria-labelledby="sentence-title">
      <div className="panel-heading"><div><span className="section-number">03 / A CLOSER LOOK</span><h2 id="sentence-title">Sentence by sentence</h2></div><span className="file-caption" title={result.filename}>{result.filename}</span></div>
      <div className="sentence-controls"><label><span className="sr-only">Search sentences</span><input type="search" placeholder="Search sentences or speakers…" value={query} onChange={event => setQuery(event.target.value)} /></label><label><span className="sr-only">Filter by sentiment</span><select value={sentimentFilter} onChange={event => setSentimentFilter(event.target.value)}>{['All', 'Positive', 'Negative', 'Neutral'].map(label => <option key={label} value={label}>{label === 'All' ? 'All sentiments' : label}</option>)}</select></label><span role="status">{visibleSentences.length} of {result.sentences.length}</span></div>
      <div className="table-scroll"><table><caption className="sr-only">Sentiment for every sentence in {result.filename}</caption><thead><tr><th scope="col">#</th><th scope="col">Speaker / sentence</th><th scope="col">Sentiment</th><th scope="col">VADER score</th></tr></thead><tbody>{visibleSentences.map(sentence => <tr key={sentence.id}>
        <td className="sentence-id">{String(sentence.id).padStart(2, '0')}</td><td>{sentence.speaker && <span className="speaker">{sentence.speaker}</span>}<p>{sentence.text}</p>
          {sentence.analyzer === 'nemotron-contextual' && <details className="context-review"><summary>Context reviewed{sentence.sentiment !== sentence.vader_sentiment ? ' · label changed' : ''}</summary><p>Original VADER label: <strong>{sentence.vader_sentiment}</strong>. {sentence.contextual_reasoning}</p><Evidence ids={sentence.context_sentence_ids} sentences={result.sentences} /></details>}
        </td><td><Badge sentiment={sentence.sentiment} /></td><td className="numeric-score">{score(sentence.compound_score)}</td>
      </tr>)}{!visibleSentences.length && <tr><td colSpan="4" className="no-sentences">No sentences match. Try another search or sentiment.</td></tr>}</tbody></table></div>
    </section>
    {result.insights && <AIInsights insights={result.insights} sentences={result.sentences} />}
    <details className="method-note"><summary>How to read these results</summary><p>VADER analyzes English wording, negation, and emphasis. Without changed contextual labels, overall sentiment uses the mean original sentence score (positive ≥ 0.05; negative ≤ −0.05). When AI changes a label, the most frequent final label determines overall sentiment. Ties retain the VADER baseline if it is tied; otherwise they are Neutral.</p><p>Counts and percentages are calculated from the final labels. Scores, volatility (population standard deviation), and trend always use original VADER scores. Trend divides the transcript into three contiguous parts across all speakers. A positive ending does not establish resolution. Customer metrics use explicit Customer, Caller, or Client labels. Rounded percentages may not total exactly 100%.</p></details>
  </div>;
}

