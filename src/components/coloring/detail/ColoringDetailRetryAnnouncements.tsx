interface ColoringDetailRetryAnnouncementsProps {
  primary: string;
  secondary: string;
  loadingText?: string;
}

export function ColoringDetailRetryAnnouncements({
  primary,
  secondary,
  loadingText,
}: ColoringDetailRetryAnnouncementsProps) {
  return (
    <>
      <div
        className="sr-only"
        role={primary || loadingText ? 'status' : undefined}
        aria-live="polite"
        aria-atomic="true"
      >
        {primary || loadingText}
      </div>
      <div
        className="sr-only"
        role={secondary ? 'status' : undefined}
        aria-live="polite"
        aria-atomic="true"
      >
        {secondary}
      </div>
    </>
  );
}
