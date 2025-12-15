# MongoDB Setup Instructions

## Option 1: MongoDB Atlas (Free Cloud Database - Recommended)

1. **Create Account**: Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)

2. **Create Free Cluster**:
   - Click "Build a Database"
   - Choose "M0 Free" tier
   - Select a cloud provider and region (closest to you)
   - Click "Create Cluster"

3. **Create Database User**:
   - Go to "Database Access" in left sidebar
   - Click "Add New Database User"
   - Choose "Password" authentication
   - Username: `admin` (or any name)
   - Password: Generate a strong password (save it!)
   - User Privileges: "Atlas admin"
   - Click "Add User"

4. **Whitelist IP Address**:
   - Go to "Network Access" in left sidebar
   - Click "Add IP Address"
   - Click "Allow Access from Anywhere" (0.0.0.0/0)
   - Click "Confirm"

5. **Get Connection String**:
   - Go to "Database" in left sidebar
   - Click "Connect" on your cluster
   - Choose "Connect your application"
   - Copy the connection string
   - It looks like: `mongodb+srv://admin:<password>@cluster0.xxxxx.mongodb.net/`

6. **Configure Environment Variable**:
   - Replace `<password>` with your actual password
   - Add database name at the end: `mongodb+srv://admin:yourpassword@cluster0.xxxxx.mongodb.net/anonymous-messages`
   - Set this as `MONGODB_URI` in Render environment variables

## Option 2: Local MongoDB (Development Only)

1. Install MongoDB locally
2. Use connection string: `mongodb://localhost:27017/anonymous-messages`

---

## Render Deployment

### Environment Variables to Set:
```
MONGODB_URI=mongodb+srv://admin:yourpassword@cluster0.xxxxx.mongodb.net/anonymous-messages
RESEND_API_KEY=re_your_api_key
FROM_EMAIL=onboarding@resend.dev
TO_EMAIL=your-email@example.com
```

### Deploy Steps:
1. Push code to GitHub
2. Connect Render to your repo
3. Add environment variables above
4. Deploy!

Your messages will now persist across restarts! 🎉
