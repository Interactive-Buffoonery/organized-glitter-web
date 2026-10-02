import React from 'react';
import { CheckCircle, Heart, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import { getContactEmail } from '@/lib/contactConfig';
import { useAppReady } from '@/hooks/useAppReady';

const SupportSuccess: React.FC = () => {
  useAppReady();
  return (
    <MainLayout>
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="space-y-6 text-center">
          {/* Success Icon */}
          <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <CheckCircle className="size-12 text-green-700 dark:text-green-300" />
          </div>

          {/* Success Message */}
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold text-green-800 dark:text-green-300">
              Thank You for Your Support!
            </h1>
            <p className="text-muted-foreground text-lg">
              Your contribution helps keep Organized Glitter running and accessible to everyone.
            </p>
          </div>

          {/* Details Card */}
          <div className="bg-card space-y-4 rounded-lg border border-green-200 p-6 dark:border-green-900/50">
            <div className="flex items-center justify-center gap-2 text-green-800 dark:text-green-300">
              <Heart className="size-5" />
              <span className="font-medium">Payment Successful</span>
            </div>
            <p className="text-muted-foreground text-sm">
              You should receive a confirmation email from PayPal shortly. Your support makes a real
              difference in keeping this platform free and improving.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Button asChild>
              <Link to="/dashboard" className="flex items-center gap-2">
                <ArrowLeft className="size-4" />
                Back to Library
              </Link>
            </Button>

            <Button asChild variant="outline">
              <Link to="/profile" className="flex items-center gap-2">
                View Settings
              </Link>
            </Button>
          </div>

          {/* Additional Message */}
          <div className="bg-card mt-8 rounded-lg p-4">
            <p className="text-muted-foreground text-sm">
              Have questions or feedback?
              {getContactEmail() ? (
                <>
                  {' '}
                  Feel free to{' '}
                  <a
                    href={`mailto:${getContactEmail()}`}
                    className="text-link underline hover:decoration-2"
                  >
                    reach out
                  </a>
                  .
                </>
              ) : (
                ' Contact your administrator.'
              )}
            </p>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default SupportSuccess;
