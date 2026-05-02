/**
 * KYŌ KLUB — E2E Test Suite for Mollie Ordering System
 * 
 * Tests the complete ordering flow:
 * 1. Drinks gallery loads with "Add to Order" buttons
 * 2. Adding items to cart updates FAB badge
 * 3. Cart drawer opens with correct items
 * 4. Quantity controls work
 * 5. Checkout creates a Mollie payment and redirects
 * 6. Success page renders correctly
 * 7. Backend API validation (error cases)
 */

const puppeteer = require('puppeteer');
const path = require('path');

const BASE = 'http://localhost:8095';
const API_BASE = 'https://kyoklubv.vercel.app';
const SCREENSHOTS_DIR = path.join(__dirname, 'test-screenshots');
const fs = require('fs');

// Create screenshots dir
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

let browser, page;
let passed = 0, failed = 0;
const results = [];

async function test(name, fn) {
    try {
        await fn();
        passed++;
        results.push({ name, status: '✅ PASS' });
        console.log(`  ✅ ${name}`);
    } catch (err) {
        failed++;
        results.push({ name, status: '❌ FAIL', error: err.message });
        console.log(`  ❌ ${name}: ${err.message}`);
    }
}

function assert(condition, msg) {
    if (!condition) throw new Error(msg || 'Assertion failed');
}

// ═══════════════════════════════════════════════════════
// API TESTS (Backend)
// ═══════════════════════════════════════════════════════

async function runApiTests() {
    console.log('\n🔌 API Tests\n');

    await test('POST /api/checkout — valid order returns checkoutUrl', async () => {
        const res = await fetch(`${API_BASE}/api/checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: [{ name: 'Iced Matcha Latte', price: '€6.50', qty: 1, image: 'test.png' }],
                customerName: 'E2E Test',
            }),
        });
        const data = await res.json();
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(data.checkoutUrl?.startsWith('https://www.mollie.com/') || data.checkoutUrl?.includes('/pay?url='), `No valid checkout URL: ${data.checkoutUrl}`);
        assert(data.orderId?.startsWith('KYO-'), `Invalid order ID: ${data.orderId}`);
    });

    await test('POST /api/checkout — rejects empty items', async () => {
        const res = await fetch(`${API_BASE}/api/checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: [], customerName: 'Test' }),
        });
        assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    await test('POST /api/checkout — rejects missing name', async () => {
        const res = await fetch(`${API_BASE}/api/checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: [{ name: 'Test', price: '€5.00', qty: 1, image: 'x.png' }],
                customerName: '',
            }),
        });
        assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    await test('POST /api/checkout — handles comma prices (€7,50)', async () => {
        const res = await fetch(`${API_BASE}/api/checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: [{ name: 'Comma Price', price: '€7,50', qty: 1, image: 'x.png' }],
                customerName: 'Comma Test',
            }),
        });
        const data = await res.json();
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(data.checkoutUrl, 'No checkout URL for comma price');
    });

    await test('POST /api/checkout — multi-item order sums correctly', async () => {
        const res = await fetch(`${API_BASE}/api/checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: [
                    { name: 'Matcha', price: '€6.50', qty: 2, image: 'a.png' },
                    { name: 'Hojicha', price: '€5.80', qty: 1, image: 'b.png' },
                ],
                customerName: 'Multi Item',
            }),
        });
        const data = await res.json();
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(data.checkoutUrl, 'No checkout URL for multi-item');
    });

    await test('GET /api/orders — returns 401 without auth', async () => {
        const res = await fetch(`${API_BASE}/api/orders`);
        assert(res.status === 401, `Expected 401, got ${res.status}`);
    });

    await test('GET /api/orders — returns 401 with wrong pin', async () => {
        const res = await fetch(`${API_BASE}/api/orders`, {
            headers: { 'x-admin-pin': 'wrong' },
        });
        assert(res.status === 401, `Expected 401, got ${res.status}`);
    });

    await test('GET /api/orders — returns orders with correct pin', async () => {
        const res = await fetch(`${API_BASE}/api/orders`, {
            headers: { 'x-admin-pin': 'kyoklub123' },
        });
        const data = await res.json();
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(Array.isArray(data), 'Expected array');
    });

    await test('POST /api/webhook/mollie — accepts webhook call', async () => {
        const res = await fetch(`${API_BASE}/api/webhook/mollie`, {
            method: 'POST',
            body: 'id=tr_fake_test_id',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        // Should return 200 even with invalid ID (to prevent Mollie retries)
        assert(res.status === 200, `Expected 200, got ${res.status}`);
    });

    await test('OPTIONS /api/checkout — CORS preflight returns correct headers', async () => {
        const res = await fetch(`${API_BASE}/api/checkout`, {
            method: 'OPTIONS',
            headers: {
                'Origin': 'https://nuri7.github.io',
                'Access-Control-Request-Method': 'POST',
            },
        });
        assert(res.status === 204, `Expected 204, got ${res.status}`);
        const origin = res.headers.get('access-control-allow-origin');
        assert(origin === 'https://nuri7.github.io', `CORS origin: ${origin}`);
    });
}

// ═══════════════════════════════════════════════════════
// BROWSER UI TESTS (Frontend)
// ═══════════════════════════════════════════════════════

async function runBrowserTests() {
    console.log('\n🌐 Browser UI Tests\n');

    browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
    await page.setViewport({ width: 430, height: 932 }); // iPhone 14 Pro Max

    // Collect console errors
    const consoleErrors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // ─── Test: Drinks page loads ────────────────────────
    await test('Drinks gallery page loads successfully', async () => {
        const response = await page.goto(`${BASE}/drinks/`, { waitUntil: 'networkidle2', timeout: 15000 });
        assert(response.status() === 200, `Page returned ${response.status()}`);
        await page.screenshot({ path: `${SCREENSHOTS_DIR}/01_drinks_page_loaded.png`, fullPage: true });
    });

    // ─── Test: Drink cards render ───────────────────────
    await test('Drink cards render with images', async () => {
        await page.waitForSelector('.drink-card', { timeout: 10000 });
        const cardCount = await page.$$eval('.drink-card', cards => cards.length);
        assert(cardCount > 0, `No drink cards found (expected > 0, got ${cardCount})`);
        console.log(`    → Found ${cardCount} drink cards`);
    });

    // ─── Test: Order buttons exist ──────────────────────
    await test('"+ Add to Order" buttons exist on drink cards', async () => {
        const btnCount = await page.$$eval('.order-btn', btns => btns.length);
        assert(btnCount > 0, `No order buttons found (expected > 0, got ${btnCount})`);
        const firstText = await page.$eval('.order-btn', btn => btn.textContent.trim());
        assert(firstText === '+', `Button text: "${firstText}"`);
        console.log(`    → Found ${btnCount} order buttons`);
    });

    // ─── Test: Cart FAB exists ──────────────────────────
    await test('Cart FAB button exists in DOM', async () => {
        const fab = await page.$('#cart-fab');
        assert(fab, 'Cart FAB not found');
        const isVisible = await page.$eval('#cart-fab', el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
        });
        assert(isVisible, 'Cart FAB is not visible');
    });

    // ─── Test: FAB badge starts at 0 ────────────────────
    await test('Cart FAB badge starts at 0', async () => {
        const count = await page.$eval('#cart-fab-count', el => el.textContent.trim());
        assert(count === '0', `Badge count: "${count}" (expected "0")`);
    });

    // ─── Test: Add first drink to cart ──────────────────
    await test('Clicking "+" adds item to cart', async () => {
        await page.click('.order-btn');
        await page.waitForFunction(() => {
            const btn = document.querySelector('.order-btn');
            return btn && btn.textContent.trim().includes('✓');
        }, { timeout: 3000 });
        
        const btnText = await page.$eval('.order-btn', btn => btn.textContent.trim());
        assert(btnText.includes('✓'), `Button should show "✓", got: "${btnText}"`);
        await page.screenshot({ path: `${SCREENSHOTS_DIR}/02_item_added.png` });
    });

    // ─── Test: FAB badge updates to 1 ───────────────────
    await test('Cart FAB badge updates to 1 after adding item', async () => {
        const count = await page.$eval('#cart-fab-count', el => el.textContent.trim());
        assert(count === '1', `Badge count: "${count}" (expected "1")`);

        const hasItemsClass = await page.$eval('#cart-fab', el => el.classList.contains('has-items'));
        assert(hasItemsClass, 'FAB should have "has-items" class');
    });

    // ─── Test: Cart drawer opens ────────────────────────
    await test('Clicking FAB opens cart drawer', async () => {
        await page.click('#cart-fab');
        await page.waitForSelector('.cart-drawer.open', { timeout: 3000 });
        
        const isOpen = await page.$('.cart-drawer.open');
        assert(isOpen, 'Cart drawer did not get "open" class');
        await page.screenshot({ path: `${SCREENSHOTS_DIR}/03_cart_drawer_open.png` });
    });

    // ─── Test: Cart shows correct item ──────────────────
    await test('Cart drawer shows the added item', async () => {
        const itemName = await page.$eval('.cart-item-name', el => el.textContent.trim());
        assert(itemName.length > 0, 'Cart item name is empty');
        
        const itemPrice = await page.$eval('.cart-item-price', el => el.textContent.trim());
        assert(itemPrice.includes('€'), `Price should contain €, got: "${itemPrice}"`);
        
        const qty = await page.$eval('.cart-qty', el => el.textContent.trim());
        assert(qty === '1', `Qty should be 1, got: "${qty}"`);
        
        console.log(`    → Cart item: ${itemName} ${itemPrice} x${qty}`);
    });

    // ─── Test: Cart total displays ──────────────────────
    await test('Cart total is displayed correctly', async () => {
        const total = await page.$eval('#cart-total', el => el.textContent.trim());
        assert(total.startsWith('€'), `Total should start with €, got: "${total}"`);
        assert(total !== '€0.00', 'Total should not be €0.00');
        console.log(`    → Cart total: ${total}`);
    });

    // ─── Test: Name input exists ────────────────────────
    await test('Name input field exists with correct label', async () => {
        const label = await page.$eval('.cart-name-row label', el => el.textContent.trim());
        assert(label.toLowerCase().includes('name'), `Label: "${label}"`);
        
        const placeholder = await page.$eval('#cart-customer-name', el => el.placeholder);
        assert(placeholder, 'Input should have a placeholder');
    });

    // ─── Test: Checkout button starts disabled ──────────
    await test('Checkout button is disabled without name', async () => {
        const disabled = await page.$eval('#cart-checkout-btn', el => el.disabled);
        assert(disabled, 'Checkout button should be disabled without name');
    });

    // ─── Test: Typing name enables checkout ─────────────
    await test('Typing name enables checkout button', async () => {
        await page.type('#cart-customer-name', 'E2E Tester');
        await page.waitForFunction(() => {
            return !document.querySelector('#cart-checkout-btn').disabled;
        }, { timeout: 3000 });
        
        const disabled = await page.$eval('#cart-checkout-btn', el => el.disabled);
        assert(!disabled, 'Checkout button should be enabled after name input');
        await page.screenshot({ path: `${SCREENSHOTS_DIR}/04_name_entered.png` });
    });

    // ─── Test: Quantity increment ───────────────────────
    await test('Increment button increases quantity', async () => {
        const incBtn = await page.$('.cart-qty-btn[data-action="inc"]');
        assert(incBtn, 'Increment button not found');
        await incBtn.click();
        await new Promise(r => setTimeout(r, 500));
        
        const qty = await page.$eval('.cart-qty', el => el.textContent.trim());
        assert(qty === '2', `Qty should be 2 after increment, got: "${qty}"`);
        
        // FAB should update too
        const fabCount = await page.$eval('#cart-fab-count', el => el.textContent.trim());
        assert(fabCount === '2', `FAB count should be 2, got: "${fabCount}"`);
    });

    // ─── Test: Quantity decrement ───────────────────────
    await test('Decrement button decreases quantity', async () => {
        const decBtn = await page.$('.cart-qty-btn[data-action="dec"]');
        assert(decBtn, 'Decrement button not found');
        await decBtn.click();
        await new Promise(r => setTimeout(r, 500));
        
        const qty = await page.$eval('.cart-qty', el => el.textContent.trim());
        assert(qty === '1', `Qty should be 1 after decrement, got: "${qty}"`);
    });

    // ─── Test: Backdrop closes drawer ───────────────────
    await test('Clicking backdrop closes cart drawer', async () => {
        // Click the visible part of the backdrop (top of screen, above the drawer)
        await page.mouse.click(215, 50);
        await new Promise(r => setTimeout(r, 600));
        
        const isOpen = await page.$('.cart-drawer.open');
        assert(!isOpen, 'Cart drawer should be closed after clicking backdrop');
    });

    // ─── Test: Reopen and checkout (Full Browser Navigation) ──────────────
    await test('Checkout button successfully redirects to Mollie', async () => {
        // Reopen drawer
        await page.click('#cart-fab');
        await page.waitForSelector('.cart-drawer.open', { timeout: 3000 });
        await new Promise(r => setTimeout(r, 600)); // wait for animation
        
        // Name should still be there
        const nameVal = await page.$eval('#cart-customer-name', el => el.value);
        assert(nameVal === 'E2E Tester', `Name lost on reopen: "${nameVal}"`);
        
        await page.screenshot({ path: `${SCREENSHOTS_DIR}/05_before_checkout.png` });
        
        // Setup request interception to mock the API response (bypassing CORS on localhost)
        await page.setRequestInterception(true);
        const mockCheckoutUrl = 'https://www.mollie.com/checkout/mock-test-id';
        
        const requestHandler = interceptedRequest => {
            if (interceptedRequest.isInterceptResolutionHandled()) return;
            const url = interceptedRequest.url();
            const method = interceptedRequest.method();
            
            if (url.includes('/api/checkout')) {
                if (method === 'OPTIONS') {
                    interceptedRequest.respond({
                        status: 204,
                        headers: {
                            'Access-Control-Allow-Origin': '*',
                            'Access-Control-Allow-Methods': 'POST, OPTIONS',
                            'Access-Control-Allow-Headers': 'Content-Type',
                        }
                    });
                } else if (method === 'POST') {
                    interceptedRequest.respond({
                        status: 200,
                        contentType: 'application/json',
                        headers: { 'Access-Control-Allow-Origin': '*' },
                        body: JSON.stringify({
                            checkoutUrl: mockCheckoutUrl,
                            orderId: 'KYO-E2E-MOCK'
                        })
                    });
                }
            } else {
                interceptedRequest.continue();
            }
        };
        page.on('request', requestHandler);

        // Click checkout button
        await page.$eval('#cart-checkout-btn', btn => btn.scrollIntoView({ block: 'center' }));
        await new Promise(r => setTimeout(r, 300));
        
        // We wait for navigation when we click
        const [response] = await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => null),
            page.evaluate(() => document.querySelector('#cart-checkout-btn').click())
        ]);
        
        // Turn off interception
        page.off('request', requestHandler);
        await page.setRequestInterception(false);
        
        const currentUrl = page.url();
        assert(currentUrl.startsWith('https://www.mollie.com/checkout/'), `Did not redirect to Mollie, stuck on: ${currentUrl}`);
        console.log(`    → Successfully redirected to: ${currentUrl}`);
    });

    // ─── Test: Success page ─────────────────────────────
    await test('Success page renders with order ID', async () => {
        await page.goto(`${BASE}/order/success.html?order=KYO-TEST123`, { waitUntil: 'networkidle2' });
        
        const orderId = await page.$eval('#order-id', el => el.textContent.trim());
        assert(orderId === 'KYO-TEST123', `Order ID: "${orderId}" (expected "KYO-TEST123")`);
        
        const title = await page.$eval('.success-title', el => el.textContent.trim());
        assert(title.includes('Order'), `Title should contain "Order": "${title}"`);
        
        await page.screenshot({ path: `${SCREENSHOTS_DIR}/07_success_page.png` });
    });

    // ─── Test: No console errors ────────────────────────
    await test('No critical JavaScript errors during tests', async () => {
        const realErrors = consoleErrors.filter(e => 
            !e.includes('favicon') && 
            !e.includes('manifest') && 
            !e.includes('service-worker') &&
            !e.includes('CORS') &&  // Expected on localhost
            !e.includes('ERR_FAILED') &&  // Expected on localhost (CORS-related)
            !e.includes('404')  // Missing assets on test server
        );
        if (realErrors.length > 0) {
            console.log(`    → Filtered errors: ${realErrors.join('; ')}`);
        }
        assert(realErrors.length === 0, `Console errors: ${realErrors.join('; ')}`);
    });

    await browser.close();
}

// ═══════════════════════════════════════════════════════
// Run all tests
// ═══════════════════════════════════════════════════════

(async () => {
    console.log('═══════════════════════════════════════════');
    console.log('  KYŌ KLUB — E2E Test Suite');
    console.log('  Mollie Ordering System');
    console.log('═══════════════════════════════════════════');

    await runApiTests();
    await runBrowserTests();

    console.log('\n═══════════════════════════════════════════');
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log('═══════════════════════════════════════════\n');

    // Print table
    console.log('| Test | Status |');
    console.log('|------|--------|');
    for (const r of results) {
        const errSuffix = r.error ? ` (${r.error.slice(0, 60)})` : '';
        console.log(`| ${r.name} | ${r.status}${errSuffix} |`);
    }

    console.log(`\n📸 Screenshots saved to: ${SCREENSHOTS_DIR}`);

    process.exit(failed > 0 ? 1 : 0);
})();
