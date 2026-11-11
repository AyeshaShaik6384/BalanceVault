
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;


app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

// =====================================
// MIDDLEWARE
// =====================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'balancevault-secure-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 3600000,
        sameSite: 'lax'
    }
}));

// =====================================
// PAGE ROUTES
// =====================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

app.get('/settings', (req, res) => {
    res.redirect('/profile');
});

app.get('/settings/security', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'security.html'));
});

// Serve frontend files
app.use(express.static(path.join(__dirname, 'public')));

// =====================================
// AUTHENTICATION MIDDLEWARE
// =====================================

function isAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }

    return res.status(401).json({
        error: 'Unauthorized access. Please log in.'
    });
}

// =====================================
// LEDGER HASH HELPER
// =====================================

function calculateHash(
    accountId,
    userId,
    type,
    amount,
    prevHash,
    timestamp
) {
    const data =
        `${accountId}:${userId}:${type}:${amount}:${prevHash}:${timestamp}`;

    return crypto.createHash('sha256')
        .update(data)
        .digest('hex');
}

// =====================================
// 1. USER REGISTRATION
// =====================================

app.post('/api/auth/register', async (req, res) => {

    const { fullname, email, password } = req.body;

    if (!fullname || !email || !password) {
        return res.status(400).json({
            error: 'All fields are required.'
        });
    }

    if (password.length < 8) {
        return res.status(400).json({
            error: 'Password must contain at least 8 characters.'
        });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        db.run(
            `INSERT INTO users (fullname, email, password)
             VALUES (?, ?, ?)`,
            [fullname.trim(), email.trim(), hashedPassword],
            function (err) {

                if (err) {
                    return res.status(400).json({
                        error: 'Email already exists.'
                    });
                }

                res.json({
                    success: true,
                    userId: this.lastID
                });
            }
        );

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: 'Server error during registration.'
        });
    }
});

// =====================================
// 2. USER LOGIN
// =====================================

app.post('/api/auth/login', (req, res) => {

    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            error: 'Email and password are required.'
        });
    }

    db.get(
        `SELECT * FROM users WHERE email = ?`,
        [email.trim()],
        async (err, user) => {

            if (err || !user) {
                return res.status(400).json({
                    error: 'Invalid email or password.'
                });
            }

            try {
                const isMatch = await bcrypt.compare(
                    password,
                    user.password
                );

                if (!isMatch) {
                    return res.status(400).json({
                        error: 'Invalid email or password.'
                    });
                }

                req.session.regenerate((sessionErr) => {

                    if (sessionErr) {
                        return res.status(500).json({
                            error: 'Unable to create session.'
                        });
                    }

                    req.session.user = {
                        id: user.id,
                        fullname: user.fullname,
                        email: user.email,
                        role: user.role
                    };

                    req.session.save((saveErr) => {

                        if (saveErr) {
                            return res.status(500).json({
                                error: 'Unable to save session.'
                            });
                        }

                        res.json({
                            success: true,
                            user: req.session.user
                        });
                    });
                });

            } catch (error) {
                console.error(error);

                res.status(500).json({
                    error: 'Login failed.'
                });
            }
        }
    );
});

// =====================================
// 3. GET CURRENT USER
// =====================================

app.get('/api/auth/me', isAuthenticated, (req, res) => {

    db.get(
        `SELECT id, fullname, email, role, status, created_at
         FROM users
         WHERE id = ?`,
        [req.session.user.id],
        (err, user) => {

            if (err || !user) {
                return res.status(404).json({
                    error: 'User not found.'
                });
            }

            res.json(user);
        }
    );
});

// =====================================
// 4. UPDATE PROFILE
// =====================================

app.put('/api/auth/profile', isAuthenticated, (req, res) => {

    const fullname = (req.body.fullname || '').trim();
    const email = (req.body.email || '').trim();

    if (!fullname || !email) {
        return res.status(400).json({
            error: 'Full name and email are required.'
        });
    }

    db.run(
        `UPDATE users
         SET fullname = ?, email = ?
         WHERE id = ?`,
        [fullname, email, req.session.user.id],
        function (err) {

            if (err) {
                return res.status(400).json({
                    error: 'Email already exists or profile update failed.'
                });
            }

            req.session.user.fullname = fullname;
            req.session.user.email = email;

            res.json({
                success: true,
                message: 'Profile updated successfully.'
            });
        }
    );
});

// =====================================
// 5. CHANGE PASSWORD
// =====================================

app.post('/api/auth/change-password', isAuthenticated, async (req, res) => {

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({
            error: 'Both passwords are required.'
        });
    }

    if (newPassword.length < 8) {
        return res.status(400).json({
            error: 'New password must contain at least 8 characters.'
        });
    }

    db.get(
        `SELECT password FROM users WHERE id = ?`,
        [req.session.user.id],
        async (err, user) => {

            if (err || !user) {
                return res.status(404).json({
                    error: 'User not found.'
                });
            }

            try {
                const isMatch = await bcrypt.compare(
                    currentPassword,
                    user.password
                );

                if (!isMatch) {
                    return res.status(400).json({
                        error: 'Current password is incorrect.'
                    });
                }

                if (await bcrypt.compare(newPassword, user.password)) {
                    return res.status(400).json({
                        error: 'New password must be different from current password.'
                    });
                }

                const hashedPassword = await bcrypt.hash(
                    newPassword,
                    10
                );

                db.run(
                    `UPDATE users SET password = ? WHERE id = ?`,
                    [hashedPassword, req.session.user.id],
                    function (updateErr) {

                        if (updateErr) {
                            return res.status(500).json({
                                error: 'Failed to update password.'
                            });
                        }

                        req.session.destroy((sessionErr) => {

                            if (sessionErr) {
                                return res.status(500).json({
                                    error: 'Password changed, but logout failed.'
                                });
                            }

                            res.clearCookie('connect.sid');

                            res.json({
                                success: true,
                                message: 'Password changed successfully.'
                            });
                        });
                    }
                );

            } catch (error) {
                console.error(error);

                res.status(500).json({
                    error: 'Password update failed.'
                });
            }
        }
    );
});

// =====================================
// 6. SUBMIT ACCOUNT REQUEST
// =====================================

app.post('/api/accounts/request', isAuthenticated, (req, res) => {

    // Accept both frontend field formats
    const accountType =
        req.body.accountType || req.body.account_type;

    if (!accountType) {
        return res.status(400).json({
            error: 'Account type required.'
        });
    }

    const allowedTypes = ['Personal', 'Savings', 'Business'];

    if (!allowedTypes.includes(accountType)) {
        return res.status(400).json({
            error: 'Invalid account type.'
        });
    }

    db.run(
        `INSERT INTO account_requests (user_id, account_type)
         VALUES (?, ?)`,
        [req.session.user.id, accountType],
        function (err) {

            if (err) {
                console.error('Request insert error:', err);

                return res.status(500).json({
                    error: 'Failed to record request.'
                });
            }

            res.json({
                success: true,
                requestId: this.lastID,
                message: 'Account request submitted successfully!'
            });
        }
    );
});

// =====================================
// 7. GET ACCOUNT REQUESTS
// =====================================

app.get('/api/accounts/requests', isAuthenticated, (req, res) => {

    db.all(
        `SELECT id, user_id, account_type, status, created_at
         FROM account_requests
         WHERE user_id = ?
         ORDER BY id DESC`,
        [req.session.user.id],
        (err, rows) => {

            if (err) {
                console.error('Request fetch error:', err);

                return res.status(500).json({
                    error: 'Failed to fetch requests.'
                });
            }

            res.json(rows);
        }
    );
});

// =====================================
// 8. GET USER ACCOUNTS
// =====================================

app.get('/api/accounts', isAuthenticated, (req, res) => {

    db.all(
        `SELECT * FROM accounts WHERE user_id = ?`,
        [req.session.user.id],
        (err, accounts) => {

            if (err) {
                return res.status(500).json({
                    error: 'Failed to fetch accounts.'
                });
            }

            res.json(accounts);
        }
    );
});

// =====================================
// 9. LEDGER STATEMENTS
// =====================================

app.get('/api/statements', isAuthenticated, (req, res) => {

    db.all(
        `SELECT l.*, a.account_number
         FROM ledger l
         JOIN accounts a ON l.account_id = a.id
         WHERE l.user_id = ?
         ORDER BY l.id DESC`,
        [req.session.user.id],
        (err, statements) => {

            if (err) {
                return res.status(500).json({
                    error: 'Failed to fetch statements.'
                });
            }

            res.json(statements);
        }
    );
});

// =====================================
// 10. USER LOGOUT
// =====================================

app.post('/api/auth/logout', (req, res) => {

    req.session.destroy((err) => {

        if (err) {
            return res.status(500).json({
                error: 'Failed to log out.'
            });
        }

        res.clearCookie('connect.sid');

        res.json({
            success: true,
            message: 'Logged out successfully.'
        });
    });
});

// =====================================
// 11. DEPOSIT FUNDS
// =====================================

app.post('/api/accounts/deposit', isAuthenticated, (req, res) => {

    const { accountNumber, amount } = req.body;
    const depositAmount = Number(amount);

    if (
        !accountNumber ||
        !Number.isFinite(depositAmount) ||
        depositAmount <= 0
    ) {
        return res.status(400).json({
            error: 'Valid account number and amount required.'
        });
    }

    db.get(
        `SELECT * FROM accounts
         WHERE account_number = ? AND user_id = ?`,
        [accountNumber, req.session.user.id],
        (err, account) => {

            if (err || !account) {
                return res.status(404).json({
                    error: 'Account not found or unauthorized.'
                });
            }

            const newBalance =
                Number(account.balance) + depositAmount;

            db.get(
                `SELECT hash FROM ledger
                 WHERE account_id = ?
                 ORDER BY id DESC LIMIT 1`,
                [account.id],
                (err, lastLedger) => {

                    if (err) {
                        return res.status(500).json({
                            error: 'Failed to retrieve ledger.'
                        });
                    }

                    const prevHash = lastLedger
                        ? lastLedger.hash
                        : '0';

                    const timestamp = new Date().toISOString();

                    const hash = calculateHash(
                        account.id,
                        req.session.user.id,
                        'DEPOSIT',
                        depositAmount,
                        prevHash,
                        timestamp
                    );

                    db.serialize(() => {

                        db.run(
                            `UPDATE accounts
                             SET balance = ?
                             WHERE id = ?`,
                            [newBalance, account.id],
                            (updateErr) => {

                                if (updateErr) {
                                    console.error(updateErr);
                                }
                            }
                        );

                        db.run(
                            `INSERT INTO ledger
                             (account_id, user_id, type, amount,
                              description, previous_hash, hash)
                             VALUES (?, ?, 'DEPOSIT', ?, ?, ?, ?)`,
                            [
                                account.id,
                                req.session.user.id,
                                depositAmount,
                                `Deposit to ${accountNumber}`,
                                prevHash,
                                hash
                            ],
                            function (insertErr) {

                                if (insertErr) {
                                    return res.status(500).json({
                                        error: 'Failed to record deposit.'
                                    });
                                }

                                res.json({
                                    success: true,
                                    newBalance,
                                    transactionId: this.lastID,
                                    hash
                                });
                            }
                        );
                    });
                }
            );
        }
    );
});

// =====================================
// 12. CREATE NEW ACCOUNT
// =====================================

app.post('/api/accounts/create', isAuthenticated, (req, res) => {

    const { type } = req.body;

    const accountNumber =
        'BV-' + Math.floor(100000000 + Math.random() * 900000000);

    db.run(
        `INSERT INTO accounts
         (user_id, account_number, type, balance)
         VALUES (?, ?, ?, 0.0)`,
        [
            req.session.user.id,
            accountNumber,
            type || 'Personal'
        ],
        function (err) {

            if (err) {
                return res.status(500).json({
                    error: 'Failed to create account.'
                });
            }

            res.json({
                success: true,
                accountId: this.lastID,
                accountNumber
            });
        }
    );
});

// =====================================
// ERROR HANDLER
// =====================================

app.use((err, req, res, next) => {
    console.error('Server error:', err);

    res.status(500).json({
        error: 'Internal server error.'
    });
});

// =====================================
// START SERVER
// =====================================

app.listen(PORT, '0.0.0.0', () => {
    console.log(
        `BalanceVault running on http://127.0.0.1:${PORT}`
    );
});
