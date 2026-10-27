import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import api, { errMsg } from '../api';

export const loadSession = createAsyncThunk('auth/load', async (_, { rejectWithValue }) => {
  if (!localStorage.getItem('token')) return null;
  try {
    return (await api.get('/auth/me')).data.user;
  } catch (e) {
    localStorage.removeItem('token');
    return rejectWithValue(errMsg(e));
  }
});

const authenticate = (path) => async (payload, { rejectWithValue }) => {
  try {
    const { data } = await api.post(path, payload);
    localStorage.setItem('token', data.token);
    return data.user;
  } catch (e) {
    return rejectWithValue(errMsg(e));
  }
};
export const login = createAsyncThunk('auth/login', authenticate('/auth/login'));
export const register = createAsyncThunk('auth/register', authenticate('/auth/register'));

export const updateProfile = createAsyncThunk('auth/profile', async (payload, { rejectWithValue }) => {
  try {
    return (await api.put('/auth/profile', payload)).data.user;
  } catch (e) {
    return rejectWithValue(errMsg(e));
  }
});

const slice = createSlice({
  name: 'auth',
  initialState: { user: null, loading: Boolean(localStorage.getItem('token')) },
  reducers: {
    clearUser(state) {
      localStorage.removeItem('token');
      state.user = null;
    },
    setVerified(state) {
      if (state.user) state.user.emailVerified = true;
    },
  },
  extraReducers: (b) => {
    b.addCase(loadSession.fulfilled, (s, a) => { s.user = a.payload; s.loading = false; })
      .addCase(loadSession.rejected, (s) => { s.user = null; s.loading = false; })
      .addCase(login.fulfilled, (s, a) => { s.user = a.payload; })
      .addCase(register.fulfilled, (s, a) => { s.user = a.payload; })
      .addCase(updateProfile.fulfilled, (s, a) => { s.user = a.payload; });
  },
});

export const { clearUser, setVerified } = slice.actions;
export default slice.reducer;
