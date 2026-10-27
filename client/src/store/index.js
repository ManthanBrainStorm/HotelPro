import { configureStore } from '@reduxjs/toolkit';
import auth from './authSlice';
import notifications from './notificationSlice';

export const store = configureStore({ reducer: { auth, notifications } });
