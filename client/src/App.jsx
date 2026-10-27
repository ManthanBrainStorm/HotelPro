import { lazy, Suspense } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import VerifyBanner from './components/VerifyBanner';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';

// Heavier pages load on demand (code splitting).
const RoomDetails = lazy(() => import('./pages/RoomDetails'));
const MyBookings = lazy(() => import('./pages/MyBookings'));
const Pay = lazy(() => import('./pages/Pay'));
const PaymentSuccess = lazy(() => import('./pages/PaymentSuccess'));
const Profile = lazy(() => import('./pages/Profile'));
const Notifications = lazy(() => import('./pages/Notifications'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const Dashboard = lazy(() => import('./pages/dashboard/Dashboard'));

const NotFound = () => (
  <div className="container py-5"><h1 className="h2">Page not found</h1><Link to="/">Back to rooms</Link></div>
);

export default function App() {
  return (
    <>
      <Navbar />
      <VerifyBanner />
      <main>
        <Suspense fallback={<p className="container py-5">Loading…</p>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/rooms/:id" element={<RoomDetails />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/verify-email/:token" element={<VerifyEmail />} />
            <Route path="/my-bookings" element={<ProtectedRoute><MyBookings /></ProtectedRoute>} />
            <Route path="/pay/:id" element={<ProtectedRoute><Pay /></ProtectedRoute>} />
            <Route path="/payment/success" element={<ProtectedRoute><PaymentSuccess /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute roles={['staff', 'admin']}><Dashboard /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      <footer className="container py-4 small text-muted">© {new Date().getFullYear()} HotelPro</footer>
    </>
  );
}
