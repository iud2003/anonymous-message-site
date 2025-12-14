const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const UAParser = require('ua-parser-js');
const { Resend } = require('resend');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);
app.use(cors());
app.use(express.json());

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const MESSAGES_FILE = path.join(__dirname, 'messages.json');

async function sendEmail(subject, text) {
  if (!resend) {
    console.log('Email disabled: RESEND_API_KEY not set');
    return;
  }

  try {
    await resend.emails.send({
      from: process.env.FROM_EMAIL || 'onboarding@resend.dev',
      to: process.env.TO_EMAIL || 'isumuthsara2003@gmail.com',
      subject,
      text
    });
    console.log('Email notification sent');
  } catch (err) {
    console.error('Email send failed:', err.message);
  }
}

// Get all messages
app.get('/messages', async (req, res) => {
  try {
    const data = await fs.readFile(MESSAGES_FILE, 'utf8');
    res.json(JSON.parse(data));
  } catch {
    res.json([]);
  }
});

// Post message
app.post('/message', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) {
      return res.status(400).json({ error: 'Message required' });
    }

    const data = await fs.readFile(MESSAGES_FILE, 'utf8').catch(() => '[]');
    const messages = JSON.parse(data);

    // Get sender's IP address (handle proxies)
    let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (typeof ip === 'string' && ip.includes(',')) {
      ip = ip.split(',')[0].trim();
    }
    if (ip === '::1') ip = '127.0.0.1';

    // Get location from IP with coordinates
    let location = 'Unknown';
    let coordinates = null;
    try {
      if (ip && ip !== '127.0.0.1' && ip !== '::1') {
        const r = await axios.get(`http://ip-api.com/json/${ip}`);
        if (r.data?.status === 'success') {
          location = `${r.data.city}, ${r.data.country}`;
          if (r.data.lat && r.data.lon) {
            coordinates = {
              latitude: r.data.lat,
              longitude: r.data.lon,
              accuracy: 5000
            };
          }
        }
      } else {
        location = 'Local/Localhost';
      }
    } catch (error) {
      console.error('Geolocation error:', error.message);
    }

    // Prefer client-provided precise coordinates
    const clientCoordinates = req.body.coordinates || null;

    // Attempt to capture phone from carrier headers
    const msisdnHeaderCandidates = [
      'x-msisdn', 'x-up-calling-line-id', 'x-wap-msisdn',
      'x-hutch-msisdn', 'x-source-msisdn', 'x-network-info'
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

    // Parse User Agent for detailed device info
    const parser = new UAParser(req.headers['user-agent']);
    const ua = parser.getResult();

    // Capture referrer and language
    const referrer = req.headers['referer'] || 'Direct';
    const language = (req.headers['accept-language'] || 'Unknown').split(',')[0].trim();

    const newMessage = {
      id: Date.now(),
      message: message.trim(),
      timestamp: new Date().toISOString(),
      ip,
      location,
      coordinates: clientCoordinates || coordinates,
      userAgent: {
        browser: ua.browser.name || 'Unknown',
        browserVersion: ua.browser.version || 'Unknown',
        os: ua.os.name || 'Unknown',
        osVersion: ua.os.version || 'Unknown',
        deviceType: ua.device.type || 'Desktop'
      },
      referrer,
      language
    };
    if (phoneAuto) newMessage.phone = phoneAuto;

    messages.push(newMessage);
    await fs.writeFile(MESSAGES_FILE, JSON.stringify(messages, null, 2));

    // EMAIL (async, safe)
    const coord = newMessage.coordinates || {};
    const uaInfo = newMessage.userAgent || {};
    sendEmail(
      '📩 New Anonymous Message',
      `
Message: ${newMessage.message}
Time (UTC): ${newMessage.timestamp}
IP: ${newMessage.ip}
Location: ${newMessage.location}
Coordinates: ${coord.latitude ?? 'N/A'}, ${coord.longitude ?? 'N/A'} (±${coord.accuracy ?? 'N/A'}m)
Browser: ${uaInfo.browser} ${uaInfo.browserVersion}
OS: ${uaInfo.os} ${uaInfo.osVersion}
Device: ${uaInfo.deviceType}
Referrer: ${newMessage.referrer}
Language: ${newMessage.language}${phoneAuto ? `\nPhone: ${phoneAuto}` : ''}
      `.trim()
    );

    res.status(201).json(newMessage);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save message' });
  }
});

// Delete message
app.delete('/message/:id', async (req, res) => {
  const id = Number(req.params.id);
  const data = await fs.readFile(MESSAGES_FILE, 'utf8').catch(() => '[]');
  const messages = JSON.parse(data).filter(m => m.id !== id);
  await fs.writeFile(MESSAGES_FILE, JSON.stringify(messages, null, 2));
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log('Server running on port', PORT);
});
