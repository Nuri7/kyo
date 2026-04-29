// ==========================================
// KYŌ KLUB — Cart System
// localStorage-backed cart with event-driven UI updates
// ==========================================

const CART_KEY = 'kyo_cart';
const API_BASE = 'https://kyoklubv.vercel.app';

const Cart = {
    // ─── Data Access ────────────────────────────────
    get items() {
        try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
        catch { return []; }
    },

    get count() {
        return this.items.reduce((sum, i) => sum + i.qty, 0);
    },

    get total() {
        return this.items.reduce((sum, i) => {
            const price = parseFloat(i.price.replace('€', '').replace(',', '.'));
            return sum + price * i.qty;
        }, 0);
    },

    get totalFormatted() {
        return `€${this.total.toFixed(2)}`;
    },

    // ─── Mutations ──────────────────────────────────
    add(drink) {
        const items = this.items;
        const existing = items.find(i => i.name === drink.name);
        if (existing) {
            existing.qty++;
        } else {
            items.push({
                name: drink.name,
                price: drink.price,
                image: drink.image || '',
                qty: 1,
            });
        }
        this._save(items);
    },

    increment(drinkName) {
        const items = this.items;
        const item = items.find(i => i.name === drinkName);
        if (item) { item.qty++; this._save(items); }
    },

    decrement(drinkName) {
        let items = this.items;
        const item = items.find(i => i.name === drinkName);
        if (item) {
            item.qty--;
            if (item.qty <= 0) items = items.filter(i => i.name !== drinkName);
            this._save(items);
        }
    },

    remove(drinkName) {
        const items = this.items.filter(i => i.name !== drinkName);
        this._save(items);
    },

    clear() {
        localStorage.removeItem(CART_KEY);
        this._emit();
    },

    // ─── Internal ───────────────────────────────────
    _save(items) {
        localStorage.setItem(CART_KEY, JSON.stringify(items));
        this._emit();
    },

    _emit() {
        window.dispatchEvent(new CustomEvent('cart-updated', { detail: { count: this.count, total: this.total } }));
    },

    // ─── Checkout ───────────────────────────────────
    async checkout(customerName) {
        if (this.items.length === 0) throw new Error('Cart is empty');
        if (!customerName || !customerName.trim()) throw new Error('Name is required');

        const res = await fetch(`${API_BASE}/api/checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: this.items,
                customerName: customerName.trim(),
            }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Checkout failed');

        // Store order ID for the success page
        localStorage.setItem('kyo_last_order', data.orderId);

        // Redirect to Mollie hosted checkout
        if (data.checkoutUrl) {
            window.location.href = data.checkoutUrl;
        }

        return data;
    },
};

// ==========================================
// Cart Drawer UI
// ==========================================
function createCartDrawer() {
    // Only create once
    if (document.getElementById('cart-drawer')) return;

    // ─── Floating Action Button ─────────────────────
    const fab = document.createElement('button');
    fab.id = 'cart-fab';
    fab.className = 'cart-fab';
    fab.innerHTML = `<span class="cart-fab-icon">🛒</span><span id="cart-fab-count" class="cart-fab-count">0</span>`;
    fab.addEventListener('click', () => toggleDrawer(true));
    document.body.appendChild(fab);

    // ─── Backdrop ───────────────────────────────────
    const backdrop = document.createElement('div');
    backdrop.id = 'cart-backdrop';
    backdrop.className = 'cart-backdrop';
    backdrop.addEventListener('click', () => toggleDrawer(false));
    document.body.appendChild(backdrop);

    // ─── Drawer ─────────────────────────────────────
    const drawer = document.createElement('div');
    drawer.id = 'cart-drawer';
    drawer.className = 'cart-drawer';
    drawer.innerHTML = `
        <div class="cart-drawer-header">
            <h2>Your Order</h2>
            <button id="cart-close" class="cart-close" aria-label="Close cart">✕</button>
        </div>
        <div id="cart-items" class="cart-items"></div>
        <div id="cart-empty-msg" class="cart-empty-msg">
            <span class="cart-empty-icon">🍵</span>
            <p>Your cart is empty</p>
            <p class="cart-empty-hint">Browse the menu and add some drinks!</p>
        </div>
        <div id="cart-footer" class="cart-footer">
            <div class="cart-total-row">
                <span>Total</span>
                <span id="cart-total" class="cart-total-value">€0.00</span>
            </div>
            <div class="cart-name-row">
                <label for="cart-customer-name">Your name (for pickup)</label>
                <input id="cart-customer-name" type="text" placeholder="e.g. Yuki" maxlength="50" autocomplete="given-name" />
            </div>
            <button id="cart-checkout-btn" class="btn btn-primary cart-checkout-btn" disabled>
                Pay with Mollie
            </button>
            <p id="cart-error" class="cart-error"></p>
        </div>
    `;
    document.body.appendChild(drawer);

    // ─── Event Handlers ─────────────────────────────
    drawer.querySelector('#cart-close').addEventListener('click', () => toggleDrawer(false));

    const checkoutBtn = drawer.querySelector('#cart-checkout-btn');
    const nameInput = drawer.querySelector('#cart-customer-name');
    const errorEl = drawer.querySelector('#cart-error');

    // Enable/disable checkout based on name input
    nameInput.addEventListener('input', () => {
        checkoutBtn.disabled = !nameInput.value.trim() || Cart.count === 0;
        errorEl.textContent = '';
    });

    checkoutBtn.addEventListener('click', async () => {
        const name = nameInput.value.trim();
        if (!name) { errorEl.textContent = 'Please enter your name'; return; }
        if (Cart.count === 0) { errorEl.textContent = 'Cart is empty'; return; }

        checkoutBtn.disabled = true;
        checkoutBtn.textContent = 'Redirecting to payment…';
        errorEl.textContent = '';

        try {
            await Cart.checkout(name);
        } catch (e) {
            errorEl.textContent = e.message || 'Something went wrong';
            checkoutBtn.disabled = false;
            checkoutBtn.textContent = 'Pay with Mollie';
        }
    });

    // ─── Update UI on cart changes ──────────────────
    function updateCartUI() {
        const items = Cart.items;
        const count = Cart.count;
        const fabCount = document.getElementById('cart-fab-count');
        const fabEl = document.getElementById('cart-fab');
        const itemsContainer = document.getElementById('cart-items');
        const emptyMsg = document.getElementById('cart-empty-msg');
        const footer = document.getElementById('cart-footer');
        const totalEl = document.getElementById('cart-total');

        // FAB badge
        fabCount.textContent = count;
        fabEl.classList.toggle('has-items', count > 0);

        // Empty state
        if (items.length === 0) {
            emptyMsg.style.display = 'flex';
            footer.style.display = 'none';
            itemsContainer.innerHTML = '';
            return;
        }

        emptyMsg.style.display = 'none';
        footer.style.display = 'flex';
        totalEl.textContent = Cart.totalFormatted;

        // Update checkout button state
        checkoutBtn.disabled = !nameInput.value.trim() || count === 0;

        // Render items
        itemsContainer.innerHTML = items.map(item => `
            <div class="cart-item">
                <div class="cart-item-info">
                    <span class="cart-item-name">${item.name}</span>
                    <span class="cart-item-price">${item.price}</span>
                </div>
                <div class="cart-item-controls">
                    <button class="cart-qty-btn" data-action="dec" data-name="${item.name}">−</button>
                    <span class="cart-qty">${item.qty}</span>
                    <button class="cart-qty-btn" data-action="inc" data-name="${item.name}">+</button>
                </div>
            </div>
        `).join('');

        // Bind qty buttons
        itemsContainer.querySelectorAll('.cart-qty-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const name = btn.dataset.name;
                if (btn.dataset.action === 'inc') Cart.increment(name);
                else Cart.decrement(name);
            });
        });
    }

    window.addEventListener('cart-updated', updateCartUI);
    updateCartUI(); // Initial render
}

function toggleDrawer(open) {
    const drawer = document.getElementById('cart-drawer');
    const backdrop = document.getElementById('cart-backdrop');
    if (!drawer || !backdrop) return;

    if (open) {
        drawer.classList.add('open');
        backdrop.classList.add('open');
        document.body.style.overflow = 'hidden';
    } else {
        drawer.classList.remove('open');
        backdrop.classList.remove('open');
        document.body.style.overflow = '';
    }
}

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createCartDrawer);
} else {
    createCartDrawer();
}
