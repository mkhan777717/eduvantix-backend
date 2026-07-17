/**
 * Email Service utilizing the Brevo (formerly Sendinblue) REST API.
 * Integrates forgot password and success notification emails.
 */

/**
 * Sends a transactional email using Brevo's HTTP API.
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.toName - Recipient display name
 * @param {string} options.subject - Email subject line
 * @param {string} options.htmlContent - HTML body content
 */
const sendEmail = async ({ to, toName, subject, htmlContent }) => {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || 'DMX Academy';

  if (!apiKey) {
    console.error('Warning: BREVO_API_KEY is not defined in environment variables. Email will not be sent.');
    return false;
  }

  if (!senderEmail) {
    console.error('Warning: BREVO_SENDER_EMAIL is not defined in environment variables. Email will not be sent.');
    return false;
  }

  const payload = {
    sender: {
      name: senderName,
      email: senderEmail,
    },
    to: [
      {
        email: to,
        name: toName || to.split('@')[0],
      },
    ],
    subject: subject,
    htmlContent: htmlContent,
  };

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Brevo API responded with status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log(`Email sent successfully via Brevo. Message ID: ${data.messageId}`);
    return true;
  } catch (error) {
    console.error('Failed to send email via Brevo:', error.message);
    return false;
  }
};

/**
 * Sends a password reset request email containing the token link.
 * @param {string} email - Recipient email
 * @param {string} username - Recipient username
 * @param {string} resetToken - Secure token for path parameter
 */
const sendPasswordResetEmail = async (email, username, resetToken) => {
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  const resetLink = `${frontendUrl}/reset-password/${resetToken}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Reset Your Password</title>
      <style>
        body { font-family: sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px; }
        .button { display: inline-block; padding: 10px 20px; margin: 20px 0; background-color: #0070f3; color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold; }
        .footer { font-size: 12px; color: #666; margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>Password Reset Request</h2>
        <p>Hello ${username},</p>
        <p>We received a request to reset the password for your account at DMX Academy. Click the button below to set a new password:</p>
        <p>
          <a class="button" href="${resetLink}" target="_blank" style="color: #ffffff;">Reset Password</a>
        </p>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        <p>This password reset link is valid for 1 hour. If you did not request a password reset, you can safely ignore this email.</p>
        <div class="footer">
          <p>This is an automated email, please do not reply.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    toName: username,
    subject: 'Reset Your Password - DMX Academy',
    htmlContent: htmlContent,
  });
};

/**
 * Sends a confirmation email after successful password reset.
 * @param {string} email - Recipient email
 * @param {string} username - Recipient username
 */
const sendResetSuccessEmail = async (email, username) => {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Password Reset Successful</title>
      <style>
        body { font-family: sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px; }
        .footer { font-size: 12px; color: #666; margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>Password Reset Successful</h2>
        <p>Hello ${username},</p>
        <p>This is a confirmation that the password for your DMX Academy account was successfully updated.</p>
        <p>If you did not perform this action, please contact support immediately.</p>
        <div class="footer">
          <p>This is an automated email, please do not reply.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    toName: username,
    subject: 'Password Reset Successful - DMX Academy',
    htmlContent: htmlContent,
  });
};

/**
 * Sends a notification email via SMTP (Nodemailer) for new campus partner requests.
 */
const sendPartnerRequestEmail = async ({ fullName, university, email, phone, message }) => {
  const nodemailer = require('nodemailer');
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || user;

  if (!user || !pass) {
    console.error('Warning: SMTP credentials (SMTP_USER/SMTP_PASS) are not defined in environment variables. Email will not be sent.');
    return false;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for 465, false for 587
    auth: {
      user,
      pass,
    },
  });

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>New Institute Access Request</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; }
        .header { border-bottom: 2px solid #10b981; padding-bottom: 15px; margin-bottom: 20px; }
        .field { margin-bottom: 12px; }
        .label { font-weight: bold; color: #4a5568; }
        .value { color: #1a202c; }
        .message-box { padding: 15px; background-color: #f7fafc; border-left: 4px solid #cbd5e0; border-radius: 4px; margin-top: 15px; }
        .footer { font-size: 11px; color: #718096; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2 style="margin: 0; color: #0f172a;">New Campus Partnership Request</h2>
        </div>
        <div class="field" style="margin-top: 15px;">
          <span class="label">Full Name:</span> <span class="value">${fullName}</span>
        </div>
        <div class="field">
          <span class="label">University / Institute:</span> <span class="value">${university}</span>
        </div>
        <div class="field">
          <span class="label">Work Email:</span> <span class="value"><a href="mailto:${email}">${email}</a></span>
        </div>
        <div class="field">
          <span class="label">Phone Number:</span> <span class="value">${phone || 'Not provided'}</span>
        </div>
        ${message ? `
        <div class="field" style="margin-top: 20px;">
          <div class="label">Message:</div>
          <div class="message-box">${message.replace(/\n/g, '<br>')}</div>
        </div>
        ` : ''}
        <div class="footer">
          <p>Eduvantix Campus Notification System</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: `"Eduvantix Notification" <${user}>`,
      to: adminEmail,
      subject: `🚨 New Campus Partner Request: ${university}`,
      html: htmlContent,
    });
    console.log(`SMTP Notification sent successfully to ${adminEmail}`);
    return true;
  } catch (error) {
    console.error('Failed to send email via SMTP:', error.message);
    return false;
  }
};

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendResetSuccessEmail,
  sendPartnerRequestEmail,
};
