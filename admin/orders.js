// ==========================================
// KYŌ KLUB — Orders Management Engine
// ==========================================

const OrdersManager = (() => {
    const API_BASE = 'https://kyoklubv.vercel.app';
    const ADMIN_PIN = 'kyoklub123'; // Must match STUDIO_PASSWORD on backend
    const REFRESH_INTERVAL = 15000; // 15 seconds

    let orders = [];
    let refreshTimer = null;
    let isTabActive = false;

    // Fulfillment workflow
    const STATUS_FLOW = ['pending', 'preparing', 'ready', 'picked-up'];
    const STATUS_LABELS = {
        'pending': '⏳ Pending',
        'preparing': '🔥 Preparing',
        'ready': '✅ Ready',
        'picked-up': '📦 Picked Up'
    };
    const STATUS_NEXT_LABELS = {
        'pending': '🔥 Start Preparing',
        'preparing': '✅ Mark Ready',
        'ready': '📦 Picked Up',
    };

    function escapeHtml(str) {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ─── Fetch Orders ───────────────────────────────────
    async function fetchOrders() {
        const filter = document.getElementById('orders-filter')?.value || 'today';
        const params = filter === 'all' ? '' : `?filter=${filter}`;

        try {
            const res = await fetch(`${API_BASE}/api/orders${params}`, {
                headers: { 'x-admin-pin': ADMIN_PIN }
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            orders = await res.json();

            // For "paid" filter, only show paid orders
            if (filter === 'paid') {
                orders = orders.filter(o => o.status === 'paid');
            }

            // Sort: active orders first (pending → preparing → ready), then completed
            orders.sort((a, b) => {
                const aIdx = STATUS_FLOW.indexOf(a.fulfillment);
                const bIdx = STATUS_FLOW.indexOf(b.fulfillment);
                // Put expired at the end
                const aSort = aIdx >= 0 ? aIdx : 99;
                const bSort = bIdx >= 0 ? bIdx : 99;
                if (aSort !== bSort) return aSort - bSort;
                // Within same status, newest first
                return new Date(b.createdAt) - new Date(a.createdAt);
            });

            renderOrders();
            updateKPIs();
        } catch (err) {
            console.error('Failed to fetch orders:', err);
            showOrdersError(err.message);
        }
    }

    // ─── Update Fulfillment Status ──────────────────────
    async function updateFulfillment(orderId, newStatus) {
        try {
            const res = await fetch(`${API_BASE}/api/orders/${orderId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-pin': ADMIN_PIN
                },
                body: JSON.stringify({ fulfillment: newStatus })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || `HTTP ${res.status}`);
            }

            // Refresh the order list
            await fetchOrders();
            showToast(`Order ${orderId} → ${STATUS_LABELS[newStatus] || newStatus}`, 'success');
        } catch (err) {
            console.error('Failed to update order:', err);
            showToast(`Update failed: ${err.message}`, 'error');
        }
    }

    // ─── Render Orders Grid ─────────────────────────────
    function renderOrders() {
        const grid = document.getElementById('orders-grid');
        if (!grid) return;

        if (orders.length === 0) {
            grid.innerHTML = `
                <div class="orders-empty">
                    <span class="orders-empty-icon">☕</span>
                    <p>No orders yet — time to relax!</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = orders.map(order => {
            const fulfillment = order.fulfillment || 'pending';
            const statusIdx = STATUS_FLOW.indexOf(fulfillment);
            const isPaid = order.status === 'paid';
            const isExpired = order.status === 'expired';
            const isActive = !isExpired && fulfillment !== 'picked-up';

            // Build items list
            const itemsHtml = (order.items || []).map(item => `
                <li>
                    <span>
                        <span class="order-item-name">${escapeHtml(item.name)}</span>
                        <span class="order-item-qty">×${item.qty}</span>
                    </span>
                    <span class="order-item-price">${escapeHtml(item.price)}</span>
                </li>
            `).join('');

            // Calculate total
            const totalValue = order.amount?.value 
                ? `€${order.amount.value}` 
                : '—';

            // Time display
            const createdDate = new Date(order.createdAt);
            const timeStr = createdDate.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
            const dateStr = createdDate.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });

            // Fulfillment action buttons
            let footerHtml = '';
            if (isActive && statusIdx < STATUS_FLOW.length - 1) {
                const nextStatus = STATUS_FLOW[statusIdx + 1];
                const nextLabel = STATUS_NEXT_LABELS[fulfillment] || nextStatus;
                footerHtml = `
                    <div class="order-card-footer">
                        <button class="order-action-btn next-status"
                                data-order-id="${escapeHtml(order.orderId)}"
                                data-next-status="${nextStatus}">
                            ${nextLabel}
                        </button>
                    </div>
                `;
            }

            // Payment + Fulfillment badges
            const paymentBadge = isPaid 
                ? '<span class="order-payment-badge paid">💳 Paid</span>'
                : isExpired 
                    ? '<span class="order-payment-badge unpaid">⌛ Expired</span>'
                    : '<span class="order-payment-badge unpaid">⏳ Awaiting</span>';

            const cardClass = isExpired ? 'status-expired' : `status-${fulfillment}`;

            return `
                <div class="order-card ${cardClass}">
                    <div class="order-card-header">
                        <div>
                            <span class="order-id">${escapeHtml(order.orderId)}</span>
                            <span class="order-customer"> — ${escapeHtml(order.customerName || 'Guest')}</span>
                        </div>
                        <div>
                            <span class="order-status-badge ${fulfillment}">${STATUS_LABELS[fulfillment] || fulfillment}</span>
                            ${paymentBadge}
                        </div>
                    </div>
                    <div class="order-card-body">
                        <ul class="order-items-list">
                            ${itemsHtml}
                        </ul>
                        <div class="order-meta">
                            <span class="order-total">${totalValue}</span>
                            <span class="order-time">${dateStr} ${timeStr}</span>
                        </div>
                    </div>
                    ${footerHtml}
                </div>
            `;
        }).join('');

        // Attach event listeners
        grid.querySelectorAll('.order-action-btn.next-status').forEach(btn => {
            btn.addEventListener('click', async () => {
                const orderId = btn.dataset.orderId;
                const nextStatus = btn.dataset.nextStatus;
                btn.disabled = true;
                btn.textContent = '⏳ Updating...';
                await updateFulfillment(orderId, nextStatus);
            });
        });
    }

    // ─── Update KPI Summary ─────────────────────────────
    function updateKPIs() {
        const paidOrders = orders.filter(o => o.status === 'paid');

        // Total orders (paid only for meaningful count)
        const totalEl = document.getElementById('kpi-total');
        if (totalEl) totalEl.textContent = orders.length;

        // Pending
        const pendingEl = document.getElementById('kpi-pending');
        if (pendingEl) {
            const count = orders.filter(o => o.fulfillment === 'pending' && o.status === 'paid').length;
            pendingEl.textContent = count;
            pendingEl.style.color = count > 0 ? '#e67e22' : '';
        }

        // Preparing
        const preparingEl = document.getElementById('kpi-preparing');
        if (preparingEl) {
            const count = orders.filter(o => o.fulfillment === 'preparing').length;
            preparingEl.textContent = count;
            preparingEl.style.color = count > 0 ? '#2980b9' : '';
        }

        // Revenue
        const revenueEl = document.getElementById('kpi-revenue');
        if (revenueEl) {
            const total = paidOrders.reduce((sum, o) => {
                const val = parseFloat(o.amount?.value || '0');
                return sum + val;
            }, 0);
            revenueEl.textContent = `€${total.toFixed(2)}`;
        }
    }

    // ─── Error State ────────────────────────────────────
    function showOrdersError(message) {
        const grid = document.getElementById('orders-grid');
        if (!grid) return;
        grid.innerHTML = `
            <div class="orders-empty">
                <span class="orders-empty-icon">⚠️</span>
                <p>Failed to load orders: ${escapeHtml(message)}</p>
                <button class="action-btn" onclick="OrdersManager.refresh()" style="margin-top:1rem;">🔄 Retry</button>
            </div>
        `;
    }

    // ─── Toast (reuse existing if available) ────────────
    function showToast(message, type = 'info') {
        const toast = document.getElementById('studio-toast');
        if (!toast) return;
        toast.textContent = message;
        toast.className = 'studio-toast show ' + type;
        setTimeout(() => { toast.className = 'studio-toast'; }, 3500);
    }

    // ─── Auto-refresh ───────────────────────────────────
    function startAutoRefresh() {
        stopAutoRefresh();
        refreshTimer = setInterval(() => {
            if (isTabActive) fetchOrders();
        }, REFRESH_INTERVAL);
    }

    function stopAutoRefresh() {
        if (refreshTimer) {
            clearInterval(refreshTimer);
            refreshTimer = null;
        }
    }

    // ─── Init ───────────────────────────────────────────
    function init() {
        // Tab switching: detect when Orders tab becomes active
        document.querySelectorAll('.admin-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                if (tab.dataset.tab === 'tab-orders') {
                    isTabActive = true;
                    fetchOrders();
                    startAutoRefresh();
                } else {
                    isTabActive = false;
                    stopAutoRefresh();
                }
            });
        });

        // Refresh button
        const refreshBtn = document.getElementById('orders-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                refreshBtn.disabled = true;
                refreshBtn.textContent = '⏳ Loading...';
                await fetchOrders();
                refreshBtn.disabled = false;
                refreshBtn.textContent = '🔄 Refresh';
            });
        }

        // Filter change
        const filterSelect = document.getElementById('orders-filter');
        if (filterSelect) {
            filterSelect.addEventListener('change', () => {
                fetchOrders();
            });
        }

        // If orders tab is already active on load (it won't be, but just in case)
        const activeTab = document.querySelector('.admin-tab.active');
        if (activeTab?.dataset.tab === 'tab-orders') {
            isTabActive = true;
            fetchOrders();
            startAutoRefresh();
        }
    }

    // Public API
    return {
        init,
        refresh: fetchOrders
    };
})();

// Boot when DOM ready
document.addEventListener('DOMContentLoaded', () => OrdersManager.init());
