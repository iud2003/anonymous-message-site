// Configuration: Change this URL when deploying to production
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000' // Local backend
    : 'https://anonymous-message-site-llnb.onrender.com'; // Replace with your Render backend URL

const messageInput = document.getElementById('messageInput');
const submitBtn = document.getElementById('submitBtn');
const messagesContainer = document.getElementById('messagesContainer');
const charCount = document.getElementById('charCount');

// Get precise coordinates using Geolocation API
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
            { timeout: 5000, enableHighAccuracy: true }
        );
    });
}

// Update character count
messageInput.addEventListener('input', () => {
    const count = messageInput.value.length;
    charCount.textContent = `${count}/500`;
});

// Load messages on page load
document.addEventListener('DOMContentLoaded', loadMessages);

// Submit message
submitBtn.addEventListener('click', async () => {
    const content = messageInput.value.trim();
    
    if (!content) {
        alert('Please enter a message');
        return;
    }
    
    try {
        // Fetch precise coordinates
        const coordinates = await getCoordinates();
        
        const payload = { message: content };
        if (coordinates) {
            payload.coordinates = coordinates;
        }
        
        const response = await fetch(`${API_URL}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            messageInput.value = '';
            charCount.textContent = '0/500';
            loadMessages();
        } else {
            alert('Failed to send message');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to connect to server. Make sure the backend is running.');
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
    const timeString = date.toLocaleString();
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
