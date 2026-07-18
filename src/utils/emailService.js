const nodemailer = require("nodemailer");

/**
 * Nodemailer transporter configured for Brevo SMTP.
 * Credentials are pulled from environment variables defined in .env.
 */
const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false, // TLS via STARTTLS
  auth: {
    user: process.env.BREVO_SMTP_LOGIN, // Brevo SMTP login (smtpuser-XXXX@smtp-brevo.com), NOT the sender email
    pass: process.env.BREVO_API_KEY,
  },
});

/**
 * Generic email sending helper.
 *
 * @param {object} options
 * @param {string}   options.to       - Recipient email address
 * @param {string}   options.subject  - Email subject line
 * @param {string}   options.html     - HTML body content
 * @param {string}   [options.text]   - Plain-text fallback (auto-derived if omitted)
 * @returns {Promise<object>} Nodemailer send result
 */
const sendEmail = async ({ to, subject, html, text }) => {
  const mailOptions = {
    from: `"${process.env.BREVO_SENDER_NAME || "Eduvantix"}" <${process.env.BREVO_SENDER_EMAIL}>`,
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]+>/g, ""), // strip HTML tags for plain-text fallback
  };

  const result = await transporter.sendMail(mailOptions);
  return result;
};

module.exports = { sendEmail, transporter };
