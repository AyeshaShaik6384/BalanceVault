# Security Threat Model (THREATS.md)

1. **Broken Object Level Authorization (BOLA)**
   - *Threat:* A user modifies an API request parameter to view or mutate another user's bank statements or account requests.
   - *Mitigation:* All database queries enforce `WHERE user_id = req.session.user.id` derived strictly from the server-side session, never trusting client-provided user IDs.

2. **Session Fixation / Hijacking**
   - *Threat:* An attacker steals the session cookie to impersonate an account holder.
   - *Mitigation:* Configured cookies with `httpOnly: true` and implemented server-side destruction on logout.