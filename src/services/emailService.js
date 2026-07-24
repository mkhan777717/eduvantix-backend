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
  const senderName = process.env.BREVO_SENDER_NAME || 'Eduvantix';

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
        <p>We received a request to reset the password for your account at Eduvantix. Click the button below to set a new password:</p>
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
    subject: 'Reset Your Password - Eduvantix',
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
        <p>This is a confirmation that the password for your Eduvantix account was successfully updated.</p>
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
    subject: 'Password Reset Successful - Eduvantix',
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

/**
 * Sends a notification email via SMTP (Nodemailer) for new Pro Early Access requests.
 */
const sendProEarlyAccessEmail = async ({ name, email, phone, description }) => {
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
      <title>New Pro Access Request</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; }
        .header { border-bottom: 2px solid #3b82f6; padding-bottom: 15px; margin-bottom: 20px; }
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
          <h2 style="margin: 0; color: #0f172a;">New Pro Early Access Request</h2>
        </div>
        <div class="field" style="margin-top: 15px;">
          <span class="label">Name:</span> <span class="value">${name}</span>
        </div>
        <div class="field">
          <span class="label">Email:</span> <span class="value"><a href="mailto:${email}">${email}</a></span>
        </div>
        <div class="field">
          <span class="label">Mobile Number:</span> <span class="value">${phone}</span>
        </div>
        ${description ? `
        <div class="field" style="margin-top: 20px;">
          <div class="label">Access Description:</div>
          <div class="message-box">${description.replace(/\n/g, '<br>')}</div>
        </div>
        ` : ''}
        <div class="footer">
          <p>Eduvantix Pro Access Notification System</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: `"Eduvantix Pro Access" <${user}>`,
      to: adminEmail,
      subject: `🚀 New Pro Early Access Request: ${name}`,
      html: htmlContent,
    });
    console.log(`SMTP Notification sent successfully to ${adminEmail}`);
    return true;
  } catch (error) {
    console.error('Failed to send email via SMTP:', error.message);
    return false;
  }
};

/**
 * Helper to get a configured Nodemailer SMTP Transporter (Gmail SMTP)
 */
const getSmtpTransporter = () => {
  const nodemailer = require('nodemailer');
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    console.error('Warning: SMTP credentials (SMTP_USER/SMTP_PASS) are not defined. Email skipped.');
    return null;
  }

  return {
    transporter: nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    }),
    user,
  };
};

const SUPER_ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || 'datamindxacademy@gmail.com';

/**
 * 1. Admin Notification: New Job Application Submitted (Step 1)
 */
const sendJobAppAdminNotification = async ({ candidateName, email, mobile, jobType, jobRole }) => {
  const smtp = getSmtpTransporter();
  if (!smtp) return false;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>New Job Assistance Application</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 20px; }
        .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
        .header { background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%); color: #ffffff; padding: 24px; text-align: center; }
        .body { padding: 28px; }
        .field-box { background: #f1f5f9; padding: 14px 18px; border-radius: 10px; margin-bottom: 12px; font-size: 14px; }
        .label { font-weight: 700; color: #475569; display: inline-block; width: 140px; }
        .value { color: #0f172a; font-weight: 600; }
        .footer { text-align: center; font-size: 12px; color: #94a3b8; padding: 18px; border-top: 1px solid #f1f5f9; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h2 style="margin:0; font-size: 20px;">🚨 New Job Assistance Application</h2>
        </div>
        <div class="body">
          <p>A new student has submitted their application for Job Assistance. Please review their profile on the Super Admin Portal.</p>
          <div class="field-box"><span class="label">Candidate Name:</span> <span class="value">${candidateName}</span></div>
          <div class="field-box"><span class="label">Email:</span> <span class="value"><a href="mailto:${email}">${email}</a></span></div>
          <div class="field-box"><span class="label">Mobile:</span> <span class="value">${mobile}</span></div>
          <div class="field-box"><span class="label">Job Type:</span> <span class="value">${jobType}</span></div>
          <div class="field-box"><span class="label">Job Role:</span> <span class="value">${jobRole}</span></div>
          <p style="margin-top: 24px; text-align: center;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/job-assistance" style="background: #4f46e5; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">Open Admin Portal</a>
          </p>
        </div>
        <div class="footer">Eduvantix Job Assistance Automated Alert</div>
      </div>
    </body>
    </html>
  `;

  try {
    await smtp.transporter.sendMail({
      from: `"Eduvantix Portal" <${smtp.user}>`,
      to: SUPER_ADMIN_EMAIL,
      subject: `💼 New Job Assistance Application: ${candidateName}`,
      html: htmlContent,
    });
    console.log(`[JobAssistance] Admin alert sent to ${SUPER_ADMIN_EMAIL}`);
    return true;
  } catch (err) {
    console.error('[JobAssistance] Failed to send admin alert email:', err.message);
    return false;
  }
};

/**
 * 2. Admin Notification: Interview Slot Submitted (Step 3)
 */
const sendJobSlotAdminNotification = async ({ candidateName, email, preferredSlot }) => {
  const smtp = getSmtpTransporter();
  if (!smtp) return false;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Interview Slot Selected</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 20px; }
        .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
        .header { background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: #ffffff; padding: 24px; text-align: center; }
        .body { padding: 28px; }
        .field-box { background: #f1f5f9; padding: 14px 18px; border-radius: 10px; margin-bottom: 12px; font-size: 14px; }
        .label { font-weight: 700; color: #475569; display: inline-block; width: 140px; }
        .value { color: #0f172a; font-weight: 600; }
        .footer { text-align: center; font-size: 12px; color: #94a3b8; padding: 18px; border-top: 1px solid #f1f5f9; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h2 style="margin:0; font-size: 20px;">📅 Interview Slot Selected by Student</h2>
        </div>
        <div class="body">
          <p>Candidate <strong>${candidateName}</strong> has submitted an interview slot preference. Please confirm or edit the slot and assign a mentor in the portal.</p>
          <div class="field-box"><span class="label">Candidate Name:</span> <span class="value">${candidateName}</span></div>
          <div class="field-box"><span class="label">Email:</span> <span class="value">${email}</span></div>
          <div class="field-box"><span class="label">Selected Slot:</span> <span class="value" style="color: #059669;">${preferredSlot}</span></div>
          <p style="margin-top: 24px; text-align: center;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/job-assistance" style="background: #059669; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">Review & Confirm Slot</a>
          </p>
        </div>
        <div class="footer">Eduvantix Job Assistance Automated Alert</div>
      </div>
    </body>
    </html>
  `;

  try {
    await smtp.transporter.sendMail({
      from: `"Eduvantix Portal" <${smtp.user}>`,
      to: SUPER_ADMIN_EMAIL,
      subject: `📅 Interview Slot Requested: ${candidateName} (${preferredSlot})`,
      html: htmlContent,
    });
    console.log(`[JobAssistance] Admin slot alert sent to ${SUPER_ADMIN_EMAIL}`);
    return true;
  } catch (err) {
    console.error('[JobAssistance] Failed to send admin slot alert email:', err.message);
    return false;
  }
};

/**
 * 3. Student Notification: Application Approved or Rejected (Step 2)
 */
const sendJobAppStatusStudentNotification = async ({ candidateName, email, status, adminNote }) => {
  const smtp = getSmtpTransporter();
  if (!smtp) return false;

  if (!email || typeof email !== 'string' || !email.trim()) {
    console.error('[JobAssistance] Cannot send status email to student: Candidate email is missing or empty.', { candidateName, email });
    return false;
  }

  const isApproved = status === 'APPROVED';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Job Assistance Application Status</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 20px; }
        .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; }
        .header { background: ${isApproved ? '#059669' : '#dc2626'}; color: #ffffff; padding: 24px; text-align: center; }
        .body { padding: 28px; }
        .note-box { background: #f8fafc; border-left: 4px solid ${isApproved ? '#059669' : '#dc2626'}; padding: 12px 16px; margin: 16px 0; border-radius: 4px; }
        .footer { text-align: center; font-size: 12px; color: #94a3b8; padding: 18px; border-top: 1px solid #f1f5f9; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h2 style="margin:0; font-size: 20px;">${isApproved ? '🎉 Application Approved!' : 'Application Update'}</h2>
        </div>
        <div class="body">
          <p>Hi <strong>${candidateName}</strong>,</p>
          ${isApproved ? `
            <p>Great news! Your Job Assistance application has been reviewed and <strong>APPROVED</strong> by our team.</p>
            <p>Please log in to your student portal now to select your preferred 1-on-1 interview training slot.</p>
            <p style="text-align: center; margin-top: 24px;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/student/job-assistance" style="background: #059669; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">Select Interview Slot</a>
            </p>
          ` : `
            <p>Thank you for submitting your application for Job Assistance.</p>
            <p>After reviewing your current profile, our team was unable to approve your application at this stage.</p>
            ${adminNote ? `<div class="note-box"><strong>Reviewer Note:</strong> ${adminNote}</div>` : ''}
            <p>Please use our practice tools and viva modules to improve your preparation. You will be eligible to re-apply after 48 hours.</p>
          `}
        </div>
        <div class="footer">Eduvantix Job Assistance Team</div>
      </div>
    </body>
    </html>
  `;

  try {
    console.log(`[JobAssistance] Sending status email to student: ${email.trim()}`);
    await smtp.transporter.sendMail({
      from: `"Eduvantix Job Assistance" <${smtp.user}>`,
      to: email.trim(),
      subject: isApproved ? '🎉 Application Approved - Select Your Interview Slot' : 'Job Assistance Application Update',
      html: htmlContent,
    });
    console.log(`[JobAssistance] Student status email successfully sent to ${email.trim()}`);
    return true;
  } catch (err) {
    console.error('[JobAssistance] Failed to send student status email:', err.message);
    return false;
  }
};

/**
 * 4. Student Notification: Slot Confirmed or Rejected (Step 3)
 */
const sendJobSlotStudentNotification = async ({ candidateName, email, action, confirmedSlot, interviewerName, interviewerEmail, adminNote }) => {
  const smtp = getSmtpTransporter();
  if (!smtp) return false;

  if (!email || typeof email !== 'string' || !email.trim()) {
    console.error('[JobAssistance] Cannot send slot email to student: Candidate email is missing or empty.', { candidateName, email });
    return false;
  }

  const isConfirmed = action === 'APPROVE';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Interview Slot Update</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 20px; }
        .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; }
        .header { background: ${isConfirmed ? '#2563eb' : '#dc2626'}; color: #ffffff; padding: 24px; text-align: center; }
        .body { padding: 28px; }
        .box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 16px; margin: 16px 0; }
        .footer { text-align: center; font-size: 12px; color: #94a3b8; padding: 18px; border-top: 1px solid #f1f5f9; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h2 style="margin:0; font-size: 20px;">${isConfirmed ? '🗓️ Interview Slot Confirmed' : 'Interview Slot Update'}</h2>
        </div>
        <div class="body">
          <p>Hi <strong>${candidateName}</strong>,</p>
          ${isConfirmed ? `
            <p>Your interview training session has been scheduled!</p>
            <div class="box">
              <p style="margin: 4px 0;"><strong>Confirmed Slot:</strong> ${confirmedSlot}</p>
              ${interviewerName ? `<p style="margin: 4px 0;"><strong>Interviewer/Mentor:</strong> ${interviewerName}</p>` : ''}
              ${interviewerEmail ? `<p style="margin: 4px 0;"><strong>Interviewer Email:</strong> ${interviewerEmail}</p>` : ''}
            </div>
            <p>Please check your inbox or wait for a calendar invite from your assigned mentor prior to the slot time.</p>
          ` : `
            <p>Unfortunately, your requested interview slot was not available.</p>
            ${adminNote ? `<p><strong>Note:</strong> ${adminNote}</p>` : ''}
            <p>Please log in to your portal to pick a different upcoming time slot.</p>
          `}
        </div>
        <div class="footer">Eduvantix Job Assistance Team</div>
      </div>
    </body>
    </html>
  `;

  try {
    console.log(`[JobAssistance] Sending slot review email to student: ${email.trim()}`);
    await smtp.transporter.sendMail({
      from: `"Eduvantix Job Assistance" <${smtp.user}>`,
      to: email.trim(),
      subject: isConfirmed ? `🗓️ Interview Slot Confirmed: ${confirmedSlot}` : 'Interview Slot Unavailable - Please Reschedule',
      html: htmlContent,
    });
    console.log(`[JobAssistance] Student slot review email successfully sent to ${email.trim()}`);
    return true;
  } catch (err) {
    console.error('[JobAssistance] Failed to send slot student email:', err.message);
    return false;
  }
};

/**
 * 5. Student Notification: Mentor Feedback Received (Step 4)
 */
const sendJobFeedbackStudentNotification = async ({ candidateName, email, feedback, rating }) => {
  const smtp = getSmtpTransporter();
  if (!smtp) return false;

  if (!email || typeof email !== 'string' || !email.trim()) {
    console.error('[JobAssistance] Cannot send feedback email to student: Candidate email is missing or empty.', { candidateName, email });
    return false;
  }

  const isPerfect = rating === 'PERFECT';
  const isNeedsImp = rating === 'NEEDS_IMPROVEMENT';

  const subject = isPerfect
    ? '🎉 Great News! Interview Cleared - Job Assistance'
    : '💪 Mentor Feedback & Next Steps - Job Assistance';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${subject}</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 20px; }
        .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
        .header { background: ${isPerfect ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)' : 'linear-gradient(135deg, #475569 0%, #64748b 100%)'}; color: #ffffff; padding: 28px 24px; text-align: center; }
        .body { padding: 28px; }
        .feedback-box { background: #f8fafc; border-left: 4px solid ${isPerfect ? '#10b981' : isNeedsImp ? '#f59e0b' : '#ef4444'}; padding: 18px; border-radius: 8px; margin: 20px 0; }
        .footer { text-align: center; font-size: 12px; color: #94a3b8; padding: 20px; border-top: 1px solid #f1f5f9; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h2 style="margin:0; font-size: 22px;">${isPerfect ? '🎉 Interview Cleared!' : '📝 Mentor Interview Feedback'}</h2>
          <p style="margin: 6px 0 0 0; opacity: 0.9; font-size: 14px;">Eduvantix Job Assistance Program</p>
        </div>
        <div class="body">
          <p>Hi <strong>${candidateName}</strong>,</p>
          <p>Thank you for taking part in your interview training session! We truly appreciate your time, effort, and commitment toward your career growth.</p>
          
          <div class="feedback-box">
            <p style="margin-top: 0; font-weight: 700; color: #334155; font-size: 14px;">
              Evaluation Result: <span style="color: ${isPerfect ? '#059669' : isNeedsImp ? '#d97706' : '#dc2626'}; text-transform: uppercase;">${rating.replace('_', ' ')}</span>
            </p>
            <p style="white-space: pre-wrap; margin-bottom: 0; color: #1e293b; font-size: 14px; line-height: 1.6;">${feedback}</p>
          </div>

          ${isPerfect ? `
            <div style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 18px; border-radius: 12px; margin-top: 20px;">
              <p style="color: #047857; font-weight: bold; margin: 0 0 6px 0; font-size: 15px;">🚀 Profile Forwarded to Recruiters</p>
              <p style="color: #065f46; margin: 0; font-size: 14px;">Your performance has been verified! Your profile and resume will now be actively forwarded to our partner hiring managers and recruiters. All the very best!</p>
            </div>
          ` : `
            <div style="background: #fffbebf7; border: 1px solid #fef3c7; padding: 18px; border-radius: 12px; margin-top: 20px;">
              <p style="color: #92400e; font-weight: bold; margin: 0 0 8px 0; font-size: 15px;">💪 What's Next & Next Steps</p>
              <p style="color: #78350f; margin: 0 0 10px 0; font-size: 14px;">Please review your mentor's notes carefully and focus on improving the suggested areas. We encourage you to use our <strong>AI Viva Practice</strong>, <strong>Coding Problems</strong>, and <strong>Mock Exams</strong> to sharpen your skills.</p>
              <p style="color: #92400e; margin: 0 0 12px 0; font-size: 14px;"><strong>⏳ Re-application Cooldown:</strong> You will be eligible to re-apply for Job Assistance after <strong>48 hours</strong>.</p>
              <p style="color: #78350f; margin: 0; font-size: 14px;">Don't be discouraged — every interview is a step closer to success. We appreciate your dedication and wish you all the very best with your preparation!</p>
            </div>
          `}
        </div>
        <div class="footer">Eduvantix Team — Empowering Your Career Journey</div>
      </div>
    </body>
    </html>
  `;

  try {
    console.log(`[JobAssistance] Sending feedback email to student: ${email.trim()}`);
    await smtp.transporter.sendMail({
      from: `"Eduvantix Job Assistance" <${smtp.user}>`,
      to: email.trim(),
      subject,
      html: htmlContent,
    });
    console.log(`[JobAssistance] Student feedback email successfully sent to ${email.trim()}`);
    return true;
  } catch (err) {
    console.error('[JobAssistance] Failed to send feedback student email:', err.message);
    return false;
  }
};

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendResetSuccessEmail,
  sendPartnerRequestEmail,
  sendProEarlyAccessEmail,
  sendJobAppAdminNotification,
  sendJobSlotAdminNotification,
  sendJobAppStatusStudentNotification,
  sendJobSlotStudentNotification,
  sendJobFeedbackStudentNotification,
};

