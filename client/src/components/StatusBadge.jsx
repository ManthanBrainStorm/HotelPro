export default function StatusBadge({ value }) {
  if (!value) return null;
  return <span className={`status status-${String(value).replace(/_/g, '-')}`}>{String(value).replace(/[_-]/g, ' ')}</span>;
}
