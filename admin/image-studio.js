// ==========================================
// KYŌ KLUB — Admin Image Studio Engine
// ==========================================

const ImageStudio = (() => {
    // --- State ---
    const API_BASE = 'https://kyoklubv.vercel.app'; // Vercel backend
    const STUDIO_PIN = 'kyoklub123'; // Must match STUDIO_PASSWORD on backend
    let githubToken = ''; // No longer needed client-side
    let generatedImageUrl = null;
    let generatedImageB64 = null;
    let selectedDrinkIndex = -1;
    let imageHistory = JSON.parse(localStorage.getItem('kyo_image_history') || '[]');

    // --- Drinks DB (shared with main app) ---
    let DRINKS = [];
    let menuDirty = false;

    // Warn before leaving with unsaved changes
    window.addEventListener('beforeunload', e => {
        if (menuDirty) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    // --- Style Presets ---
    const PRESETS = {
        product: "Professional product photography, studio lighting, clean white background, high-end café menu photo, 4K quality, no text or labels",
        artistic: "Artistic food photography, dramatic natural lighting, moody atmosphere, shallow depth of field, editorial style",
        minimal: "Minimalist Japanese aesthetic, clean composition, zen-like simplicity, muted natural tones, wabi-sabi",
        moody: "Dark moody atmosphere, rich shadows, golden hour lighting, vintage film grain, intimate café setting"
    };

    let activePreset = 'product';

    // --- Reference Images ---
    function getRef(key) {
        return {
            image: localStorage.getItem(`kyo_ref_${key}_img`) || null,
            description: localStorage.getItem(`kyo_ref_${key}_desc`) || ''
        };
    }

    function setRef(key, image, description) {
        try {
            if (image) localStorage.setItem(`kyo_ref_${key}_img`, image);
            if (description !== undefined) localStorage.setItem(`kyo_ref_${key}_desc`, description);
        } catch (e) {
            console.warn('localStorage quota exceeded, clearing old data...');
            // Clear history to make room for references
            localStorage.removeItem('kyo_image_history');
            imageHistory = [];
            try {
                if (image) localStorage.setItem(`kyo_ref_${key}_img`, image);
                if (description !== undefined) localStorage.setItem(`kyo_ref_${key}_desc`, description);
            } catch (_) {
                showToast('Image too large to store. Try a smaller file.', 'error');
            }
        }
    }

    // --- Collect active reference images ---
    function getActiveRefImages() {
        const refs = [];
        const mapping = []; // tracks which ref key is at which index
        const useCup = document.getElementById('use-cup-ref')?.checked;
        const useBg = document.getElementById('use-bg-ref')?.checked;
        const useLogo = document.getElementById('use-logo-ref')?.checked;

        if (useCup && getRef('cup').image) {
            refs.push(getRef('cup').image); // data:image/... URI
            mapping.push('cup');
        }
        if (useBg && getRef('background').image) {
            refs.push(getRef('background').image);
            mapping.push('background');
        }
        if (useLogo && getRef('logo').image) {
            refs.push(getRef('logo').image);
            mapping.push('logo');
        }
        return { refs, mapping };
    }

    // --- Prompt Builder ---
    function buildPrompt(drink, customPrompt) {
        if (customPrompt && customPrompt.trim()) return customPrompt;

        const { mapping } = getActiveRefImages();
        const useBg = document.getElementById('use-bg-ref')?.checked;
        const useCup = document.getElementById('use-cup-ref')?.checked;
        const useLogo = document.getElementById('use-logo-ref')?.checked;
        const bgRef = getRef('background');
        const cupRef = getRef('cup');
        const logoRef = getRef('logo');

        // Helper: find the 1-based image index for a given ref key
        const imgIdx = (key) => mapping.indexOf(key) + 1;

        let prompt = `Professional product photography of "${drink.name}" drink. ${drink.desc}. `;

        // Cup reference — combine image ref + text description for maximum adherence
        if (useCup && cupRef.image && imgIdx('cup') > 0) {
            const cupDesc = cupRef.description ? ` (${cupRef.description})` : '';
            prompt += `The drink MUST be served in the EXACT same glass/cup as shown in image ${imgIdx('cup')}${cupDesc}. Replicate the exact shape, height, curvature, and transparency of that glass precisely. `;
        } else if (useCup && cupRef.description) {
            prompt += `Served in: ${cupRef.description}. `;
        } else {
            prompt += `Served in a modern, clear glass suitable for a Japanese café. `;
        }

        // Background reference
        if (useBg && bgRef.image && imgIdx('background') > 0) {
            prompt += `The background and surface MUST match the setting shown in image ${imgIdx('background')}. `;
        } else if (useBg && bgRef.description) {
            prompt += `Background: ${bgRef.description}. `;
        } else {
            prompt += `On a clean, elegant surface with soft natural daylight. `;
        }

        // Logo reference
        if (useLogo && logoRef.image && imgIdx('logo') > 0) {
            prompt += `Subtly incorporate the logo from image ${imgIdx('logo')} into the scene, etched on the glass or printed on a coaster. `;
        } else if (useLogo && logoRef.description) {
            prompt += `Logo: ${logoRef.description}. `;
        }

        prompt += `${PRESETS[activePreset]}. Extremely photorealistic, 4K, high-end commercial food photography, perfect lighting, highly detailed textures.`;
        return prompt;
    }

    // --- API Calls (via Vercel backend) ---
    async function generateImage(prompt, inputImages = []) {
        log('⏳ Sending to Gemini via backend...', 'info');

        const response = await fetch(`${API_BASE}/api/studio/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt,
                referenceImages: inputImages,
                pin: STUDIO_PIN
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `API error ${response.status}`);
        }

        const result = await response.json();

        if (!result.image) {
            throw new Error('No image returned from server');
        }

        return {
            b64: result.image,
            revisedPrompt: prompt
        };
    }

    // --- GitHub Push (via Vercel backend) ---
    async function pushToGitHub(imagePath, base64Content) {
        const response = await fetch(`${API_BASE}/api/studio/replace`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                imagePath,
                imageBase64: base64Content,
                pin: STUDIO_PIN
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `API error ${response.status}`);
        }

        return await response.json();
    }

    // --- Image Download ---
    function downloadImage(b64, filename) {
        const link = document.createElement('a');
        link.href = `data:image/png;base64,${b64}`;
        link.download = filename || 'kyo_drink_image.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // --- History ---
    function addToHistory(drinkName, b64) {
        // Create a small thumbnail to avoid localStorage quota issues
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const thumbSize = 150;
            canvas.width = thumbSize;
            canvas.height = thumbSize * (img.height / img.width);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const thumbB64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];

            const entry = {
                drink: drinkName,
                timestamp: new Date().toISOString(),
                thumbnail: thumbB64
            };
            imageHistory.unshift(entry);
            if (imageHistory.length > 20) imageHistory.pop();
            try {
                localStorage.setItem('kyo_image_history', JSON.stringify(imageHistory));
            } catch (e) {
                // If still too large, trim older entries
                while (imageHistory.length > 5) imageHistory.pop();
                try { localStorage.setItem('kyo_image_history', JSON.stringify(imageHistory)); } catch (_) {}
            }
            renderHistory();
        };
        img.src = `data:image/png;base64,${b64}`;
    }

    // --- Toast ---
    function showToast(message, type = 'info') {
        const toast = document.getElementById('studio-toast');
        if (!toast) return;
        toast.textContent = message;
        toast.className = 'studio-toast show ' + type;
        setTimeout(() => { toast.className = 'studio-toast'; }, 3500);
    }

    // --- Log ---
    function log(message, type = 'info') {
        const logEl = document.getElementById('gen-log');
        if (!logEl) return;
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        logEl.appendChild(entry);
        logEl.scrollTop = logEl.scrollHeight;
    }

    // --- Init UI ---
    async function init() {
        try {
            const res = await fetch('../drinks.json');
            const data = await res.json();
            DRINKS = data.map(d => ({...d, image: '../' + d.image}));
        } catch(e) {
            showToast('Failed to load drinks.json', 'error');
            console.error(e);
        }
        populateDrinkSelector();
        setupPresets();
        setupGenerateBtn();
        setupRefManager();
        setupTabs();
        renderHistory();
        renderMenuGrid();
        setupAdminActions();
    }

    function setupAdminActions() {
        const addBtn = document.getElementById('add-drink-btn');
        const saveBtn = document.getElementById('save-menu-btn');
        
        if(addBtn) {
            addBtn.addEventListener('click', () => {
                DRINKS.push({
                    name: "New Custom Drink",
                    price: "€0.00",
                    image: "../images/cold_drinks/placeholder.png",
                    desc: "A brand new drink.",
                    type: "special",
                    tags: { temp: ["iced", "hot"], base: ["surprise"], sweetness: ["medium"], texture: ["standard"], flavor: ["classic"], mood: ["relaxed"] },
                    galleryTags: ["special"],
                    galleryVibe: ["classic"],
                    galleryTemp: ["iced", "hot"],
                    active: true
                });
                menuDirty = true;
                renderMenuGrid();
                populateDrinkSelector();
                
                // Scroll to bottom
                setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 100);
            });
        }
        
        if(saveBtn) {
            saveBtn.addEventListener('click', async () => {
                saveBtn.textContent = 'Saving...';
                saveBtn.disabled = true;
                showToast('Pushing menu updates to GitHub...', 'info');
                
                try {
                    // Remove the '../' from images before saving!
                    const cleanedDrinks = DRINKS.map(d => {
                        let img = d.image;
                        if(img.startsWith('../')) img = img.substring(3);
                        return { ...d, image: img };
                    });
                    
                    const res = await fetch(API_BASE + '/api/studio/save-menu', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ drinksJson: cleanedDrinks, pin: STUDIO_PIN })
                    });
                    
                    if(res.ok) {
                        menuDirty = false;
                        showToast('Menu saved to Server successfully!', 'success');
                    } else {
                        const err = await res.json();
                        throw new Error(err.error || 'Failed to save');
                    }
                } catch(e) {
                    showToast('Failed to save menu: ' + e.message, 'error');
                }
                
                saveBtn.textContent = '💾 Save Menu to Server';
                saveBtn.disabled = false;
            });
        }
    }

    // --- Helpers ---
    function escapeHtml(str) {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
    }

    // --- Menu Manager ---
    function renderMenuGrid() {
        const grid = document.getElementById('menu-grid');
        if (!grid) return;
        grid.innerHTML = '';

        DRINKS.forEach((drink, index) => {
            const isHot = drink.image.includes('hot_drinks');
            const card = document.createElement('div');
            const isActive = drink.active !== false;
            card.className = `menu-card ${isActive ? '' : 'inactive'}`;
            if (!isActive) card.style.opacity = '0.5';
            
            card.innerHTML = `
                <span class="menu-card-badge ${isHot ? 'hot' : 'cold'}">${isHot ? 'Hot' : 'Cold'}</span>
                <img class="menu-card-img" src="${drink.image}" alt="${drink.name}"
                     onerror="this.outerHTML='<div class=\\'menu-card-img missing\\'>🍵</div>'">
                <div class="menu-card-info" style="padding-top:0.5rem; display:flex; flex-direction:column; gap:0.3rem;">
                    <input type="text" class="edit-name-input" data-idx="${index}" value="${escapeHtml(drink.name)}" style="font-weight:bold; font-size:1rem; padding:0.2rem; border:1px solid #ddd; border-radius:4px;" />
                    <input type="text" class="edit-price-input" data-idx="${index}" value="${escapeHtml(drink.price)}" style="color:var(--matcha-green); font-weight:bold; padding:0.2rem; border:1px solid #ddd; border-radius:4px;" />
                </div>
                <label style="font-size:0.8rem; margin:0.3rem 0.5rem; display:flex; align-items:center; gap:0.3rem; cursor:pointer;">
                    <input type="checkbox" class="edit-active-toggle" data-idx="${index}" ${isActive ? 'checked' : ''}> Active / In Stock
                </label>
                <div class="menu-card-actions" style="margin-top:0.2rem; justify-content:space-between; padding:0.5rem; border-top:1px solid #eee;">
                    <div style="display:flex; gap:0.2rem;">
                        <button class="menu-ai-btn" data-idx="${index}" title="Generate with AI">🤖</button>
                        <button class="menu-upload-btn" data-idx="${index}" title="Upload image">📤</button>
                        <button class="menu-download-btn" data-idx="${index}" title="Download image">💾</button>
                    </div>
                    <button class="menu-del-btn" data-idx="${index}" title="Remove Drink" style="background:#ffecec; color:#d32f2f; border:none; padding:0.3rem 0.5rem; border-radius:4px; cursor:pointer; transition:background 0.2s;">🗑️</button>
                </div>
            `;
            grid.appendChild(card);
        });

        // Add event listeners for new inputs
        grid.querySelectorAll('.edit-name-input').forEach(input => {
            input.addEventListener('change', e => {
                DRINKS[e.target.dataset.idx].name = e.target.value;
                menuDirty = true;
                populateDrinkSelector();
            });
        });
        grid.querySelectorAll('.edit-price-input').forEach(input => {
            input.addEventListener('change', e => {
                DRINKS[e.target.dataset.idx].price = e.target.value;
                menuDirty = true;
            });
        });
        grid.querySelectorAll('.edit-active-toggle').forEach(input => {
            input.addEventListener('change', e => {
                DRINKS[e.target.dataset.idx].active = e.target.checked;
                menuDirty = true;
                renderMenuGrid(); // Re-render to update opacity
            });
        });
        grid.querySelectorAll('.menu-del-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                if(confirm(`Are you sure you want to remove "${DRINKS[idx].name}"?`)) {
                    DRINKS.splice(idx, 1);
                    menuDirty = true;
                    renderMenuGrid();
                    populateDrinkSelector();
                }
            });
        });

        // Hidden file input for uploads
        let uploadInput = document.getElementById('menu-upload-input');
        if (!uploadInput) {
            uploadInput = document.createElement('input');
            uploadInput.type = 'file';
            uploadInput.accept = 'image/*';
            uploadInput.id = 'menu-upload-input';
            uploadInput.style.display = 'none';
            document.body.appendChild(uploadInput);
        }

        // AI generate → switch to Image Studio with drink pre-selected
        grid.querySelectorAll('.menu-ai-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                // Switch to Image Studio tab
                document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                const studioTab = document.querySelector('[data-tab="tab-studio"]');
                const studioContent = document.getElementById('tab-studio');
                if (studioTab) studioTab.classList.add('active');
                if (studioContent) studioContent.classList.add('active');
                // Select the drink
                const sel = document.getElementById('drink-select');
                if (sel) {
                    sel.value = idx;
                    sel.dispatchEvent(new Event('change'));
                }
                showToast(`Selected "${DRINKS[idx].name}" — edit prompt and generate!`, 'info');
            });
        });

        // Upload replacement image
        let activeUploadIdx = -1;
        grid.querySelectorAll('.menu-upload-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                activeUploadIdx = parseInt(btn.dataset.idx);
                uploadInput.click();
            });
        });

        uploadInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file || activeUploadIdx < 0) return;
            const drink = DRINKS[activeUploadIdx];

            // Show the uploaded image immediately in the card
            const reader = new FileReader();
            reader.onload = (ev) => {
                const cards = grid.querySelectorAll('.menu-card');
                if (cards[activeUploadIdx]) {
                    const imgEl = cards[activeUploadIdx].querySelector('.menu-card-img');
                    if (imgEl) {
                        if (imgEl.tagName === 'DIV') {
                            // Replace missing placeholder with img
                            const newImg = document.createElement('img');
                            newImg.className = 'menu-card-img';
                            newImg.src = ev.target.result;
                            newImg.alt = drink.name;
                            imgEl.replaceWith(newImg);
                        } else {
                            imgEl.src = ev.target.result;
                        }
                    }
                }
                showToast(`Image updated for "${drink.name}". Use Push to GitHub to deploy.`, 'success');
            };
            reader.readAsDataURL(file);
            uploadInput.value = '';
        });

        // Download current image
        grid.querySelectorAll('.menu-download-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                const drink = DRINKS[idx];
                const link = document.createElement('a');
                link.href = drink.image;
                link.download = drink.name.toLowerCase().replace(/\s+/g, '_') + '.png';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });
        });
    }

    function setupTabs() {
        document.querySelectorAll('.admin-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                const target = document.getElementById(tab.dataset.tab);
                if (target) target.classList.add('active');
            });
        });
    }

    function populateDrinkSelector() {
        const sel = document.getElementById('drink-select');
        if (!sel) return;
        sel.innerHTML = '<option value="-1">— Select a drink —</option>';
        DRINKS.forEach((d, i) => {
            sel.innerHTML += `<option value="${i}">${d.name} (${d.price})</option>`;
        });
        sel.addEventListener('change', () => {
            selectedDrinkIndex = parseInt(sel.value);
            updateCurrentPreview();
            autoGeneratePrompt();
        });
    }

    function updateCurrentPreview() {
        const container = document.getElementById('current-preview');
        if (!container) return;
        if (selectedDrinkIndex < 0) {
            container.innerHTML = '<div class="preview-placeholder"><span class="placeholder-icon">🍵</span>Select a drink to preview</div>';
            return;
        }
        const drink = DRINKS[selectedDrinkIndex];
        container.innerHTML = `<img src="${drink.image}" alt="${drink.name}" onerror="this.parentElement.innerHTML='<div class=\\'preview-placeholder\\'><span class=\\'placeholder-icon\\'>⚠️</span>Image not found</div>'">`;
    }

    function autoGeneratePrompt() {
        const textarea = document.getElementById('prompt-input');
        if (!textarea || selectedDrinkIndex < 0) return;
        const drink = DRINKS[selectedDrinkIndex];
        textarea.value = buildPrompt(drink, '');
    }



    function setupPresets() {
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activePreset = btn.dataset.preset;
                autoGeneratePrompt();
            });
        });
    }

    function setupGenerateBtn() {
        const btn = document.getElementById('generate-btn');
        if (!btn) return;

        btn.addEventListener('click', async () => {
            if (selectedDrinkIndex < 0) { showToast('Please select a drink first', 'error'); return; }

            const drink = DRINKS[selectedDrinkIndex];
            const customPrompt = document.getElementById('prompt-input')?.value || '';
            const prompt = customPrompt.trim() || buildPrompt(drink, '');

            // Collect reference images
            const { refs, mapping } = getActiveRefImages();

            btn.classList.add('loading');
            btn.disabled = true;
            log(`Generating image for "${drink.name}"...`, 'info');
            if (refs.length > 0) {
                log(`📷 Using ${refs.length} reference image(s): ${mapping.join(', ')}`, 'info');
            }

            try {
                const result = await generateImage(prompt, refs);
                generatedImageB64 = result.b64;
                generatedImageUrl = `data:image/png;base64,${result.b64}`;

                // Show preview
                const container = document.getElementById('generated-preview');
                if (container) {
                    container.innerHTML = `<img src="${generatedImageUrl}" alt="Generated ${drink.name}">`;
                }

                // Enable action buttons
                document.querySelectorAll('.post-gen-action').forEach(b => b.disabled = false);

                log(`✓ Image generated successfully!`, 'success');
                showToast('Image generated!', 'success');

                // Save to history (async, won't block UI)
                addToHistory(drink.name, result.b64);
            } catch (err) {
                log(`✗ Error: ${err.message}`, 'error');
                showToast(`Generation failed: ${err.message}`, 'error');
            } finally {
                btn.classList.remove('loading');
                btn.disabled = false;
            }
        });

        // Replace Current Image button — pushes directly to GitHub via backend
        document.getElementById('replace-btn')?.addEventListener('click', async () => {
            if (!generatedImageB64 || selectedDrinkIndex < 0) return;
            const drink = DRINKS[selectedDrinkIndex];
            const btn = document.getElementById('replace-btn');

            btn.disabled = true;
            btn.textContent = '⏳ Replacing...';
            log(`🚀 Replacing image for "${drink.name}" in GitHub repo...`, 'info');

            try {
                const result = await pushToGitHub(drink.image, generatedImageB64);

                // Update the current preview in the Image Studio
                const currentPreview = document.getElementById('current-preview');
                if (currentPreview) {
                    currentPreview.innerHTML = `<img src="data:image/png;base64,${generatedImageB64}" alt="${drink.name}">`;
                }

                // Update the menu grid card
                const menuCards = document.querySelectorAll('#menu-grid .menu-card');
                if (menuCards[selectedDrinkIndex]) {
                    const imgEl = menuCards[selectedDrinkIndex].querySelector('.menu-card-img');
                    if (imgEl && imgEl.tagName === 'IMG') {
                        imgEl.src = `data:image/png;base64,${generatedImageB64}`;
                    }
                }

                log(`✅ Image replaced in GitHub repo!`, 'success');
                log(`📂 Path: ${result.path || drink.image}`, 'info');
                showToast(`Image replaced for "${drink.name}"! GitHub Pages will redeploy automatically.`, 'success');
            } catch (err) {
                log(`✗ Replace failed: ${err.message}`, 'error');
                showToast(`Replace failed: ${err.message}`, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = '✅ Replace Current Image';
            }
        });

        // Download button
        document.getElementById('download-btn')?.addEventListener('click', () => {
            if (!generatedImageB64) return;
            const drink = DRINKS[selectedDrinkIndex];
            const filename = drink ? drink.name.toLowerCase().replace(/\s+/g, '_') + '.png' : 'drink.png';
            downloadImage(generatedImageB64, filename);
            showToast('Image downloaded!', 'success');
        });

        // GitHub push button
        document.getElementById('push-github-btn')?.addEventListener('click', async () => {
            if (!generatedImageB64) {
                showToast('No image to push', 'error');
                return;
            }
            const drink = DRINKS[selectedDrinkIndex];
            if (!drink) return;

            const btn = document.getElementById('push-github-btn');
            btn.disabled = true;
            btn.textContent = '⏳ Pushing...';
            log(`Pushing image to GitHub for "${drink.name}"...`, 'info');

            try {
                await pushToGitHub(drink.image, generatedImageB64);
                log('✓ Pushed to GitHub successfully!', 'success');
                showToast('Pushed to GitHub! Deploy will start automatically.', 'success');
            } catch (err) {
                log(`✗ GitHub push failed: ${err.message}`, 'error');
                showToast(`Push failed: ${err.message}`, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = '🚀 Push to GitHub';
            }
        });
    }



    function setupRefManager() {
        ['background', 'cup', 'logo'].forEach(key => {
            const fileInput = document.getElementById(`ref-${key}-file`);
            const preview = document.getElementById(`ref-${key}-preview`);
            const descInput = document.getElementById(`ref-${key}-desc`);
            const clearBtn = document.getElementById(`ref-${key}-clear`);

            if (!fileInput) return;

            // Load saved
            const ref = getRef(key);
            if (ref.image && preview) {
                preview.innerHTML = `<img src="${ref.image}" alt="${key} reference">`;
            }
            if (ref.description && descInput) {
                descInput.value = ref.description;
            }

            // Upload handler
            preview?.addEventListener('click', () => fileInput.click());

            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    // Compress the image to save localStorage space
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const maxDim = 800;
                        let w = img.width, h = img.height;
                        if (w > maxDim || h > maxDim) {
                            if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
                            else { w = Math.round(w * maxDim / h); h = maxDim; }
                        }
                        canvas.width = w;
                        canvas.height = h;
                        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                        const compressedUrl = canvas.toDataURL('image/jpeg', 0.8);
                        setRef(key, compressedUrl);
                        if (preview) preview.innerHTML = `<img src="${compressedUrl}" alt="${key} reference">`;
                        showToast(`${key} reference uploaded!`, 'success');
                    };
                    img.src = ev.target.result;
                };
                reader.readAsDataURL(file);
            });

            // Description save
            descInput?.addEventListener('blur', () => {
                setRef(key, undefined, descInput.value);
            });

            // Clear
            clearBtn?.addEventListener('click', () => {
                localStorage.removeItem(`kyo_ref_${key}_img`);
                localStorage.removeItem(`kyo_ref_${key}_desc`);
                if (preview) preview.innerHTML = `<div class="upload-hint"><span class="hint-icon">📷</span>Click to upload</div>`;
                if (descInput) descInput.value = '';
                showToast(`${key} reference cleared`, 'info');
            });
        });
    }



    function renderHistory() {
        const grid = document.getElementById('history-grid');
        if (!grid) return;
        if (imageHistory.length === 0) {
            grid.innerHTML = '<p style="color:var(--text-light);font-style:italic;grid-column:1/-1">No images generated yet</p>';
            return;
        }
        grid.innerHTML = imageHistory.map((entry, i) => `
            <div class="history-thumb" data-index="${i}" title="${entry.drink} — ${new Date(entry.timestamp).toLocaleString()}">
                <img src="data:image/png;base64,${entry.b64}" alt="${entry.drink}">
                <div class="thumb-label">${entry.drink}</div>
            </div>
        `).join('');

        grid.querySelectorAll('.history-thumb').forEach(thumb => {
            thumb.addEventListener('click', () => {
                const idx = parseInt(thumb.dataset.index);
                const entry = imageHistory[idx];
                if (!entry) return;
                generatedImageB64 = entry.b64;
                generatedImageUrl = `data:image/png;base64,${entry.b64}`;
                const container = document.getElementById('generated-preview');
                if (container) container.innerHTML = `<img src="${generatedImageUrl}" alt="${entry.drink}">`;
                document.querySelectorAll('.post-gen-action').forEach(b => b.disabled = false);
                showToast(`Loaded: ${entry.drink}`, 'info');
            });
        });
    }

    return { init, DRINKS };
})();

// Boot when DOM ready
document.addEventListener('DOMContentLoaded', () => ImageStudio.init());
