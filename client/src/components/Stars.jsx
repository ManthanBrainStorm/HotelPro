import Rating from '@mui/material/Rating';

export default function Stars({ value = 0, count, size = 'small' }) {
  return (
    <span className="d-inline-flex align-items-center gap-1">
      <Rating value={value} precision={0.5} readOnly size={size} />
      {count !== undefined && <small className="text-muted">{count ? `${value} (${count})` : 'No reviews yet'}</small>}
    </span>
  );
}
