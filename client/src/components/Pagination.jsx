export default function Pagination({ page, pages, onChange }) {
  if (!pages || pages <= 1) return null;
  const nums = [];
  for (let i = 1; i <= pages; i += 1) if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
  return (
    <nav aria-label="Pagination" className="mt-3">
      <ul className="pagination pagination-sm mb-0 flex-wrap">
        <li className={`page-item ${page <= 1 ? 'disabled' : ''}`}><button className="page-link" onClick={() => onChange(page - 1)}>Previous</button></li>
        {nums.map((n, i) => (
          <li key={n} className={`page-item ${n === page ? 'active' : ''}`}>
            {i > 0 && n - nums[i - 1] > 1 && <span className="page-link disabled d-inline-block border-0 bg-transparent">…</span>}
            <button className="page-link d-inline-block" onClick={() => onChange(n)} aria-current={n === page ? 'page' : undefined}>{n}</button>
          </li>
        ))}
        <li className={`page-item ${page >= pages ? 'disabled' : ''}`}><button className="page-link" onClick={() => onChange(page + 1)}>Next</button></li>
      </ul>
    </nav>
  );
}
