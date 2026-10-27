import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import api from '../api';

export const fetchUnread = createAsyncThunk('notifications/unread', async () => (await api.get('/notifications/unread-count')).data.unread);

const slice = createSlice({
  name: 'notifications',
  initialState: { unread: 0 },
  reducers: { setUnread: (s, a) => { s.unread = Math.max(0, a.payload); } },
  extraReducers: (b) => { b.addCase(fetchUnread.fulfilled, (s, a) => { s.unread = a.payload; }); },
});

export const { setUnread } = slice.actions;
export default slice.reducer;
