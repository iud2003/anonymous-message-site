const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const MESSAGES_FILE = path.join(__dirname, 'messages.json');

// Get all messages
app.get('/api/messages', async (req, res) => {
  try {
    const data = await fs.readFile(MESSAGES_FILE, 'utf8');
    const messages = JSON.parse(data);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read messages' });
  }
});

// Post a new message
app.post('/api/messages', async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content || content.trim() === '') {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const data = await fs.readFile(MESSAGES_FILE, 'utf8');
    const messages = JSON.parse(data);
    
    // Get sender's IP address
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
    
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
    
    const newMessage = {
      id: Date.now(),
      content: content.trim(),
      timestamp: new Date().toISOString(),
      location: location
    };
    
    messages.push(newMessage);
    
    await fs.writeFile(MESSAGES_FILE, JSON.stringify(messages, null, 2));
    res.status(201).json(newMessage);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save message' });
  }
});

// Delete a message
app.delete('/api/messages/:id', async (req, res) => {
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
