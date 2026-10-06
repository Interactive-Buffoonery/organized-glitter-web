import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import { GlassPanel } from '@/components/ui/glass-panel';
import { getContactEmail } from '@/lib/contactConfig';
import { useAppReady } from '@/hooks/useAppReady';
import { useAuth } from '@/hooks/useAuth';

// ponytail: static thank-you, Stripe owns payment confirmation and the receipt email.
const SupportSuccess: React.FC = () => {
  useAppReady();
  const { user } = useAuth();
  const contactEmail = getContactEmail();

  return (
    <MainLayout currentPage="Support">
      <div className="container mx-auto max-w-2xl px-4 py-8 md:py-12">
        <GlassPanel className="space-y-6 p-6 text-center md:p-10">
          <img
            src="/images/chibi-wave.png"
            alt=""
            className="bg-primary/15 border-card mx-auto size-20 rounded-2xl border-[3px] object-cover object-top shadow-md"
          />
          <div className="space-y-3">
            <h1 className="font-handwritten text-foreground text-4xl leading-tight tracking-tight md:text-5xl">
              You made my day!
            </h1>
            <p className="text-muted-foreground leading-relaxed">
              Thank you so much for your generous tip! Stripe will email you your receipt.
            </p>
            <p className="font-handwritten text-primary text-2xl leading-tight">
              with love,
              <br />
              sarah
            </p>
          </div>

          <Button asChild variant="glass" size="touch">
            {user ? (
              <Link to="/dashboard">
                <ArrowLeft className="size-4" aria-hidden />
                Back to Library
              </Link>
            ) : (
              <Link to="/">
                <ArrowLeft className="size-4" aria-hidden />
                Back to Organized Glitter
              </Link>
            )}
          </Button>

          <div className="bg-card rounded-lg p-4">
            <p className="text-muted-foreground text-sm">
              Questions about your tip?
              {contactEmail ? (
                <>
                  {' '}
                  Feel free to{' '}
                  <a
                    href={`mailto:${contactEmail}`}
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
        </GlassPanel>
      </div>
    </MainLayout>
  );
};

export default SupportSuccess;
