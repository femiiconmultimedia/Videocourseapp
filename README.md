# My Class — Video Course Platform

A complete class registration + video course website.
Students register, log in, and watch 2 courses (6 videos each).
Videos are marked complete at 90% watched and the next lesson unlocks automatically.

## Tech
- Backend: Node.js (no dependencies — uses only built-in modules)
- Frontend: plain HTML/CSS/JS
- Storage: `data.json` file (auto-created on first run)

## Run locally
```bash
node server.js
```
Then open http://localhost:3000

## Project structure
```
server.js          → server, API, auth, video completion logic
public/index.html  → register / login page
public/app.html    → course dashboard with video player
```

## Customize
Edit the `COURSES` section at the top of `server.js` to change course titles
and replace the sample video URLs with your real videos.

## Deploy
Push to GitHub and deploy on Render (free tier) with a custom domain for automatic HTTPS.
