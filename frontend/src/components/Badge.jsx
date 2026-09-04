export default function Badge({ sentiment }) {
  return <span className={`badge ${sentiment.toLowerCase()}`}><span aria-hidden="true" />{sentiment}</span>;
}
