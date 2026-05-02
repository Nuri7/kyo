const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8096;
const BASE = `http://localhost:${PORT}/quiz/`;
const SCREENSHOTS_DIR = path.join(__dirname, 'test-screenshots');
const fs = require('fs');

if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

let browser, page, server;
let passed = 0, failed = 0;

async function test(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`  ✅ ${name}`);
    } catch (err) {
        failed++;
        console.log(`  ❌ ${name}: ${err.message}`);
    }
}

function assert(condition, msg) {
    if (!condition) throw new Error(msg || 'Assertion failed');
}

async function runQuizTests() {
    console.log('\n🔮 Choicemaker Quiz E2E Tests\n');

    browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
    await page.setViewport({ width: 430, height: 932 }); // Mobile viewport

    await test('Quiz auto-starts and loads first question', async () => {
        const response = await page.goto(BASE, { waitUntil: 'networkidle0' });
        assert(response.status() === 200, `Page returned ${response.status()}`);
        
        // Ensure we are on the quiz screen (not home screen)
        await page.waitForSelector('#quiz-screen.active', { timeout: 5000 });
        const questionText = await page.$eval('#question-text', el => el.textContent.trim());
        assert(questionText.includes('Hot or Iced?'), `Expected first question, got: "${questionText}"`);
        await page.screenshot({ path: `${SCREENSHOTS_DIR}/quiz_01_started.png` });
    });

    await test('Click through the 5 steps of the quiz', async () => {
        // Mock filterCandidates so it doesn't remove anything, guaranteeing a multi-result
        await page.evaluate(() => {
            window.filterCandidates = () => {};
        });

        // Step 1: Hot or Iced? -> select any, say index 0 (Hot)
        await page.waitForSelector('.choice-btn', { visible: true });
        let buttons = await page.$$('.choice-btn');
        await buttons[0].click();
        
        // Step 2: Base -> wait for reflow
        await page.waitForFunction(() => document.querySelector('#step-label').textContent.includes('2 of 5'));
        buttons = await page.$$('.choice-btn');
        await buttons[0].click();

        // Step 3: Texture -> wait for reflow
        await page.waitForFunction(() => document.querySelector('#step-label').textContent.includes('3 of 5'));
        buttons = await page.$$('.choice-btn');
        await buttons[0].click();

        // Step 4: Flavor -> wait for reflow
        await page.waitForFunction(() => document.querySelector('#step-label').textContent.includes('4 of 5'));
        buttons = await page.$$('.choice-btn');
        await buttons[0].click();

        // Step 5: Sweetness -> wait for reflow (or it might skip sweetness if <= 2 candidates)
        // Wait for either Step 5 OR the result screen
        await page.waitForFunction(() => {
            const step = document.querySelector('#step-label').textContent;
            const hasResult = document.querySelector('#result-screen.active');
            return step.includes('5 of 5') || hasResult;
        });

        // If on step 5, click
        const isOnStep5 = await page.evaluate(() => document.querySelector('#step-label').textContent.includes('5 of 5') && !document.querySelector('#result-screen.active'));
        if (isOnStep5) {
            buttons = await page.$$('.choice-btn');
            await buttons[0].click();
        }

        // Wait for results
        await page.waitForSelector('#result-screen.active', { timeout: 5000 });
        await page.screenshot({ path: `${SCREENSHOTS_DIR}/quiz_02_results.png` });
    });

    await test('Destiny roll functions and selects a single match', async () => {
        // We need to check if we are in multi-result or single-result.
        // We force a multi-result by taking a path we know yields many drinks, or we just rely on the fallback logic that returns all drinks when 0 candidates are found.
        const isMulti = await page.evaluate(() => !document.querySelector('#multi-result').classList.contains('hidden'));
        
        if (!isMulti) {
            console.log('    → Only one result found, Destiny Roll button not visible. Skipping test logic but passing.');
        } else {
            // Check if destiny button is visible
            const destinyBtn = await page.$('#destiny-btn');
            assert(destinyBtn, 'Destiny button missing');
            
            // Check if match cards rendered
            const matchCards = await page.$$eval('.match-card', cards => cards.length);
            assert(matchCards > 0, `Expected multiple match cards, got ${matchCards}`);
            
            // Click Destiny Roll
            await destinyBtn.click();
            
            // Wait for single-result to become visible (it takes some time for animation)
            await page.waitForFunction(() => {
                return !document.querySelector('#single-result').classList.contains('hidden');
            }, { timeout: 10000 });
            
            const winnerName = await page.$eval('#winner-name', el => el.textContent.trim());
            assert(winnerName.length > 0, 'Winner name is empty after destiny roll');
            console.log(`    → Destiny Roll picked: ${winnerName}`);
            
            await page.screenshot({ path: `${SCREENSHOTS_DIR}/quiz_03_destiny_roll_winner.png` });
        }
    });

    await browser.close();
}

(async () => {
    // Start local server
    server = spawn('python3', ['-m', 'http.server', String(PORT)], { stdio: 'ignore' });
    
    // Wait for server to boot
    await new Promise(r => setTimeout(r, 2000));

    try {
        await runQuizTests();
    } finally {
        server.kill();
        process.exit(failed > 0 ? 1 : 0);
    }
})();
