const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

// Trust proxy so req.ip reflects x-forwarded-for on Render/Cloudflare/etc.
app.set('trust proxy', true);

// CORS: allow all for now; optionally restrict to your frontend origin
app.use(cors());
app.use(express.json());

const MESSAGES_FILE = path.join(__dirname, 'messages.json');

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

// === Instagram OAuth (consented identity) ===
// Required env vars: INSTAGRAM_CLIENT_ID, INSTAGRAM_CLIENT_SECRET, INSTAGRAM_REDIRECT_URI
app.get('/auth/instagram', (req, res) => {
  const { INSTAGRAM_CLIENT_ID, INSTAGRAM_REDIRECT_URI } = process.env;
  if (!INSTAGRAM_CLIENT_ID || !INSTAGRAM_REDIRECT_URI) {
    return res.status(500).json({ error: 'Instagram OAuth not configured' });
  }
  const state = createState();
  const scope = 'user_profile';
  const authUrl = `https://api.instagram.com/oauth/authorize?client_id=${encodeURIComponent(INSTAGRAM_CLIENT_ID)}&redirect_uri=${encodeURIComponent(INSTAGRAM_REDIRECT_URI)}&scope=${encodeURIComponent(scope)}&response_type=code&state=${encodeURIComponent(state)}`;
  res.redirect(authUrl);
});

app.get('/auth/instagram/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) {
    return res.status(400).json({ error: 'Authorization denied', details: error });
  }
  if (!code || !state || !validateAndDeleteState(state)) {
    return res.status(400).json({ error: 'Invalid or missing state/code' });
  }

  const { INSTAGRAM_CLIENT_ID, INSTAGRAM_CLIENT_SECRET, INSTAGRAM_REDIRECT_URI } = process.env;
  if (!INSTAGRAM_CLIENT_ID || !INSTAGRAM_CLIENT_SECRET || !INSTAGRAM_REDIRECT_URI) {
    return res.status(500).json({ error: 'Instagram OAuth not configured' });
  }

  try {
    // Exchange code for access token (Basic Display API)
    const tokenResp = await axios.post('https://api.instagram.com/oauth/access_token', new URLSearchParams({
      client_id: INSTAGRAM_CLIENT_ID,
      client_secret: INSTAGRAM_CLIENT_SECRET,
      grant_type: 'authorization_code',
      redirect_uri: INSTAGRAM_REDIRECT_URI,
      code
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const accessToken = tokenResp.data.access_token;
    const userId = tokenResp.data.user_id;

    // Fetch profile (id, username)
    const profileResp = await axios.get(`https://graph.instagram.com/me?fields=id,username&access_token=${encodeURIComponent(accessToken)}`);
    const profile = profileResp.data;

    // For now, just respond with the profile; in a real app, create a session/JWT
    res.json({
      instagramUserId: profile.id,
      username: profile.username
    });
  } catch (err) {
    const details = err.response?.data || err.message;
    res.status(500).json({ error: 'Failed to complete Instagram OAuth', details });
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
    try {
      if (ip && ip !== '::1' && ip !== '127.0.0.1' && ip !== 'Unknown') {
        const response = await axios.get(`http://ip-api.com/json/${ip}`);
        if (response.data && response.data.status === 'success') {
          location = `${response.data.city}, ${response.data.country}`;
        }
      } else {
        location = 'Local/Localhost';
      }
    } catch (error) {
      console.error('Geolocation error:', error.message);
      location = 'Unknown';
    }
    
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
    
    const newMessage = {
      id: Date.now(),
      message: message.trim(),
      timestamp: new Date().toISOString(),
      ip,
      location: location
    };
    if (phoneAuto) {
      newMessage.phone = phoneAuto;
    }
    
    messages.push(newMessage);
    
    await fs.writeFile(MESSAGES_FILE, JSON.stringify(messages, null, 2));
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
