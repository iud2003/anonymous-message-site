# Anonymous Message Board

A simple anonymous message board where users can post and read messages anonymously.

## Features

- 📝 Post anonymous messages
- 👀 View all messages in real-time
- 🗑️ Delete messages
- 📱 Responsive design
- 🎨 Beautiful gradient UI

## Project Structure

```
anonymous-message-site/
├── backend/
│   ├── server.js          # Express server
│   ├── messages.json      # Message storage
│   ├── package.json       # Backend dependencies
│   └── node_modules/      # Installed packages
├── frontend/
│   ├── index.html         # Main HTML page
│   ├── style.css          # Styling
│   └── script.js          # Client-side logic
└── README.md              # This file
```

## Installation

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

The server will run on `http://localhost:3000`

### Frontend Setup

Simply open the `frontend/index.html` file in your web browser, or use a local server:

```bash
cd frontend
# Using Python
python -m http.server 8000

# Using Node.js
npx http-server -p 8000
```

Then visit `http://localhost:8000`

## Usage

1. Start the backend server first
2. Open the frontend in your browser
3. Type your anonymous message in the text area
4. Click "Send Message" to post
5. View all messages below
6. Click "Delete" to remove a message

## Technologies Used

- **Backend**: Node.js, Express.js
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Storage**: JSON file storage

## API Endpoints

- `GET /api/messages` - Retrieve all messages
- `POST /api/messages` - Post a new message
- `DELETE /api/messages/:id` - Delete a message by ID

## License

ISC
