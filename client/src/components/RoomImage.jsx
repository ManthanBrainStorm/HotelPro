import { assetUrl } from '../api';

export default function RoomImage({ room, className = '' }) {
  const src = room.images?.[0];
  return (
    <div className={`room-art ${className}`}>
      {src ? <img src={assetUrl(src)} alt={`Room ${room.number}`} loading="lazy" /> : <span>{room.category?.name || 'Room'}</span>}
    </div>
  );
}
