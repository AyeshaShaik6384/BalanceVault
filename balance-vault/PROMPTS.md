# AI Prompt Audit Trail

## Entry 1 - Date: 2026-11-11
- **What I asked:** Create an Express session configuration with secure cookie parameters and password hashing using bcrypt.
- **What the tool produced:** Provided standard `express-session` and `bcrypt.hash`.
- **What was wrong with it:** `cookie: { secure: true }` was set by default, which breaks local development over HTTP without HTTPS.
- **What I did instead:** Adjusted `secure: false` for development while ensuring `httpOnly: true` remains active to prevent XSS session hijacking. Linked to commit: [commit-hash-placeholder]

## Entry 2 - Date: 2026-11-11 (Authorization Focus)
- **What I asked:** Write middleware to protect dashboard routes from unauthorized API calls.
- **What the tool produced:** A simple `if (req.session.user)` check.
- **What was wrong with it:** It redirected users to HTML login pages on API fetch requests instead of returning a proper JSON 401 status, causing frontend infinite loading states.
- **What I did instead:** Modified the middleware to return `res.status(401).json({ error: 'Unauthorized' })` so client-side JavaScript can gracefully catch it and redirect to login. Linked to commit: [commit-hash-placeholder]