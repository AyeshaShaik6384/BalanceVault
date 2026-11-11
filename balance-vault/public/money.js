
/* =========================================
   BALANCEVAULT - MONEY MOVEMENT JAVASCRIPT
   Deposit functionality
========================================= */

const API = {
    me: '/api/auth/me',
    accounts: '/api/accounts',
    deposit: '/api/transactions/deposit',
    logout: '/api/auth/logout'
};

const moneyRoot = document.getElementById('money-root');

let accounts = [];


// =========================================
// HELPER: FETCH JSON
// =========================================

async function fetchJSON(url, options = {}) {

    const response = await fetch(url, {
        credentials: 'same-origin',
        ...options
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
        window.location.href = '/index.html';
        throw new Error('Session expired. Please log in again.');
    }

    if (!response.ok) {
        throw new Error(
            data.message || data.error || 'Request failed'
        );
    }

    return data;
}


// =========================================
// HELPER: ESCAPE HTML
// =========================================

function escapeHTML(value) {

    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    })[char]);

}


// =========================================
// USER PROFILE
// =========================================

async function loadUser() {

    try {

        const user = await fetchJSON(API.me);

        const name = user.fullname || user.name || 'User';

        const nameElement =
            document.getElementById('user-display-name');

        const badgeElement =
            document.getElementById('user-initial-badge');

        if (nameElement) {
            nameElement.textContent = name;
        }

        if (badgeElement) {
            badgeElement.textContent =
                name.charAt(0).toUpperCase();
        }

        return true;

    } catch (error) {

        console.error('User loading error:', error);

        return false;

    }

}


// =========================================
// EMPTY ACCOUNT STATE
// =========================================

function showEmptyState() {

    moneyRoot.innerHTML = `

        <div class="empty-state">

            <p class="empty-state-title">
                No accounts available
            </p>

            <p class="empty-state-text">
                Money movement requires an account returned
                by your account access list.
            </p>

        </div>

    `;

}


// =========================================
// LOAD ACCOUNTS
// =========================================

async function loadAccounts() {

    try {

        const data = await fetchJSON(API.accounts);

        accounts = Array.isArray(data)
            ? data
            : data.accounts || [];

        if (accounts.length === 0) {

            showEmptyState();

            return;

        }

        renderDepositForm();

    } catch (error) {

        console.error('Account loading error:', error);

        moneyRoot.innerHTML = `

            <div class="message error" style="display:block">
                Unable to load accounts.
                Please try again later.
            </div>

        `;

    }

}


// =========================================
// RENDER DEPOSIT FORM
// =========================================

function renderDepositForm() {

    const options = accounts.map((account, index) => {

        const id = account.id ?? account.account_id;

        const number = account.account_number || `Account ${index + 1}`;

        const type = account.type || 'Account';

        return `

            <option value="${escapeHTML(id)}">

                ${escapeHTML(type)} -
                ${escapeHTML(number)}

            </option>

        `;

    }).join('');


    moneyRoot.innerHTML = `

        <div class="money-card">

            <form id="deposit-form">

                <div class="form-group">

                    <label for="account-select">
                        Select account
                    </label>

                    <select id="account-select"
                            class="form-control"
                            required>

                        <option value="">
                            Choose an account
                        </option>

                        ${options}

                    </select>

                </div>


                <div id="selected-account-info"
                     class="account-info"
                     style="display:none">

                    <p>Selected account</p>

                    <strong id="selected-account-number"></strong>

                    <div class="account-balance"
                         id="selected-account-balance"></div>

                </div>


                <div class="form-group">

                    <label for="deposit-amount">
                        Deposit amount (₹)
                    </label>

                    <input
                        type="number"
                        id="deposit-amount"
                        class="form-control amount-input"
                        placeholder="Enter deposit amount"
                        min="0.01"
                        step="0.01"
                        required
                    >

                </div>


                <div id="deposit-message" class="message"></div>


                <button type="submit"
                        id="deposit-submit"
                        class="primary-btn">

                    Confirm deposit

                </button>

            </form>

        </div>

    `;


    const select = document.getElementById('account-select');

    select.addEventListener('change', updateSelectedAccount);

    document.getElementById('deposit-form')
        .addEventListener('submit', submitDeposit);

}


// =========================================
// UPDATE SELECTED ACCOUNT
// =========================================

function updateSelectedAccount() {

    const selectedId =
        document.getElementById('account-select').value;

    const account = accounts.find(acc =>
        String(acc.id ?? acc.account_id) === String(selectedId)
    );

    const info =
        document.getElementById('selected-account-info');

    if (!account) {

        info.style.display = 'none';

        return;

    }

    info.style.display = 'block';

    document.getElementById('selected-account-number')
        .textContent =
            account.account_number || 'Account';

    document.getElementById('selected-account-balance')
        .textContent =
            'Available balance: ₹' +
            Number(account.balance || 0).toFixed(2);

}


// =========================================
// SHOW MESSAGE
// =========================================

function showMessage(text, type) {

    const element =
        document.getElementById('deposit-message');

    element.textContent = text;

    element.className = `message ${type}`;

}


// =========================================
// SUBMIT DEPOSIT
// =========================================

async function submitDeposit(event) {

    event.preventDefault();

    const accountId =
        document.getElementById('account-select').value;

    const amount =
        Number(document.getElementById('deposit-amount').value);

    const button =
        document.getElementById('deposit-submit');

    if (!accountId) {

        showMessage('Please select an account.', 'error');

        return;

    }

    if (!Number.isFinite(amount) || amount <= 0) {

        showMessage('Enter a valid deposit amount.', 'error');

        return;

    }

    button.disabled = true;

    button.textContent = 'Processing...';

    try {

        /*
          The backend must independently validate:
          - Account ownership and eligibility
          - Deposit amount
          - Transaction authorization
          - Idempotency
          - Ledger posting
        */

        const result = await fetchJSON(API.deposit, {

            method: 'POST',

            headers: {
                'Content-Type': 'application/json',
                'Idempotency-Key': crypto.randomUUID()
            },

            body: JSON.stringify({

                account_id: accountId,

                amount: amount

            })

        });


        showMessage(
            result.message || 'Deposit request processed successfully.',
            'success'
        );


        // Refresh account information from backend
        await loadAccounts();


    } catch (error) {

        console.error('Deposit error:', error);

        showMessage(error.message, 'error');

    } finally {

        button.disabled = false;

        button.textContent = 'Confirm deposit';

    }

}


// =========================================
// PROFILE DROPDOWN
// =========================================

function toggleDropdown() {

    const dropdown =
        document.getElementById('user-dropdown');

    if (dropdown) {
        dropdown.classList.toggle('show');
    }

}


// Close dropdown when clicking outside
document.addEventListener('click', function(event) {

    const user = document.querySelector('.user');

    const dropdown =
        document.getElementById('user-dropdown');

    if (
        user &&
        dropdown &&
        !user.contains(event.target)
    ) {

        dropdown.classList.remove('show');

    }

});


// =========================================
// LOGOUT
// =========================================

async function logout() {

    const button =
        document.getElementById('dropdown-logout');

    if (button) {
        button.disabled = true;
    }

    try {

        await fetch(API.logout, {

            method: 'POST',

            credentials: 'same-origin'

        });

        window.location.href = '/index.html';

    } catch (error) {

        console.error('Logout error:', error);

        window.location.href = '/index.html';

    }

}


const logoutButton =
    document.getElementById('dropdown-logout');

if (logoutButton) {

    logoutButton.addEventListener('click', logout);

}


// =========================================
// INITIALIZE DEPOSIT PAGE
// =========================================

async function initializeMoneyPage() {

    const authenticated = await loadUser();

    if (!authenticated) {

        window.location.href = '/index.html';

        return;

    }

    await loadAccounts();

}


// START
initializeMoneyPage();
