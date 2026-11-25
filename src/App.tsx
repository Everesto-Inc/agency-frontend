import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { isActivated, isAdmin, useAuth } from '@/auth/AuthContext';
import { Layout } from '@/components/Layout';
import { Spinner } from '@/components/ui';
import { AuthPage } from '@/pages/AuthPage';

// one chunk per screen: the login page loads only what it needs
const ChatPage = lazy(() => import('@/pages/ChatPage'));
const UsagePage = lazy(() => import('@/pages/UsagePage'));
const AccountPage = lazy(() => import('@/pages/AccountPage'));
const PendingPage = lazy(() => import('@/pages/PendingPage'));
const AdminOverviewPage = lazy(() => import('@/pages/admin/AdminOverviewPage'));
const AdminUsersPage = lazy(() => import('@/pages/admin/AdminUsersPage'));
const AdminGuardrailsPage = lazy(() => import('@/pages/admin/AdminGuardrailsPage'));
const AdminQualityPage = lazy(() => import('@/pages/admin/AdminQualityPage'));
const AdminSettingsPage = lazy(() => import('@/pages/admin/AdminSettingsPage'));

export function App() {
  const { state } = useAuth();
  if (state.status === 'loading') return <div className="min-h-dvh"><Spinner /></div>;

  if (state.status === 'anonymous') {
    return (
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const me = state.me;
  const active = isActivated(me);
  const page = (el: ReactNode) => <Suspense fallback={<Spinner />}>{el}</Suspense>;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={page(active ? <ChatPage /> : <PendingPage />)} />
        <Route path="c/:conversationId" element={active ? page(<ChatPage />) : <Navigate to="/" replace />} />
        <Route path="usage" element={active ? page(<UsagePage />) : <Navigate to="/" replace />} />
        <Route path="account" element={page(<AccountPage />)} />
        {isAdmin(me) && <Route path="admin" element={page(<AdminOverviewPage />)} />}
        {isAdmin(me) && <Route path="admin/users" element={page(<AdminUsersPage />)} />}
        {isAdmin(me) && <Route path="admin/guardrails" element={page(<AdminGuardrailsPage />)} />}
        {isAdmin(me) && <Route path="admin/quality" element={page(<AdminQualityPage />)} />}
        {isAdmin(me) && <Route path="admin/settings" element={page(<AdminSettingsPage />)} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
