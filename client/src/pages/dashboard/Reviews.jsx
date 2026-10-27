import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api, { errMsg, fmtDate } from '../../api';
import Pagination from '../../components/Pagination';
import Stars from '../../components/Stars';

export default function Reviews() {
  const [data, setData] = useState({ reviews: [], page: 1, pages: 1 });
  const [page, setPage] = useState(1);
  const load = useCallback(() => api.get('/reviews', { params: { page } }).then((r) => setData(r.data)).catch((e) => toast.error(errMsg(e))), [page]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (r) => {
    try { await api.patch(`/reviews/${r._id}/visibility`, { isVisible: !r.isVisible }); toast.success(r.isVisible ? 'Review hidden' : 'Review published'); load(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <>
      <div className="table-responsive panel p-0">
        <table className="table align-middle mb-0">
          <thead><tr><th>Room</th><th>Guest</th><th>Rating</th><th>Comment</th><th>Date</th><th /></tr></thead>
          <tbody>
            {data.reviews.map((r) => (
              <tr key={r._id} className={r.isVisible ? '' : 'opacity-50'}>
                <td>{r.room?.number}</td><td>{r.user?.name}</td><td><Stars value={r.rating} /></td><td>{r.comment}</td><td className="small">{fmtDate(r.createdAt)}</td>
                <td className="text-end"><button className="btn btn-sm btn-outline-secondary" onClick={() => toggle(r)}>{r.isVisible ? 'Hide' : 'Show'}</button></td>
              </tr>
            ))}
            {data.reviews.length === 0 && <tr><td colSpan="6" className="text-muted">No reviews yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={data.page} pages={data.pages} onChange={setPage} />
    </>
  );
}
