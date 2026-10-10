import nodemailer from "nodemailer";
import {
      GMAIL_USER,
      GMAIL_APP_PASSWORD,
      EMAIL_FROM_NAME,
} from "../config/envConfig.js";

/**
 * Checks if valid Gmail credentials have been configured.
 * @returns {boolean}
 */
export const isGmailConfigured = () => {
      return Boolean(
            GMAIL_USER &&
            GMAIL_APP_PASSWORD &&
            GMAIL_USER !== "your_email@gmail.com" &&
            GMAIL_APP_PASSWORD !== "your_16_digit_app_password"
      );
};

/**
 * Creates and configures a nodemailer transporter using Gmail SMTP.
 */
const createTransporter = () => {
      return nodemailer.createTransport({
            service: "gmail",
            auth: {
                  user: GMAIL_USER,
                  pass: GMAIL_APP_PASSWORD,
            },
      });
};

export const gmailTransporter = createTransporter();

/**
 * Verifies the connection to Gmail SMTP.
 * @returns {Promise<boolean>}
 */
export const verifyGmailConnection = async () => {
      if (!isGmailConfigured()) {
            console.warn(
                  "[Gmail] Credentials not configured. Please set GMAIL_USER and GMAIL_APP_PASSWORD in your .env file."
            );
            return false;
      }

      try {
            await gmailTransporter.verify();
            console.log("[Gmail] SMTP connection verified successfully.");
            return true;
      } catch (error) {
            console.error("[Gmail] SMTP verification failed:", error.message);
            return false;
      }
};

/**
 * Generates an email template optimized for high deliverability (inbox placement).
 * Uses inline CSS and table layout to prevent spam filter triggers.
 * 
 * @param {Object} options
 * @param {string} options.otp - The one-time password.
 * @param {string} [options.purpose="Verification"] - Purpose of OTP.
 * @param {number} [options.expiryMinutes=10] - Validity duration in minutes.
 * @param {string} [options.appName] - Application name.
 * @returns {{ html: string, text: string }}
 */
export const getOtpEmailTemplate = ({
      otp,
      purpose = "Verification",
      expiryMinutes = 10,
      appName = EMAIL_FROM_NAME || "SafaiWatch",
}) => {
      const text = `SafaiWatch Verification Code\n\nHello,\n\nYour one-time verification code for ${purpose} is:\n\n${otp}\n\nThis code will expire in ${expiryMinutes} minutes.\n\nIf you did not request this verification code, please ignore this email.\n\nThank you,\n${appName} Team`;

      const html = `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>${appName} Verification Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f7fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #2d3748;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f7fafc; padding: 30px 10px;">
            <tr>
                  <td align="center">
                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden;">
                              <!-- Header -->
                              <tr>
                                    <td align="center" style="background-color: #059669; padding: 24px 20px;">
                                          <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">${appName}</h1>
                                          <p style="margin: 4px 0 0 0; color: #d1fae5; font-size: 13px; font-weight: 500;">${purpose} Code</p>
                                    </td>
                              </tr>
                              <!-- Body -->
                              <tr>
                                    <td style="padding: 28px 24px;">
                                          <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.5; color: #374151;">Hello,</p>
                                          <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.5; color: #4b5563;">
                                                Use the verification code below to complete your <strong>${purpose.toLowerCase()}</strong> on <strong>${appName}</strong>:
                                          </p>
                                          
                                          <!-- OTP Code Box -->
                                          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0;">
                                                <tr>
                                                      <td align="center" style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 18px 12px;">
                                                            <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #047857;">${otp}</span>
                                                            <div style="margin-top: 8px; font-size: 12px; color: #059669; font-weight: 500;">
                                                                  Valid for ${expiryMinutes} minutes
                                                            </div>
                                                      </td>
                                                </tr>
                                          </table>

                                          <p style="margin: 20px 0 0 0; font-size: 13px; line-height: 1.5; color: #6b7280;">
                                                For your security, never share this code with anyone. If you didn't make this request, you can safely ignore this email.
                                          </p>
                                    </td>
                              </tr>
                              <!-- Footer -->
                              <tr>
                                    <td align="center" style="background-color: #f9fafb; padding: 16px 20px; border-top: 1px solid #f3f4f6; font-size: 12px; color: #9ca3af;">
                                          <p style="margin: 0;">&copy; ${new Date().getFullYear()} ${appName}. Automated notification.</p>
                                    </td>
                              </tr>
                        </table>
                  </td>
            </tr>
      </table>
</body>
</html>
      `.trim();

      return { html, text };
};

/**
 * Generic mail sender utility using Gmail transporter.
 * @param {Object} options
 * @param {string|string[]} options.to - Recipient email address(es).
 * @param {string} options.subject - Email subject.
 * @param {string} [options.html] - HTML content.
 * @param {string} [options.text] - Plain text fallback.
 * @param {string} [options.from] - Custom from sender header.
 * @returns {Promise<Object>}
 */
export const sendEmail = async ({ to, subject, html, text, from }) => {
      const sender = from || `"${EMAIL_FROM_NAME || "SafaiWatch"}" <${GMAIL_USER}>`;
      const recipients = Array.isArray(to) ? to.join(", ") : to;

      if (!isGmailConfigured()) {
            console.warn(
                  `[Gmail - Simulation Mode] Gmail credentials not configured in .env. Skipping SMTP send.`
            );
            console.log(`[Gmail - Simulated Email] To: ${recipients} | Subject: ${subject}`);
            return {
                  success: true,
                  simulated: true,
                  messageId: `simulated-${Date.now()}`,
            };
      }

      const mailOptions = {
            from: sender,
            replyTo: GMAIL_USER,
            to: recipients,
            subject,
            text,
            html,
            headers: {
                  "X-Priority": "1",
                  "X-MSMail-Priority": "High",
                  "Importance": "high",
            },
      };

      try {
            const info = await gmailTransporter.sendMail(mailOptions);
            console.log(`[Gmail] Email successfully sent to ${recipients} (MessageId: ${info.messageId})`);
            return {
                  success: true,
                  messageId: info.messageId,
                  response: info.response,
            };
      } catch (error) {
            console.error(`[Gmail] Failed to send email to ${recipients}:`, error.message);
            throw new Error(`Email sending failed: ${error.message}`);
      }
};

/**
 * Sends an OTP email to the specified recipient using Gmail.
 * Formulates the subject line and headers to maximize inbox deliverability.
 * 
 * @param {Object} options
 * @param {string} options.to - Recipient's email address.
 * @param {string|number} options.otp - The OTP code to be sent.
 * @param {string} [options.purpose="Verification"] - Purpose of OTP (e.g. "Sign Up", "Sign In").
 * @param {number} [options.expiryMinutes=10] - Validity of the OTP in minutes.
 * @param {string} [options.subject] - Optional custom subject line.
 * @returns {Promise<{ success: boolean, messageId: string, simulated?: boolean }>}
 */
export const sendOtpMail = async ({
      to,
      otp,
      purpose = "Verification",
      expiryMinutes = 10,
      subject,
}) => {
      if (!to || !otp) {
            throw new Error("Recipient email ('to') and 'otp' are required to send OTP email.");
      }

      const appName = EMAIL_FROM_NAME || "SafaiWatch";
      // Deliverability-friendly subject line: avoid leading random numbers that trigger spam filters
      const emailSubject = subject || `[${appName}] Your ${purpose} verification code is ${otp}`;

      const { html, text } = getOtpEmailTemplate({
            otp: String(otp),
            purpose,
            expiryMinutes,
            appName,
      });

      return await sendEmail({
            to,
            subject: emailSubject,
            html,
            text,
      });
};
