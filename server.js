const express = require('express');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const LOG_FILE = path.join(__dirname, 'visitors.log');

// Setup standard middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Trust proxy header in case the application is placed behind Nginx/Apache on Ubuntu
app.set('trust proxy', true);

// Utility to generate formatted, localized timestamp
function getTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Utility to safely extract client IP address
function getClientIp(req) {
  // If behind Nginx, x-forwarded-for might contain multiple IPs (client, proxies). Take the first.
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'Unknown IP';
}

// Helper to write to visitors.log in real-time
function writeLog(type, ip, details) {
  const timestamp = getTimestamp();
  const logEntry = `[${timestamp}] ${type.toUpperCase()} | IP: ${ip} | ${details}\n`;
  
  // Console logging for standard process out
  console.log(logEntry.trim());
  
  fs.appendFile(LOG_FILE, logEntry, (err) => {
    if (err) {
      console.error(`[${timestamp}] ERROR | Failed to write log to file: ${err.message}`);
    }
  });
}

// Intercept main page hits to log visitor views
app.get('/', (req, res, next) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || 'Unknown Agent';
  writeLog('VISIT', ip, `Page hit - UserAgent: ${userAgent}`);
  next();
});

app.get('/index.html', (req, res, next) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || 'Unknown Agent';
  writeLog('VISIT', ip, `Page hit (index.html) - UserAgent: ${userAgent}`);
  next();
});

// Endpoint to handle visitor registration submissions
app.post('/api/register', async (req, res) => {
  const { name, phone, email } = req.body;
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || 'Unknown Agent';

  // Server-side validation
  if (!name || !phone || !email) {
    writeLog('WARN', ip, `Failed registration attempt - Missing fields`);
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  // Log successful registration details
  const details = `Name: ${name} | Phone: ${phone} | Email: ${email} | Device: ${userAgent}`;
  writeLog('REGISTER', ip, details);

  // Attempt to email notification
  const emailTo = process.env.EMAIL_TO || 'lakshmanvamsi008@gmail.com';
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (smtpHost && smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });

      const mailOptions = {
        from: `"Portfolio Monitor" <${smtpUser}>`,
        to: emailTo,
        subject: `★ Portfolio Visitor: ${name}`,
        text: `New Portfolio Visitor Registered!\n\nDetails:\n-----------------\nName: ${name}\nPhone: ${phone}\nEmail: ${email}\nIP Addr: ${ip}\nTime: ${getTimestamp()}\nDevice: ${userAgent}\n`,
        html: `
          <div style="font-family: monospace; background-color: #050505; color: #f5f5f5; padding: 20px; border: 1px solid #ef4444; border-radius: 8px; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #ef4444; border-bottom: 1px solid #ef4444; padding-bottom: 10px; margin-top: 0;">★ New Visitor Registered</h2>
            <p style="margin: 15px 0;">A visitor has unlocked your portfolio page.</p>
            <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
              <tr style="border-bottom: 1px solid #1a1a1a;">
                <td style="padding: 8px 0; font-weight: bold; color: #ef4444; width: 120px;">Name:</td>
                <td style="padding: 8px 0;">${name}</td>
              </tr>
              <tr style="border-bottom: 1px solid #1a1a1a;">
                <td style="padding: 8px 0; font-weight: bold; color: #ef4444;">Phone:</td>
                <td style="padding: 8px 0;"><a href="tel:${phone}" style="color: #ef4444; text-decoration: none;">${phone}</a></td>
              </tr>
              <tr style="border-bottom: 1px solid #1a1a1a;">
                <td style="padding: 8px 0; font-weight: bold; color: #ef4444;">Email:</td>
                <td style="padding: 8px 0;"><a href="mailto:${email}" style="color: #ef4444; text-decoration: none;">${email}</a></td>
              </tr>
              <tr style="border-bottom: 1px solid #1a1a1a;">
                <td style="padding: 8px 0; font-weight: bold; color: #ef4444;">IP Address:</td>
                <td style="padding: 8px 0;">${ip}</td>
              </tr>
              <tr style="border-bottom: 1px solid #1a1a1a;">
                <td style="padding: 8px 0; font-weight: bold; color: #ef4444;">Time:</td>
                <td style="padding: 8px 0;">${getTimestamp()}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #ef4444; vertical-align: top;">Device Info:</td>
                <td style="padding: 8px 0; font-size: 0.85em; line-height: 1.4; color: #888888;">${userAgent}</td>
              </tr>
            </table>
            <div style="margin-top: 20px; border-top: 1px solid #1a1a1a; padding-top: 15px; text-align: center; font-size: 0.8em; color: #888888;">
              Sent automatically from your portfolio server
            </div>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      writeLog('SUCCESS', ip, `Notification email dispatched to ${emailTo}`);
    } catch (err) {
      writeLog('ERROR', ip, `Failed to send email alert: ${err.message}`);
      // Fall through so front-end succeeds even if SMTP fails
    }
  } else {
    // If SMTP details are empty, log that we are skipping but proceed with success
    writeLog('WARN', ip, `SMTP credentials not configured. Skipping email dispatch to ${emailTo}`);
  }

  // Send positive response to front-end to unlock the site
  return res.status(200).json({ success: true, message: 'Registration logged successfully' });
});

// Serve static assets (index.html, style.css, etc.)
app.use(express.static(path.join(__dirname)));

// Catch-all route to serve the main HTML file
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` PORTFOLIO SERVER ACTIVE AND LISTENING ON PORT ${PORT}`);
  console.log(` Real-time logs writing to: ${LOG_FILE}`);
  console.log(`=======================================================`);
});
