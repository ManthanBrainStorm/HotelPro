import { useDispatch, useSelector } from 'react-redux';

export const useAuth = () => useSelector((s) => s.auth);
export const useAppDispatch = useDispatch;
