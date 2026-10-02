import { getAuthToken } from '@/services/auth';
import { sendFeedbackRequest } from '@/services/pocketbase/feedback.service';
import {
  isSessionTokenInactive,
  recordCompletedSessionFeedback,
} from '@/services/auth/sessionRecovery';
import { logger } from '@/utils/logger';
import { safeEnv } from '@/utils/safe-env';
import { getContactEmail, getMailtoFallbackMessage } from '@/lib/contactConfig';

/**
 * Feedback request payload interface
 */
interface FeedbackRequest {
  feedback: string;
  email?: string;
  type?: 'general' | 'bug' | 'feature' | 'improvement';
}

/**
 * Feedback response interface
 */
interface FeedbackResponse {
  success: boolean;
  message?: string;
  error?: string;
  details?: string[];
  retryAfter?: number;
  reason?: string;
}

/**
 * Function parameters interface
 */
interface SendFeedbackEmailParams {
  draftId?: string;
  message: string;
  name?: string;
  email?: string;
  eventId?: string;
  currentPage?: string;
}

/**
 * Function return type interface
 */
interface SendFeedbackEmailResult {
  success: boolean;
  emailId?: string;
  error?: string;
  reason?: string;
}

class FeedbackApiError extends Error {
  constructor(
    message: string,
    readonly shouldUseMailtoFallback = true,
    readonly reason?: string
  ) {
    super(message);
    this.name = 'FeedbackApiError';
  }
}

const isClientValidationError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;

  return (
    error.message === 'Message is required and must be a string' ||
    error.message === 'Invalid email format' ||
    error.message.startsWith('Message must be ')
  );
};

const getFallbackResponseMessage = (response: Response) =>
  `HTTP ${response.status}: ${response.statusText || 'Request failed'}`;

export { getContactEmail as FEEDBACK_CONTACT_EMAIL };

const readFeedbackResponse = async (response: Response): Promise<FeedbackResponse> => {
  try {
    return (await response.json()) as FeedbackResponse;
  } catch {
    return {
      success: false,
      error: getFallbackResponseMessage(response),
    };
  }
};

const getFeedbackResponseError = (response: Response, responseData: FeedbackResponse): Error => {
  if (response.status === 429 || responseData.error?.includes('Too many requests')) {
    const retryAfter = responseData.retryAfter ? Math.ceil(responseData.retryAfter / 60) : 15;
    return new FeedbackApiError(
      `Rate limit exceeded. Please try again in ${retryAfter} minutes.`,
      false,
      responseData.reason || 'rate_limited'
    );
  }

  if (response.status === 401 || response.status === 403 || response.status >= 500) {
    return new FeedbackApiError(
      responseData.error || getFallbackResponseMessage(response),
      false,
      response.status === 401 ? 'session_required' : responseData.reason
    );
  }

  return new FeedbackApiError(responseData.error || getFallbackResponseMessage(response));
};

/**
 * Send authenticated feedback through the server email endpoint.
 */
export async function sendFeedbackEmail({
  draftId,
  message,
  name = 'Anonymous User',
  email,
  eventId,
  currentPage,
}: SendFeedbackEmailParams): Promise<SendFeedbackEmailResult> {
  const normalizedMessage = typeof message === 'string' ? message.trim() : '';
  try {
    // Input validation
    if (!message || typeof message !== 'string') {
      throw new Error('Message is required and must be a string');
    }
    if (normalizedMessage.length < 10) {
      throw new Error('Message must be at least 10 characters long');
    }

    if (normalizedMessage.length > 5000) {
      throw new Error('Message must be less than 5000 characters');
    }

    // Validate email format if provided
    if (email && typeof email === 'string') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new Error('Invalid email format');
      }
    }

    const token = getAuthToken();
    if (!token) {
      throw new FeedbackApiError(
        'Please sign in again to send feedback.',
        false,
        'session_required'
      );
    }

    // In local development, just log the feedback
    if (
      window.location.hostname === 'localhost' ||
      window.location.hostname.includes('127.0.0.1')
    ) {
      logger.log(
        '%c📧 LOCAL FEEDBACK 📧',
        'background: #4CAF50; color: white; padding: 4px; border-radius: 4px;'
      );
      logger.log({
        messageLength: normalizedMessage.length,
        hasName: Boolean(name),
        hasEmail: Boolean(email),
        hasEventId: Boolean(eventId),
        currentPage,
        timestamp: new Date().toISOString(),
      });
      logger.log(`This feedback would be emailed to ${getContactEmail()} in production`);

      return { success: true };
    }

    // Send via server feedback endpoint
    logger.log('Sending feedback email via feedback API...');

    const contactEmail = email?.trim();

    const feedbackData: FeedbackRequest = {
      feedback: normalizedMessage,
      email: contactEmail,
      type: eventId ? 'bug' : 'general',
    };

    // PocketBase owns feedback for both the web and native app.
    const response = await sendFeedbackRequest(feedbackData, token);

    const responseData = await readFeedbackResponse(response);

    logger.log('Feedback API response:', responseData);

    if (!response.ok) {
      throw getFeedbackResponseError(response, responseData);
    }

    if (!responseData.success) {
      // Handle specific error cases
      throw getFeedbackResponseError(response, responseData);
    }

    if (isSessionTokenInactive(token)) {
      recordCompletedSessionFeedback(token, {
        draftId,
        message: message.trim(),
        name,
        email: contactEmail || '',
      });
    }

    if (safeEnv.isDev) {
      safeEnv.log('Feedback email sent successfully:', responseData);
    }

    return {
      success: true,
      emailId: 'feedback-api-sent',
    };
  } catch (error) {
    if (safeEnv.isDev) {
      safeEnv.log('Failed to send feedback email:', error);
    } else {
      logger.error('Failed to send feedback email:', error);
    }

    // Fallback to mailto link
    try {
      if (isClientValidationError(error)) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      if (error instanceof FeedbackApiError && !error.shouldUseMailtoFallback) {
        return {
          success: false,
          error: error.message,
          ...(error.reason ? { reason: error.reason } : {}),
        };
      }

      logger.log('Using mailto fallback...');

      const subject = encodeURIComponent(`Feedback from ${name || 'Anonymous User'}`);
      const body = encodeURIComponent(
        `
Feedback Message:
${normalizedMessage}

User Details:
- Name: ${name || 'Anonymous User'}
- Email: ${email || 'Not provided'}
- Error ID: ${eventId || 'None'}
- Page: ${currentPage || 'Not provided'}
- Submitted: ${new Date().toLocaleString()}

Technical Error: ${error instanceof Error ? error.message : String(error)}
      `.trim()
      );

      const contactEmail = getContactEmail();
      if (!contactEmail)
        return { success: false, error: getMailtoFallbackMessage(), reason: 'contact_unavailable' };
      const mailtoUrl = `mailto:${contactEmail}?subject=${subject}&body=${body}`;
      window.open(mailtoUrl, '_blank');

      return {
        success: false,
        error: getMailtoFallbackMessage(),
        reason: 'mailto_fallback',
      };
    } catch (_fallbackError) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
