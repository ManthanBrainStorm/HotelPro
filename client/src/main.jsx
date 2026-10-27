import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { ToastContainer } from 'react-toastify';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'react-toastify/dist/ReactToastify.css';
import './styles.css';
import App from './App.jsx';
import { store } from './store';
import { loadSession, clearUser } from './store/authSlice';

store.dispatch(loadSession());
window.addEventListener('hp-unauthorized', () => store.dispatch(clearUser()));

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <App />
        <ToastContainer position="bottom-right" autoClose={3500} theme="colored" />
      </BrowserRouter>
    </Provider>
  </React.StrictMode>
);
