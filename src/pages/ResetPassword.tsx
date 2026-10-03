import { notify } from '@/lib/notifications';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoaderCircle } from 'lucide-react';
import { useAppReady } from '@/hooks/useAppReady';
import { useNoIndexPage } from '@/hooks/usePageMetadata';
import { buildResetConfirmationPath } from '@/utils/auth/resetLink';

const ResetPassword = () => {
  useAppReady();

  // Prevent search engines from indexing auth pages
  useNoIndexPage('Reset Password');

  const navigate = useNavigate();
  const { search } = useLocation();

  useEffect(() => {
    const token = new URLSearchParams(search).get('token');
    const resetPath = buildResetConfirmationPath(token);

    if (resetPath) {
      navigate(resetPath, { replace: true });
      return;
    }

    notify({
      kind: 'error',
      title: 'Invalid or expired link',
      description: 'Please request a new password reset link',
    });
    navigate('/forgot-password', { replace: true });
  }, [navigate, search]);

  return (
    <MainLayout>
      <div className="diamond-pattern flex min-h-[80vh] items-center justify-center px-4 py-12">
        <Card className="glass-card mx-auto w-full max-w-md">
          <CardHeader>
            <CardTitle>Redirecting to Password Reset</CardTitle>
            <CardDescription>
              We&apos;re sending you to the current password reset flow.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center py-8">
            <LoaderCircle className="text-primary size-8 animate-spin" />
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default ResetPassword;
