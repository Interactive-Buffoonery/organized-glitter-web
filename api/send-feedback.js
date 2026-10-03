function escapeHtml(unsafe) {
  // Coerce input to string to handle null, undefined, and non-string values
  const str = String(unsafe || '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const STATIC_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_FEEDBACK_FIELDS = new Set(['feedback', 'email', 'accountEmail', 'type', 'userId']);
const ALLOWED_FEEDBACK_TYPES = new Set(['general', 'bug', 'feature', 'improvement', 'other']);

function normalizeOrigin(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(candidate).origin;
  } catch {
    return null;
  }
}

function getAllowedOrigins() {
  const configuredOrigins = [
    process.env.VITE_APP_URL,
    ...(process.env.FEEDBACK_ALLOWED_ORIGINS || '').split(','),
  ];

  return new Set(
    [...STATIC_ALLOWED_ORIGINS, ...configuredOrigins]
      .map(normalizeOrigin)
      .filter(origin => origin !== null)
  );
}

function appendVaryOrigin(res) {
  const existingValue = typeof res.getHeader === 'function' ? res.getHeader('Vary') : undefined;
  const existingValues = Array.isArray(existingValue)
    ? existingValue
    : String(existingValue || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);

  if (existingValues.some(value => value.toLowerCase() === 'origin')) {
    return;
  }

  res.setHeader('Vary', [...existingValues, 'Origin'].join(', '));
}

export function applyFeedbackCorsHeaders(req, res) {
  const origin = req.headers.origin;
  const hasOrigin = typeof origin === 'string' && origin.length > 0;
  const isAllowedOrigin = hasOrigin && getAllowedOrigins().has(origin);
  if (!isAllowedOrigin) {
    return false;
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '300');
  appendVaryOrigin(res);

  return true;
}

function getFeedbackEmailConfig() {
  const from = String(process.env.FEEDBACK_FROM_EMAIL || '').trim();
  const to = (process.env.FEEDBACK_TO_EMAIL || '')
    .split(',')
    .map(email => email.trim())
    .filter(Boolean);
  return { from, to };
}

function getFeedbackLogSummary({
  feedback,
  email,
  unverifiedAccountEmail,
  type,
  unverifiedUserId,
}) {
  return {
    type,
    feedbackLength: typeof feedback === 'string' ? feedback.length : 0,
    hasEmail: Boolean(email),
    emailLength: typeof email === 'string' ? email.length : 0,
    hasUnverifiedAccountEmail: Boolean(unverifiedAccountEmail),
    unverifiedAccountEmailLength:
      typeof unverifiedAccountEmail === 'string' ? unverifiedAccountEmail.length : 0,
    hasUnverifiedUserId: Boolean(unverifiedUserId),
    unverifiedUserIdLength: typeof unverifiedUserId === 'string' ? unverifiedUserId.length : 0,
  };
}

function getErrorLogSummary(error) {
  if (!error || typeof error !== 'object') {
    return {
      name: typeof error,
      messageLength: 0,
    };
  }

  return {
    name: typeof error.name === 'string' ? error.name : error.constructor?.name,
    messageLength: typeof error.message === 'string' ? error.message.length : 0,
    statusCode:
      typeof error.statusCode === 'number'
        ? error.statusCode
        : typeof error.status === 'number'
          ? error.status
          : undefined,
  };
}

function validationError(message) {
  return {
    ok: false,
    error: message,
  };
}

function normalizeOptionalString(body, field, { maxLength, email = false }) {
  if (!Object.prototype.hasOwnProperty.call(body, field) || body[field] === undefined) {
    return { ok: true, value: undefined };
  }

  if (typeof body[field] !== 'string') {
    return validationError(`${field} must be a string`);
  }

  const value = body[field].trim();
  if (!value) {
    return { ok: true, value: undefined };
  }

  if (value.length > maxLength) {
    return validationError(`${field} must be ${maxLength} characters or fewer`);
  }

  if (email && !EMAIL_PATTERN.test(value)) {
    return validationError(`${field} must be a valid email address`);
  }

  return { ok: true, value };
}

function validateFeedbackBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return validationError('Request body must be a JSON object');
  }

  const unknownFields = Object.keys(body).filter(field => !ALLOWED_FEEDBACK_FIELDS.has(field));
  if (unknownFields.length > 0) {
    return validationError('Request body contains unsupported fields');
  }

  if (!Object.prototype.hasOwnProperty.call(body, 'feedback')) {
    return validationError('Feedback is required');
  }

  if (typeof body.feedback !== 'string') {
    return validationError('Feedback must be a string');
  }

  const feedback = body.feedback.trim();
  if (feedback.length < 10) {
    return validationError('Feedback must be at least 10 characters long');
  }

  if (feedback.length > 5000) {
    return validationError('Feedback must be 5000 characters or fewer');
  }

  const email = normalizeOptionalString(body, 'email', { maxLength: 320, email: true });
  if (!email.ok) return email;

  const accountEmail = normalizeOptionalString(body, 'accountEmail', {
    maxLength: 320,
    email: true,
  });
  if (!accountEmail.ok) return accountEmail;

  const userId = normalizeOptionalString(body, 'userId', { maxLength: 128 });
  if (!userId.ok) return userId;

  let type = 'general';
  if (Object.prototype.hasOwnProperty.call(body, 'type') && body.type !== undefined) {
    if (typeof body.type !== 'string') {
      return validationError('type must be a string');
    }

    type = body.type.trim();
    if (!type) {
      type = 'general';
    }
    if (!ALLOWED_FEEDBACK_TYPES.has(type)) {
      return validationError('type must be one of general, bug, feature, improvement, other');
    }
  }

  return {
    ok: true,
    value: {
      feedback,
      email: email.value,
      unverifiedAccountEmail: accountEmail.value,
      type,
      unverifiedUserId: userId.value,
    },
  };
}

export default async function handler(req, res) {
  applyFeedbackCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const validation = validateFeedbackBody(req.body);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }

    const { feedback, email, unverifiedAccountEmail, type, unverifiedUserId } = validation.value;
    const feedbackLogSummary = getFeedbackLogSummary({
      feedback,
      email,
      unverifiedAccountEmail,
      type,
      unverifiedUserId,
    });

    // Use Resend service
    if (process.env.RESEND_API_KEY) {
      try {
        // Dynamic import for ES module compatibility
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        const feedbackEmailConfig = getFeedbackEmailConfig();
        if (!feedbackEmailConfig.from || feedbackEmailConfig.to.length === 0) {
          console.error('Feedback email configuration missing:', feedbackLogSummary);
          return res.status(500).json({ error: 'Feedback email is not configured' });
        }

        // Create properly formatted feedback email using our template structure
        const feedbackHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Organized Glitter</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    
    body {
      margin: 0;
      padding: 0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: #f8fafc;
      line-height: 1.6;
    }
    
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    
    .header {
      background: linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%);
      padding: 40px 40px 30px;
      text-align: center;
    }
    
    .logo {
      color: white;
      font-size: 28px;
      font-weight: 600;
      margin: 0;
      letter-spacing: -0.5px;
    }
    
    .sparkle {
      display: inline-block;
      margin-left: 8px;
      font-size: 24px;
    }
    
    .content {
      padding: 40px;
      text-align: center;
    }
    
    .title {
      font-size: 24px;
      font-weight: 600;
      color: #1f2937;
      margin: 0 0 16px;
    }
    
    .subtitle {
      font-size: 16px;
      color: #6b7280;
      margin: 0 0 32px;
      line-height: 1.5;
    }
    
    .info-box {
      background-color: #f3f4f6;
      border-radius: 8px;
      padding: 20px;
      margin: 24px 0;
      border-left: 4px solid #8b5cf6;
      text-align: left;
    }
    
    .info-box h3 {
      margin: 0 0 12px 0;
      color: #8b5cf6;
      font-size: 16px;
      font-weight: 500;
    }
    
    .info-box p {
      margin: 0 0 8px 0;
      font-size: 14px;
      color: #4b5563;
    }
    
    .info-box p:last-child {
      margin-bottom: 0;
    }
    
    .security-note {
      background-color: #f3f4f6;
      border-radius: 8px;
      padding: 20px;
      margin: 24px 0;
      border-left: 4px solid #8b5cf6;
    }
    
    .security-note p {
      margin: 0;
      font-size: 14px;
      color: #4b5563;
    }
    
    .footer-text {
      font-size: 14px;
      color: #6b7280;
      line-height: 1.5;
      margin: 0 0 16px;
    }
    
    .footer-link {
      color: #8b5cf6;
      text-decoration: none;
    }
    
    .footer-link:hover {
      text-decoration: underline;
    }
    
    .divider {
      height: 1px;
      background-color: #e5e7eb;
      margin: 32px 0;
    }
  </style>
</head>
<body>
  <div style="padding: 40px 20px;">
    <div class="container">
      <div class="header">
        <h1 class="logo">
          Organized Glitter
          <span class="sparkle">✨</span>
        </h1>
      </div>
      
      <div class="content">
        <h2 class="title">New App Feedback</h2>

        <p class="subtitle">
          You have received new feedback through the Organized Glitter application.
        </p>

        <div class="info-box">
          <h3>Feedback Details</h3>
          <p><strong>Type:</strong> <span style="text-transform: capitalize;">${escapeHtml(type)}</span></p>
          <p><strong>Reply Email:</strong> ${escapeHtml(email || 'Not provided')}</p>
          ${
            unverifiedAccountEmail
              ? `<p><strong>Unverified Account Email (client supplied):</strong> ${escapeHtml(unverifiedAccountEmail)}</p>`
              : ''
          }
          ${
            unverifiedUserId
              ? `<p><strong>Unverified User ID (client supplied):</strong> ${escapeHtml(unverifiedUserId)}</p>`
              : ''
          }
          <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
        </div>

        <div class="security-note">
          <p><strong>Feedback:</strong></p>
          <div style="white-space: pre-wrap; margin-top: 12px; font-style: italic;">${escapeHtml(feedback).replace(/\n/g, '<br>')}</div>
        </div>

        <p class="footer-text">
          This feedback was submitted through the Organized Glitter application.
        </p>
        
        <div class="divider"></div>
        
        <p class="footer-text">
          Questions? Contact us at 
          <a href="mailto:support@organizedglitter.app" class="footer-link">
            support@organizedglitter.app
          </a>
        </p>
        
        <p class="footer-text">
          <a href="https://organizedglitter.com" class="footer-link">Organized Glitter</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;

        const { error } = await resend.emails.send({
          from: feedbackEmailConfig.from,
          to: feedbackEmailConfig.to,
          subject: `New ${type} Feedback - Organized Glitter`,
          html: feedbackHtml,
        });

        if (error) {
          console.error('Resend error:', {
            feedback: feedbackLogSummary,
            error: getErrorLogSummary(error),
          });
          return res.status(500).json({ error: 'Failed to send feedback' });
        }

        return res.status(200).json({ success: true, message: 'Feedback sent successfully' });
      } catch (resendError) {
        console.error('Resend import/execution error:', {
          feedback: feedbackLogSummary,
          error: getErrorLogSummary(resendError),
        });
        return res.status(500).json({ error: 'Unable to send feedback. Please try again later.' });
      }
    }

    console.error('Feedback email configuration missing:', feedbackLogSummary);
    return res.status(500).json({ error: 'Feedback email is not configured' });
  } catch (error) {
    console.error('Error:', getErrorLogSummary(error));
    return res.status(500).json({ error: 'Internal server error' });
  }
}
