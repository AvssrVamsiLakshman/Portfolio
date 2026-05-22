const express = require('express');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const LOG_FILE = path.join(__dirname, 'visitors.log');

// Active sessions registry (sessionId -> sessionDetails)
const sessions = new Map();

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

// Lightweight endpoint for server auto-discovery ping
app.get('/api/ping', (req, res) => {
  return res.json({ success: true, message: 'pong' });
});

// Endpoint to receive client page visits (especially for remote/static hosts like GitHub Pages)
app.post('/api/visit', (req, res) => {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || 'Unknown Agent';
  writeLog('VISIT', ip, `Page hit (Dynamic/Remote) - UserAgent: ${userAgent}`);
  return res.json({ success: true });
});

// Endpoint to handle visitor registration submissions
app.post('/api/register', async (req, res) => {
  const { name, phone, email, company, sessionId } = req.body;
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || 'Unknown Agent';

  // Server-side validation
  if (!name || !phone || !email) {
    writeLog('WARN', ip, `Failed registration attempt - Missing fields`);
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  // Save session details in memory
  const timestamp = getTimestamp();
  if (sessionId) {
    sessions.set(sessionId, {
      name,
      phone,
      email,
      company: company || 'Individual',
      loginTime: timestamp,
      lastHeartbeat: Date.now(),
      logoutTime: ''
    });
  }

  // Log successful registration details
  const details = `Name: ${name} | Phone: ${phone} | Email: ${email} | Company: ${company || 'Individual'} | SessionId: ${sessionId || 'N/A'} | Device: ${userAgent}`;
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
        text: `New Portfolio Visitor Registered!\n\nDetails:\n-----------------\nName: ${name}\nPhone: ${phone}\nEmail: ${email}\nCompany: ${company || 'Individual'}\nIP Addr: ${ip}\nTime: ${getTimestamp()}\nDevice: ${userAgent}\n`,
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
                <td style="padding: 8px 0; font-weight: bold; color: #ef4444;">Company:</td>
                <td style="padding: 8px 0;">${company || 'Individual'}</td>
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

// Endpoint to receive client heartbeats
app.post('/api/heartbeat', (req, res) => {
  const { sessionId, name, phone, email, company } = req.body;
  if (!sessionId) {
    return res.status(400).json({ success: false, message: 'sessionId is required.' });
  }

  const timestamp = getTimestamp();
  if (sessions.has(sessionId)) {
    const s = sessions.get(sessionId);
    s.lastHeartbeat = Date.now();
  } else {
    // Recreate session if server restarted
    sessions.set(sessionId, {
      name: name || 'Unknown',
      phone: phone || 'Unknown',
      email: email || 'Unknown',
      company: company || 'Individual',
      loginTime: timestamp,
      lastHeartbeat: Date.now(),
      logoutTime: ''
    });
  }
  return res.json({ success: true });
});

// Endpoint to receive client logout event
app.post('/api/logout', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ success: false, message: 'sessionId is required.' });
  }

  const timestamp = getTimestamp();
  if (sessions.has(sessionId)) {
    const s = sessions.get(sessionId);
    s.logoutTime = timestamp;
    const ip = getClientIp(req);
    writeLog('LOGOUT', ip, `Session closed - Name: ${s.name} | Phone: ${s.phone} | Email: ${s.email} | SessionId: ${sessionId}`);
  }
  return res.json({ success: true });
});

// Endpoint to retrieve and parse visitors.log for the live web monitor dashboard
app.get('/api/logs', (req, res) => {
  fs.readFile(LOG_FILE, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Failed to read logs.' });
    }

    const lines = data.split('\n');
    const logs = [];
    let totalViews = 0;
    const uniqueIps = new Set();
    let totalRegs = 0;
    const uniqueRegs = new Set();
    let warns = 0;

    const parsedRegs = [];
    const logoutsMap = {};

    lines.forEach((line) => {
      if (!line.trim()) return;

      // Pattern: [YYYY-MM-DD HH:mm:ss] TYPE | IP: ip | details
      const match = line.match(/^\[([0-9: -]+)\]\ ([A-Z]+)\ \|\ IP:\ ([a-fA-F0-9.:]+)\ \|\ (.*)$/);
      if (match) {
        const timestamp = match[1];
        const type = match[2];
        const ip = match[3];
        const details = match[4];

        logs.push({ timestamp, type, ip, details });

        if (type === 'VISIT') {
          totalViews++;
          uniqueIps.add(ip);
        } else if (type === 'REGISTER') {
          totalRegs++;
          
          let name = 'Unknown';
          let phone = 'Unknown';
          let email = 'Unknown';
          let company = 'Individual';
          let sessionId = '';

          const nameMatch = details.match(/Name:\ ([^|]+)/);
          const phoneMatch = details.match(/Phone:\ ([^|]+)/);
          const emailMatch = details.match(/Email:\ ([^|]+)/);
          const companyMatch = details.match(/Company:\ ([^|]+)/);
          const sessionIdMatch = details.match(/SessionId:\ ([^|]+)/);

          if (nameMatch) name = nameMatch[1].trim();
          if (phoneMatch) phone = phoneMatch[1].trim();
          if (emailMatch) email = emailMatch[1].trim();
          if (companyMatch) company = companyMatch[1].trim();
          if (sessionIdMatch) sessionId = sessionIdMatch[1].trim();

          const regKey = `${name}-${phone}-${email}`;
          uniqueRegs.add(regKey);

          parsedRegs.push({ timestamp, ip, name, phone, email, company, sessionId });
        } else if (type === 'LOGOUT') {
          const sessionIdMatch = details.match(/SessionId:\ ([^|]+)/);
          if (sessionIdMatch) {
            const sessId = sessionIdMatch[1].trim();
            logoutsMap[sessId] = timestamp;
          }
        } else if (type === 'WARN' || type === 'ERROR') {
          warns++;
        }
      }
    });

    // Extract unique visitors cards by reversing to get the latest unique registrations
    const uniqueVisitorsList = [];
    const seenRegs = new Set();
    for (let i = parsedRegs.length - 1; i >= 0; i--) {
      const reg = parsedRegs[i];
      const key = `${reg.name}-${reg.phone}-${reg.email}`.toLowerCase();
      if (!seenRegs.has(key)) {
        seenRegs.add(key);

        // Enrich session status
        let status = '🔴 Offline';
        let logoutTime = logoutsMap[reg.sessionId] || '';

        if (reg.sessionId && sessions.has(reg.sessionId)) {
          const sess = sessions.get(reg.sessionId);
          // Check if online
          const isOnline = !sess.logoutTime && !logoutsMap[reg.sessionId] && (Date.now() - sess.lastHeartbeat < 8000);
          if (isOnline) {
            status = '🟢 Online';
            logoutTime = '';
          } else {
            status = '🔴 Offline';
            logoutTime = logoutsMap[reg.sessionId] || sess.logoutTime;

            // Fallback to last heartbeat if they abruptly closed tab and no clean logoutTime
            if (!logoutTime && sess.lastHeartbeat) {
              const hbDate = new Date(sess.lastHeartbeat);
              const year = hbDate.getFullYear();
              const month = String(hbDate.getMonth() + 1).padStart(2, '0');
              const day = String(hbDate.getDate()).padStart(2, '0');
              const hours = String(hbDate.getHours()).padStart(2, '0');
              const minutes = String(hbDate.getMinutes()).padStart(2, '0');
              const seconds = String(hbDate.getSeconds()).padStart(2, '0');
              logoutTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
            }
          }
        } else if (logoutsMap[reg.sessionId]) {
          status = '🔴 Offline';
          logoutTime = logoutsMap[reg.sessionId];
        }

        uniqueVisitorsList.push({
          timestamp: reg.timestamp,
          ip: reg.ip,
          name: reg.name,
          phone: reg.phone,
          email: reg.email,
          company: reg.company,
          sessionId: reg.sessionId,
          status: status,
          logoutTime: logoutTime || '—'
        });
      }
    }
    // Reverse back to maintain chronological order
    uniqueVisitorsList.reverse();

    return res.json({
      success: true,
      stats: {
        totalViews,
        uniqueViews: uniqueIps.size,
        totalRegistrations: totalRegs,
        uniqueRegistrations: uniqueRegs.size,
        totalAlerts: warns
      },
      uniqueVisitors: uniqueVisitorsList,
      recentLogs: logs.slice(-80) // return last 80 entries for console feed
    });
  });
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
