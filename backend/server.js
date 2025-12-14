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

    let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (typeof ip === 'string' && ip.includes(',')) {
      ip = ip.split(',')[0].trim();
    }

    let location = 'Unknown';
    try {
      if (ip && ip !== '127.0.0.1' && ip !== '::1') {
        const r = await axios.get(`http://ip-api.com/json/${ip}`);
        if (r.data?.status === 'success') {
          location = `${r.data.city}, ${r.data.country}`;
        }
      }
    } catch {}

    const parser = new UAParser(req.headers['user-agent']);
    const ua = parser.getResult();

    const newMessage = {
      id: Date.now(),
      message: message.trim(),
      timestamp: new Date().toISOString(),
      ip,
      location,
      browser: ua.browser.name || 'Unknown',
      os: ua.os.name || 'Unknown'
    };

    messages.push(newMessage);
    await fs.writeFile(MESSAGES_FILE, JSON.stringify(messages, null, 2));

    // EMAIL (async, safe)
    sendEmail(
      '📩 New Anonymous Message',
      `
Message: ${newMessage.message}
Time (UTC): ${newMessage.timestamp}
IP: ${newMessage.ip}
Location: ${newMessage.location}
Browser: ${newMessage.browser}
OS: ${newMessage.os}
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
