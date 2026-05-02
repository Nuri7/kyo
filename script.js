// ==========================================
// KYŌ Drink Oracle — Choicemaker Engine
// Fast decision-tree: 3–5 clicks to your match
// ==========================================

let DRINKS_DB = [];
let candidates = [];      // drinks remaining after each filter
let currentStep = 0;
let answers = [];          // [{ qIndex, value, label }]
const TOTAL_STEPS = 5;

// ──────────── Question Definitions ────────────

const QUESTIONS = [
    {
        id: 'temp',
        text: 'Hot or Iced?',
        layout: 'two',           // 2 huge stacked buttons
        options: [
            { value: 'hot',  emoji: '☕', label: 'Hot', sub: 'Warm & cozy' },
            { value: 'iced', emoji: '🧊', label: 'Iced', sub: 'Cool & refreshing' }
        ]
    },
    {
        id: 'base',
        text: 'Which base?',
        layout: 'grid',          // 2×2 grid
        options: [
            { value: 'matcha',  emoji: '🍵', label: 'Matcha',  sub: 'Green & earthy' },
            { value: 'hojicha', emoji: '🍂', label: 'Hojicha', sub: 'Roasted & nutty' },
            { value: 'coffee',  emoji: '☕', label: 'Coffee',  sub: 'Bold & classic' }
        ]
    },
    {
        id: 'texture',
        text: 'Texture?',
        layout: 'grid',
        options: [
            { value: 'foamy',      emoji: '☁️', label: 'Foamy & Cloudy', sub: 'Cold foam, clouds…' },
            { value: 'standard',   emoji: '🥛', label: 'Smooth & Standard', sub: 'Classic latte' },
            { value: 'refreshing', emoji: '🫧', label: 'Light & Fresh', sub: 'Soda-style, no milk' }
        ]
    },
    {
        id: 'flavor',
        text: 'Flavor vibe?',
        layout: 'grid',
        options: [
            { value: 'fruity',  emoji: '🍓', label: 'Fruity',  sub: 'Strawberry, mango…' },
            { value: 'floral',  emoji: '🌸', label: 'Floral',  sub: 'Lavender, jasmine…' },
            { value: 'dessert', emoji: '🍫', label: 'Dessert', sub: 'Vanilla, chocolate…' },
            { value: 'classic', emoji: '🍃', label: 'Classic', sub: 'Pure & earthy' }
        ]
    },
    {
        id: 'sweetness',
        text: 'Sweetness level?',
        layout: 'grid',
        options: [
            { value: 'high',   emoji: '🍰', label: 'Extra Sweet', sub: 'Full indulgence' },
            { value: 'medium', emoji: '🍯', label: 'Balanced',    sub: 'Just right' },
            { value: 'low',    emoji: '🌿', label: 'Light / None', sub: 'Natural flavors' }
        ]
    }
];

// ──────────── DOM References ────────────

const $ = id => document.getElementById(id);

const dom = {
    homeScreen:   $('home-screen'),
    quizScreen:   $('quiz-screen'),
    resultScreen: $('result-screen'),

    startBtn:     $('start-btn'),
    backBtn:      $('back-btn'),
    restartBtns:  document.querySelectorAll('.restart-btn'),

    dots:         $('progress-dots'),
    stepLabel:    $('step-label'),
    qText:        $('question-text'),
    optionsWrap:  $('options-container'),

    // Result elements
    singleResult:  $('single-result'),
    multiResult:   $('multi-result'),
    matchCards:    $('match-cards'),
    destinyBtn:   $('destiny-btn'),

    winnerImage:  $('winner-image'),
    winnerName:   $('winner-name'),
    winnerPrice:  $('winner-price'),
    winnerDesc:   $('winner-desc'),
    winnerReason: $('winner-reason'),
    winnerTags:   $('winner-tags'),

    toast:        $('toast')
};

// ──────────── Screen Management ────────────

function showScreen(name) {
    [dom.homeScreen, dom.quizScreen, dom.resultScreen].forEach(s => {
        s.classList.remove('active');
        s.classList.add('hidden');
    });
    const target = name === 'home' ? dom.homeScreen
                 : name === 'quiz' ? dom.quizScreen
                 : dom.resultScreen;
    target.classList.remove('hidden');
    target.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'instant' });
}

// ──────────── Init ────────────

async function init() {
    try {
        const pathPrefix = window.location.pathname.includes('/quiz') ? '../' : '';
        const res = await fetch(pathPrefix + 'drinks.json');
        const data = await res.json();
        DRINKS_DB = data.filter(d => d.active !== false).map(d => ({...d, image: pathPrefix + d.image}));
    } catch (e) {
        console.error('Failed to load drinks.json', e);
    }

    if (dom.startBtn) dom.startBtn.addEventListener('click', startQuiz);
    if (dom.backBtn) dom.backBtn.addEventListener('click', goBack);
    if (dom.restartBtns) dom.restartBtns.forEach(btn => btn.addEventListener('click', () => {
        if (window.location.pathname.includes('/quiz')) window.location.href = '../';
        else showScreen('home');
    }));
    if (dom.destinyBtn) dom.destinyBtn.addEventListener('click', destinyRoll);

    // Start marquee animation
    startMarquee();
}

function startQuiz() {
    currentStep = 0;
    answers = [];
    candidates = [...DRINKS_DB];
    showScreen('quiz');
    renderStep();
}

// ──────────── Filtering Logic ────────────

function filterCandidates(questionId, value) {
    if (value === '_any') return; // "Surprise me" — skip filter

    candidates = candidates.filter(drink => {
        const drinkTags = drink.tags[questionId];
        if (!drinkTags) return true;
        return drinkTags.includes(value);
    });
}

function shouldSkipSweetness() {
    return candidates.length <= 2;
}

// ──────────── Render Question ────────────

function renderStep() {
    const q = QUESTIONS[currentStep];

    // Skip sweetness if ≤2 drinks remain
    if (q.id === 'sweetness' && shouldSkipSweetness()) {
        showResults();
        return;
    }

    // Progress dots
    renderDots();
    dom.stepLabel.textContent = `Question ${currentStep + 1} of ${TOTAL_STEPS}`;

    // Question text
    dom.qText.textContent = q.text;
    dom.qText.classList.remove('slide-in');
    void dom.qText.offsetWidth; // force reflow
    dom.qText.classList.add('slide-in');

    // Options
    dom.optionsWrap.innerHTML = '';
    dom.optionsWrap.className = `options-wrap layout-${q.layout}`;
    dom.optionsWrap.classList.remove('slide-in');
    void dom.optionsWrap.offsetWidth;
    dom.optionsWrap.classList.add('slide-in');

    q.options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'choice-btn';
        btn.style.animationDelay = `${i * 0.06}s`;
        btn.innerHTML = `
            <span class="choice-emoji">${opt.emoji}</span>
            <span class="choice-label">${opt.label}</span>
            <span class="choice-sub">${opt.sub}</span>
        `;

        // Restore selection if going back
        const prev = answers.find(a => a.qIndex === currentStep);
        if (prev && prev.value === opt.value) {
            btn.classList.add('selected');
        }

        btn.addEventListener('click', () => selectOption(opt, i));
        dom.optionsWrap.appendChild(btn);
    });
}

function renderDots() {
    dom.dots.innerHTML = '';
    for (let i = 0; i < TOTAL_STEPS; i++) {
        const dot = document.createElement('span');
        dot.className = 'dot';
        if (i < currentStep) dot.classList.add('done');
        if (i === currentStep) dot.classList.add('active');
        dom.dots.appendChild(dot);
    }
}

// ──────────── Selection Handler ────────────

function selectOption(opt, idx) {
    // Visual feedback
    document.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('selected'));
    document.querySelectorAll('.choice-btn')[idx].classList.add('selected');

    // Record answer (replace if revisiting)
    answers = answers.filter(a => a.qIndex !== currentStep);
    answers.push({ qIndex: currentStep, questionId: QUESTIONS[currentStep].id, value: opt.value, label: opt.label });

    // Rebuild candidates from scratch (clean slate each time for back-navigation correctness)
    candidates = [...DRINKS_DB];
    answers.forEach(a => filterCandidates(a.questionId, a.value));

    // Advance
    setTimeout(() => {
        currentStep++;
        if (currentStep >= QUESTIONS.length) {
            showResults();
        } else {
            renderStep();
        }
    }, 250);
}

// ──────────── Back Navigation ────────────

function goBack() {
    if (currentStep > 0) {
        currentStep--;
        // Remove answer for current step if exists
        answers = answers.filter(a => a.qIndex !== currentStep);
        // Rebuild candidates
        candidates = [...DRINKS_DB];
        answers.forEach(a => filterCandidates(a.questionId, a.value));
        renderStep();
    } else {
        showScreen('home');
    }
}

// ──────────── Results ────────────

function showResults() {
    // If 0 candidates, relax last filter
    if (candidates.length === 0) {
        const lastAnswer = answers[answers.length - 1];
        if (lastAnswer) {
            answers = answers.filter(a => a.qIndex !== lastAnswer.qIndex);
            candidates = [...DRINKS_DB];
            answers.forEach(a => filterCandidates(a.questionId, a.value));
        }
        // Still 0? Show all as fallback
        if (candidates.length === 0) candidates = [...DRINKS_DB];
    }

    // PostHog analytics
    const topDrink = candidates[0];
    if (window.posthog && topDrink) {
        posthog.capture(`Recommended: ${topDrink.name}`, {
            drink_price: topDrink.price,
            answers: answers.map(a => `${a.questionId}=${a.value}`).join(','),
            total_matches: candidates.length
        });
        posthog.capture('Quiz Completed', { drink_name: topDrink.name });
    }

    showScreen('result');

    if (candidates.length === 1) {
        renderSingleResult(candidates[0]);
    } else {
        renderMultiResult(candidates.slice(0, 6)); // cap at 6
    }
}

function renderSingleResult(drink) {
    dom.singleResult.classList.remove('hidden');
    dom.multiResult.classList.add('hidden');
    fillWinnerCard(drink);
}

function renderMultiResult(drinks) {
    dom.singleResult.classList.add('hidden');
    dom.multiResult.classList.remove('hidden');
    dom.destinyBtn.classList.remove('hidden');

    dom.matchCards.innerHTML = '';
    drinks.forEach((drink, i) => {
        const card = document.createElement('div');
        card.className = 'match-card glass-panel-sm';
        card.style.animationDelay = `${i * 0.1}s`;
        card.innerHTML = `
            <div class="match-card-img">
                <img src="${drink.image}" alt="${drink.name}" loading="lazy">
            </div>
            <div class="match-card-info">
                <h3>${drink.name}</h3>
                <span class="match-price">${drink.price}</span>
                <p>${drink.desc}</p>
            </div>
        `;
        card.addEventListener('click', () => {
            dom.multiResult.classList.add('hidden');
            dom.singleResult.classList.remove('hidden');
            fillWinnerCard(drink);
        });
        dom.matchCards.appendChild(card);
    });
}

function fillWinnerCard(drink) {
    dom.winnerImage.src = drink.image || '';
    dom.winnerImage.style.display = drink.image ? 'block' : 'none';
    dom.winnerName.textContent = drink.name;
    dom.winnerPrice.textContent = drink.price;
    dom.winnerDesc.textContent = drink.desc;

    // Tags
    dom.winnerTags.innerHTML = '';
    const tempTag = drink.tags.temp.includes('iced') ? '🧊 Iced' : '🔥 Hot';
    const baseTag = drink.tags.base[0];
    [tempTag, baseTag].forEach(t => {
        const span = document.createElement('span');
        span.className = 'result-tag';
        span.textContent = t.charAt(0).toUpperCase() + t.slice(1);
        dom.winnerTags.appendChild(span);
    });

    // "Why it fits you" text
    const reasons = [];
    answers.forEach(a => {
        switch (a.questionId) {
            case 'temp':
                reasons.push(a.value === 'iced' ? 'something cool & refreshing' : 'something warm & cozy');
                break;
            case 'base':
                if (a.value !== '_any') reasons.push(`a ${a.label.toLowerCase()} base`);
                break;
            case 'texture':
                reasons.push(`${a.label.toLowerCase()} texture`);
                break;
            case 'flavor':
                reasons.push(`${a.label.toLowerCase()} flavors`);
                break;
            case 'sweetness':
                reasons.push(`${a.label.toLowerCase()} sweetness`);
                break;
        }
    });
    const reasonText = reasons.length > 0
        ? `You wanted ${reasons.join(', ')} — and ${drink.name} delivers exactly that.`
        : `The Oracle has spoken — ${drink.name} is your perfect match.`;
    dom.winnerReason.textContent = reasonText;

    // Animate in
    dom.singleResult.classList.remove('reveal');
    void dom.singleResult.offsetWidth;
    dom.singleResult.classList.add('reveal');
}

// ──────────── Destiny Roll ✨ ────────────

function destinyRoll() {
    const cards = dom.matchCards.querySelectorAll('.match-card');
    if (cards.length === 0) return;

    dom.destinyBtn.classList.add('hidden');

    // Rapid highlight cycle
    let cycles = 0;
    const maxCycles = 15 + Math.floor(Math.random() * 10);
    let idx = 0;

    const interval = setInterval(() => {
        cards.forEach(c => c.classList.remove('destiny-highlight'));
        cards[idx % cards.length].classList.add('destiny-highlight');
        idx++;
        cycles++;

        if (cycles >= maxCycles) {
            clearInterval(interval);
            const winner = candidates[idx % candidates.length];
            setTimeout(() => {
                cards.forEach(c => c.classList.remove('destiny-highlight'));
                dom.multiResult.classList.add('hidden');
                dom.singleResult.classList.remove('hidden');
                fillWinnerCard(winner);
            }, 400);
        }
    }, 80 + cycles * 8); // gradually slows down
}

// ──────────── Share ────────────

function copyResult() {
    const name = dom.winnerName.textContent;
    const text = `🍵 The KYŌ Oracle matched me with: ${name}!\nFind your perfect drink → https://nuri7.github.io/kyo/`;
    navigator.clipboard.writeText(text).then(() => {
        dom.toast.classList.add('show');
        setTimeout(() => dom.toast.classList.remove('show'), 2500);
    });
}

// ──────────── Marquee Animation ────────────

function startMarquee() {
    const marquee = document.querySelector('.drink-marquee');
    if (!marquee) return;

    let offset = 0;
    const speed = 0.5;
    const totalWidth = marquee.scrollWidth / 2;

    function tick() {
        offset -= speed;
        if (Math.abs(offset) >= totalWidth) offset = 0;
        marquee.style.transform = `translateX(${offset}px)`;
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

// ──────────── Boot ────────────
init();
