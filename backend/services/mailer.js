const nodemailer = require('nodemailer');

let smtpUser = process.env.SMTP_USER || 'trexixplatform@gmail.com';
let smtpPass = process.env.SMTP_PASS || 'bficskhpuxfhusmc';

// Strip double quotes if the user pasted them in .env
if (smtpUser.startsWith('"') && smtpUser.endsWith('"')) {
  smtpUser = smtpUser.slice(1, -1);
}
if (smtpPass.startsWith('"') && smtpPass.endsWith('"')) {
  smtpPass = smtpPass.slice(1, -1);
}

const smtpPort = parseInt(process.env.SMTP_PORT) || 465;
// secure is true for port 465, false for 587/25
const isSecure = process.env.SMTP_SECURE !== undefined ? process.env.SMTP_SECURE === 'true' : (smtpPort === 465);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: smtpPort,
  secure: isSecure,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
  tls: {
    rejectUnauthorized: false // Bypass SSL verification issues on some hostings
  }
});

async function sendOtpEmail(toEmail, otpCode) {
  try {
    const info = await transporter.sendMail({
      from: `"Support Team" <${process.env.SMTP_USER}>`, // sender address
      to: toEmail, // list of receivers
      subject: "Your Verification Code", // Subject line
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
          <h2 style="color: #333; text-align: center;">Verification Code</h2>
          <p style="color: #555; font-size: 16px;">Hello,</p>
          <p style="color: #555; font-size: 16px;">Please use the following OTP code to verify your account or complete your sign-up process. This code will expire in 10 minutes.</p>
          <div style="background-color: #f4f4f4; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0;">
            <span style="font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #000;">${otpCode}</span>
          </div>
          <p style="color: #555; font-size: 14px;">If you did not request this, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #999; font-size: 12px; text-align: center;">&copy; ${new Date().getFullYear()} Your Company Name. All rights reserved.</p>
        </div>
      `,
    });
    console.log("Message sent: %s", info.messageId);
    return { success: true };
  } catch (error) {
    console.error("Error sending email: ", error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendOtpEmail
};
