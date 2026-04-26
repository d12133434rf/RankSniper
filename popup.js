const API = 'https://ranksniperweb-production.up.railway.app';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

const SEO_KEYWORDS = {
  'restaurant': ['best restaurant in [City]', 'fresh ingredients', 'online ordering', 'family restaurant in [City]', 'lunch and dinner in [City]', 'takeout and delivery', 'casual dining in [City]', 'best food in [City]', 'neighborhood restaurant in [City]', 'affordable dining in [City]', 'local favorite in [City]', 'dine in restaurant [City]'],
  'barber shop': ["men's haircut in [City]", 'beard trim in [City]', 'hot towel shave', 'best barber in [City]', 'skin fade in [City]', 'walk-in barber in [City]', 'kids haircut in [City]', 'barber near me', 'lineup and edge up', 'affordable haircut in [City]', 'fresh cuts in [City]', 'hair fade in [City]'],
  'hair salon': ['hair salon in [City]', 'balayage in [City]', 'keratin treatment in [City]', 'haircut and blowout in [City]', 'highlights in [City]', 'hair extensions in [City]', 'color correction in [City]', 'bridal hair in [City]', 'best hair salon in [City]', 'hair coloring in [City]', 'salon near me', 'women haircut in [City]'],
  'nail salon': ['nail salon in [City]', 'gel manicure in [City]', 'acrylic nails in [City]', 'nail art in [City]', 'pedicure in [City]', 'dip powder nails in [City]', 'luxury pedicure in [City]', 'best nail salon in [City]', 'nail extensions in [City]', 'sns nails in [City]', 'clean nail salon in [City]', 'affordable nails in [City]'],
  'auto shop': ['auto repair in [City]', 'brake repair in [City]', 'oil change in [City]', 'transmission repair in [City]', 'check engine light in [City]', 'tire rotation in [City]', 'car inspection in [City]', 'engine repair in [City]', 'AC repair in [City]', 'honest mechanic in [City]', 'affordable auto repair in [City]', 'same day auto service in [City]'],
  'dental office': ['dentist in [City]', 'teeth whitening in [City]', 'emergency dentist in [City]', 'dental implants in [City]', 'teeth cleaning in [City]', 'cosmetic dentist in [City]', 'family dentist in [City]', 'Invisalign in [City]', 'affordable dentist in [City]', 'dental crowns in [City]', 'accepting new patients in [City]', 'best dentist in [City]'],
  'gym': ['gym in [City]', 'personal trainer in [City]', 'fitness classes in [City]', 'weight loss gym in [City]', 'gym near me', '24 hour gym in [City]', 'strength training in [City]', 'yoga classes in [City]', 'affordable gym in [City]', 'workout classes in [City]', 'fitness center in [City]', 'bodybuilding gym in [City]'],
  'spa': ['massage in [City]', 'deep tissue massage in [City]', 'couples massage in [City]', 'hot stone massage in [City]', 'best spa in [City]', 'relaxation massage in [City]', 'prenatal massage in [City]', 'facial in [City]', 'day spa in [City]', 'swedish massage in [City]', 'massage therapy in [City]', 'spa near me'],
  'retail store': ['boutique in [City]', 'gift shop in [City]', 'unique gifts in [City]', 'locally owned store in [City]', 'same day pickup in [City]', 'affordable shopping in [City]', 'best store in [City]', 'shop local in [City]', 'small business in [City]', 'quality products in [City]', 'online and in store shopping', 'best deals in [City]'],
  'real estate': ['real estate agent in [City]', 'homes for sale in [City]', 'buy a home in [City]', 'sell my home in [City]', 'first time homebuyer in [City]', 'home valuation in [City]', 'luxury homes in [City]', 'investment properties in [City]', 'top realtor in [City]', 'best real estate agent in [City]', 'local real estate expert in [City]', 'property listings in [City]'],
  'law firm': ['lawyer in [City]', 'personal injury lawyer in [City]', 'free consultation in [City]', 'family lawyer in [City]', 'criminal defense attorney in [City]', 'estate planning in [City]', 'immigration lawyer in [City]', 'business attorney in [City]', 'divorce lawyer in [City]', 'affordable attorney in [City]', 'law firm in [City]', 'experienced lawyer in [City]'],
  'medical office': ['doctor in [City]', 'primary care in [City]', 'same day appointments in [City]', 'accepting new patients in [City]', 'urgent care in [City]', 'family doctor in [City]', 'physical exam in [City]', 'walk in clinic in [City]', 'telehealth in [City]', 'affordable healthcare in [City]', 'best doctor in [City]', 'insurance accepted'],
  'other': ['best service in [City]', 'top rated in [City]', 'near me', 'locally owned in [City]', 'same day service in [City]', 'free consultation in [City]', 'affordable in [City]', 'trusted in [City]', 'experienced team in [City]', 'best in [City]', 'highly rated in [City]', 'small business in [City]']
};

// ── Gemini API call (used by manual draft tab) ───────────────────────────────
async function callGeminiPopup(reviewData, instruction, previousResponse) {
  const result = await new Promise(resolve => chrome.storage.local.get(['geminiApiKey', 'ranksniperProfile'], resolve));
  const apiKey = result.geminiApiKey;
  if (!apiKey) throw new Error('No Gemini API key. Add it in the Profile tab.');
  const p = result.ranksniperProfile || {};
  const biz = p.businessName || 'Our Business';
  const city = p.city || 'our city';
  const type = p.businessType || 'local business';
  const tone = p.tone || 'friendly';
  const rawFirst = (reviewData.reviewerName || 'Customer').split(' ')[0];
  const firstName = rawFirst.length === 1 ? 'there' : rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1).toLowerCase();
  const custom = p.customInstructions ? '\nAdditional instructions: ' + p.customInstructions : '';
  const keywords = p.keywords || p.services || '';

  let prompt;
  if (instruction && previousResponse) {
    prompt = 'You wrote this response to a Google review for ' + biz + ' in ' + city + ':\n\n"' + previousResponse + '"\n\nThe user wants you to change it: "' + instruction + '"\n\nRewrite the response keeping it natural and human. Start with "Hi ' + firstName + ',". Under 150 words. Never use em dashes, hyphens, or any kind of dash. Never use the word thrilled, delighted, or excited. Include city (' + city + ') and business name (' + biz + ') naturally.' + custom + '\n\nWrite only the new response, nothing else.';
  } else {
    const variationSeeds = [
      'Start by addressing what they said specifically, then end with an invitation.',
      'Lead with something you are actually doing about it, then acknowledge their experience.',
      'Start warm, be direct about the issue, end brief.',
      'Acknowledge the specific complaint first. Then one sentence on what you are fixing. Then a warm close.',
      'Open with their name and jump straight to the point. No fluff.'
    ];
    const seed = variationSeeds[Math.floor(Math.random() * variationSeeds.length)];
    const sentimentInstruction = reviewData.rating <= 2
      ? 'This is a negative review. Do NOT start with "We are so sorry" or "We apologize" — find a different, more human way to acknowledge the issue. Reference the specific complaint they made (' + reviewData.reviewText.substring(0, 60) + '). Do not use phrases like "looking into it", "we take pride", "we strive to", or "we are committed to". Sound like the actual owner wrote this in 30 seconds, not a PR team.'
      : reviewData.rating === 3
      ? 'This is a mixed review. Acknowledge what they liked and what missed. Be specific to their review. Sound genuine.'
      : 'This is a positive review. Thank them warmly. Reference something specific they mentioned. Keep it brief and real.';
    const kwPrompt = keywords ? ' If one or two of these keywords fit naturally into a sentence, include them — but only if they sound organic, never force them: ' + keywords + '.' : '';
    prompt = 'Write a Google review response for ' + biz + ' (' + type + ') in ' + city + '. Tone: ' + tone + '.\n\nStart with "Hi ' + firstName + ',".\n' + sentimentInstruction + '\nStructure hint: ' + seed + '\n' + kwPrompt + '\nRules: Under 100 words. No dashes of any kind. No corporate filler. Do not use: thrilled, delighted, excited, wonderful, amazing, fantastic, cherished, means the world, we look forward, we hope to see you, thank you for sharing, thank you for taking the time, we are committed, it is our goal, rest assured, we take pride, we pride ourselves, we strive to, do not hesitate. Write like a real business owner texting a response, not a marketing department.' + custom + '\n\nReview (' + reviewData.rating + '/5): "' + reviewData.reviewText + '"\n\nWrite only the response, nothing else.';
  }

  const res = await fetch(GEMINI_URL + '?key=' + apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 200, temperature: 0.7 } })
  });
  if (!res.ok) { const err = await res.json(); throw new Error(err?.error?.message || 'Gemini API error'); }
  const data = await res.json();
  let output = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Could not generate response.';
  output = output.replace(/\bthrilled\b/gi, 'happy').replace(/\bdelighted\b/gi, 'glad').replace(/\bwonderful\b/gi, 'great').replace(/\bfantastic\b/gi, 'great').replace(/\bamazing\b/gi, 'great').replace(/ - /g, ' ').replace(/—/g, '');
  return output;
}

function scoreResponsePopup(text, profile) {
  let score = 44;
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).length;
  if (words >= 60 && words <= 120) score += 10;
  else if (words >= 40 && words < 60) score += 5;
  else if (words > 120 && words <= 160) score += 3;
  else if (words < 40) score -= 8;
  if (lower.startsWith('hi ') && !lower.startsWith('hi there')) score += 5;
  else if (lower.startsWith('hi there')) score += 1;
  if (profile?.city && lower.includes(profile.city.split(',')[0].trim().toLowerCase())) score += 8;
  if (profile?.businessName && lower.includes(profile.businessName.toLowerCase())) score += 8;
  const hasCTA = lower.includes('come back') || lower.includes('visit us') || lower.includes('see you') ||
    lower.includes('give us another') || lower.includes('contact us') || lower.includes('stop by') ||
    lower.includes('welcome you back') || lower.includes('hope to see') || lower.includes('love to have you');
  if (hasCTA) score += 6;
  if (!text.includes('\u2014') && !text.includes(' - ')) score += 3;
  const kwSources = [profile?.keywords, profile?.services].filter(Boolean).join(',');
  if (kwSources) {
    const kwList = kwSources.split(',').map(k => k.trim().replace(/\[City\]/gi, '').trim().toLowerCase()).filter(Boolean);
    const kwFound = kwList.filter(k => k && lower.includes(k)).length;
    score += Math.min(kwFound * 4, 22);
  }
  const genericPhrases = ['we strive to', 'we apologize for any inconvenience', 'at your earliest convenience',
    'do not hesitate', 'please do not hesitate', 'we are committed to', 'it is our goal',
    'we take pride', 'rest assured', 'we value your feedback', 'thank you for bringing this to our attention',
    'thrilled', 'delighted', 'means the world', 'thank you for sharing', 'thank you for taking the time',
    'we pride ourselves', 'it means a lot', 'reviews like yours'];
  score -= genericPhrases.filter(p => lower.includes(p)).length * 5;
  if (!lower.includes('hi') && !lower.includes('thank')) score -= 8;
  return Math.min(Math.max(Math.round(score), 0), 100);
}

document.addEventListener('DOMContentLoaded', () => {

  chrome.storage.local.get(['rsToken', 'rsUser', 'rsPlan'], async result => {
    if (result.rsToken && result.rsUser) {
      try {
        const res = await fetch(API + '/api/auth/me', { headers: { 'Authorization': 'Bearer ' + result.rsToken } });
        if (res.ok) {
          const data = await res.json();
          const freshPlan = data.user?.plan || 'free';
          chrome.storage.local.set({ rsPlan: freshPlan, ranksniperPlan: freshPlan });
          showMainApp(result.rsUser, freshPlan);
        } else {
          chrome.storage.local.remove(['rsToken', 'rsUser', 'rsPlan', 'ranksniperPlan']);
          showLoginScreen();
        }
      } catch (err) {
        showMainApp(result.rsUser, result.rsPlan || 'free');
      }
    } else {
      showLoginScreen();
    }
  });

  document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('login-btn');
    const errorEl = document.getElementById('login-error');
    if (!email || !password) { showError('Please enter your email and password.'); return; }
    btn.disabled = true; btn.textContent = 'Logging in...'; errorEl.style.display = 'none';
    try {
      const res = await fetch(API + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const data = await res.json();
      if (!res.ok) { showError(data.error || 'Login failed. Please try again.'); btn.disabled = false; btn.textContent = 'Log In'; return; }
      if (data.user.plan !== 'pro') { showError('No active subscription. Visit getranksniper.com to subscribe.'); btn.disabled = false; btn.textContent = 'Log In'; return; }
      chrome.storage.local.set({ rsToken: data.token, rsUser: data.user, rsPlan: data.user.plan, ranksniperPlan: data.user.plan }, () => { showMainApp(data.user, data.user.plan); });
    } catch (err) { showError('Network error. Check your connection.'); btn.disabled = false; btn.textContent = 'Log In'; }
  });

  document.getElementById('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('login-btn').click(); });

  function showError(msg) { const el = document.getElementById('login-error'); el.textContent = msg; el.style.display = 'block'; }

  function showLoginScreen() {
    document.getElementById('login-screen').style.display = 'block';
    document.getElementById('main-app').style.display = 'none';
    document.getElementById('plan-badge').textContent = 'Free';
  }

  function showMainApp(user, plan) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    document.getElementById('user-email-display').textContent = user.email;
    const badge = document.getElementById('plan-badge');
    if (plan === 'pro') { badge.textContent = 'PRO'; badge.style.color = '#22c55e'; badge.style.borderColor = '#22c55e50'; document.getElementById('upgrade-section').style.display = 'none'; }
    else { badge.textContent = 'Free'; badge.style.color = '#60a5fa'; document.getElementById('upgrade-section').style.display = 'block'; }
    document.getElementById('usage-text').textContent = plan === 'pro' ? 'Unlimited responses' : 'Free plan — upgrade for unlimited';
    document.getElementById('usage-fill').style.width = plan === 'pro' ? '100%' : '0%';
    loadProfiles(() => {});
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]) { chrome.storage.local.get(['rsToken'], r => { chrome.tabs.sendMessage(tabs[0].id, { type: 'RS_AUTH_UPDATE', plan, token: r.rsToken || null }).catch(() => {}); }); }
    });
  }

  document.getElementById('logout-btn').addEventListener('click', () => {
    chrome.storage.local.remove(['rsToken', 'rsUser', 'rsPlan', 'ranksniperPlan'], () => { showLoginScreen(); });
  });

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
      if (tab.dataset.tab === 'history') loadHistory();
    });
  });

  let profiles = {};
  let activeProfileId = null;

  document.getElementById('businessType').addEventListener('change', function() {
    const type = this.value;
    if (!type) return;
    const keywordsField = document.getElementById('keywords');
    if (!keywordsField.dataset.manuallyEdited) { keywordsField.value = (SEO_KEYWORDS[type] || SEO_KEYWORDS['other']).slice(0, 5).join(', '); }
    renderKeywordSuggestions(type, keywordsField.value);
  });

  document.getElementById('keywords').addEventListener('input', function() {
    this.dataset.manuallyEdited = 'true';
    renderKeywordSuggestions(document.getElementById('businessType').value, this.value);
  });

  function resetKeywordsFlag() { document.getElementById('keywords').dataset.manuallyEdited = ''; }

  function renderKeywordSuggestions(type, currentKeywords) {
    const container = document.getElementById('keyword-suggestions');
    if (!container) return;
    const allKeywords = SEO_KEYWORDS[type] || SEO_KEYWORDS['other'];
    const current = currentKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    const suggestions = allKeywords.filter(k => !current.includes(k.toLowerCase()));
    const label = document.getElementById('chips-label');
    if (label) label.style.display = suggestions.length > 0 ? 'block' : 'none';
    container.innerHTML = suggestions.slice(0, 6).map(k => `<span class="keyword-chip" data-keyword="${k}">${k}</span>`).join('');
    container.querySelectorAll('.keyword-chip').forEach(chip => {
      chip.addEventListener('click', function() {
        const kw = this.dataset.keyword;
        const field = document.getElementById('keywords');
        const existing = field.value.trim().split(',').map(k => k.trim().toLowerCase());
        if (existing.includes(kw.toLowerCase())) return;
        field.value = field.value.trim() ? field.value.trim() + ', ' + kw : kw;
        field.dataset.manuallyEdited = 'true';
        renderKeywordSuggestions(document.getElementById('businessType').value, field.value);
      });
    });
  }

  function loadProfiles(cb) {
    chrome.storage.sync.get(['rsProfiles', 'rsActiveProfile'], syncResult => {
      chrome.storage.local.get(['ranksniperUsage', 'rsPlan'], localResult => {
        const result = { ...localResult, ...syncResult };
        profiles = result.rsProfiles || {};
        activeProfileId = result.rsActiveProfile || null;
        if (Object.keys(profiles).length === 0) {
          chrome.storage.local.get(['ranksniperProfile'], old => {
            if (old.ranksniperProfile) {
              const id = 'profile_' + Date.now();
              profiles[id] = { ...old.ranksniperProfile, profileName: old.ranksniperProfile.businessName || 'Main Profile' };
              activeProfileId = id;
              chrome.storage.sync.set({ rsProfiles: profiles, rsActiveProfile: id });
            }
            renderProfileSelector(); if (cb) cb(result);
          });
        } else { renderProfileSelector(); if (cb) cb(result); }
      });
    });
  }

  function renderProfileSelector() {
    const sel = document.getElementById('profile-select');
    sel.innerHTML = '';
    const ids = Object.keys(profiles);
    if (ids.length === 0) { sel.innerHTML = '<option value="">No profiles</option>'; clearForm(); return; }
    ids.forEach(id => { const opt = document.createElement('option'); opt.value = id; opt.textContent = profiles[id].profileName || profiles[id].businessName || 'Unnamed'; if (id === activeProfileId) opt.selected = true; sel.appendChild(opt); });
    const currentId = activeProfileId && profiles[activeProfileId] ? activeProfileId : ids[0];
    activeProfileId = currentId; sel.value = currentId;
    fillForm(profiles[currentId]);
    chrome.storage.local.set({ ranksniperProfile: profiles[currentId] });
  }

  function fillForm(p) {
    if (!p) return clearForm();
    resetKeywordsFlag();
    document.getElementById('profileName').value = p.profileName || '';
    document.getElementById('businessName').value = p.businessName || '';
    document.getElementById('city').value = p.city || '';
    document.getElementById('businessType').value = p.businessType || '';
    document.getElementById('keywords').value = p.keywords || p.services || '';
    document.getElementById('tone').value = p.tone || 'friendly';
    document.getElementById('customInstructions').value = p.customInstructions || '';
    renderKeywordSuggestions(p.businessType || '', p.keywords || p.services || '');
  }

  function clearForm() {
    resetKeywordsFlag();
    ['profileName','businessName','city','keywords','customInstructions'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('businessType').value = '';
    document.getElementById('tone').value = 'friendly';
    document.getElementById('keyword-suggestions').innerHTML = '';
  }

  document.getElementById('profile-select').addEventListener('change', e => {
    activeProfileId = e.target.value; fillForm(profiles[activeProfileId]);
    chrome.storage.sync.set({ rsActiveProfile: activeProfileId }); chrome.storage.local.set({ ranksniperProfile: profiles[activeProfileId] });
  });

  document.getElementById('btn-new-profile').addEventListener('click', () => {
    const id = 'profile_' + Date.now();
    profiles[id] = { profileName: 'New Profile', businessName: '', city: '', businessType: '', keywords: '', tone: 'friendly', customInstructions: '' };
    activeProfileId = id;
    chrome.storage.sync.set({ rsProfiles: profiles, rsActiveProfile: id });
    renderProfileSelector(); document.getElementById('profile-select').value = id; fillForm(profiles[id]); document.getElementById('profileName').focus();
  });

  document.getElementById('btn-delete-profile').addEventListener('click', () => {
    if (!activeProfileId || Object.keys(profiles).length <= 1) { alert('You need at least one profile.'); return; }
    if (!confirm('Delete this profile?')) return;
    delete profiles[activeProfileId]; activeProfileId = Object.keys(profiles)[0] || null;
    chrome.storage.sync.set({ rsProfiles: profiles, rsActiveProfile: activeProfileId }); chrome.storage.local.set({ ranksniperProfile: activeProfileId ? profiles[activeProfileId] : null });
    renderProfileSelector();
  });

  document.getElementById('save-profile').addEventListener('click', () => {
    const profile = { profileName: document.getElementById('profileName').value.trim() || document.getElementById('businessName').value.trim() || 'My Profile', businessName: document.getElementById('businessName').value.trim(), city: document.getElementById('city').value.trim(), businessType: document.getElementById('businessType').value, keywords: document.getElementById('keywords').value.trim(), services: document.getElementById('keywords').value.trim(), tone: document.getElementById('tone').value, customInstructions: document.getElementById('customInstructions').value.trim() };
    if (!activeProfileId) activeProfileId = 'profile_' + Date.now();
    profiles[activeProfileId] = profile;
    const saveBtn = document.getElementById('save-profile');
    saveBtn.textContent = 'Saving...'; saveBtn.disabled = true;
    chrome.storage.sync.set({ rsProfiles: profiles, rsActiveProfile: activeProfileId }, () => {
      chrome.storage.local.set({ ranksniperProfile: profile });
      if (chrome.runtime.lastError) { saveBtn.textContent = 'Error'; saveBtn.disabled = false; return; }
      saveBtn.textContent = 'Saved!'; renderProfileSelector();
      setTimeout(() => { saveBtn.textContent = 'Save Profile'; saveBtn.disabled = false; }, 2000);
    });
  });

  function loadHistory() {
    chrome.storage.local.get(['rsHistory'], result => {
      const history = result.rsHistory || [];
      const list = document.getElementById('history-list');
      if (history.length === 0) { list.innerHTML = '<div class="history-empty">No responses yet. Generate your first AI response!</div>'; return; }
      const stars = r => r <= 1 ? '1 star' : r <= 2 ? '2 stars' : r <= 3 ? '3 stars' : r <= 4 ? '4 stars' : '5 stars';
      list.innerHTML = history.map(h => `<div class="history-item"><div class="history-meta"><span class="history-name">${h.reviewerName} - ${h.business}</span><span class="history-date">${h.date}</span></div><div class="history-rating">${stars(h.rating)} | "${h.reviewText}..."</div><div class="history-response" onclick="navigator.clipboard.writeText(this.dataset.text);this.style.color='#22c55e';setTimeout(()=>this.style.color='',1500)" data-text="${h.response.replace(/"/g, '&quot;')}" title="Click to copy">${h.response}</div></div>`).join('');
    });
  }

  document.getElementById('clear-history').addEventListener('click', () => {
    if (!confirm('Clear all response history?')) return;
    chrome.storage.local.set({ rsHistory: [] }, () => loadHistory());
  });

  // ── Manual Draft Tab ───────────────────────────────────────────────────────
  let manualRating = 5;

  const stars = document.querySelectorAll('#star-picker span');
  function setStars(val) {
    manualRating = val;
    document.getElementById('manual-rating').value = val;
    stars.forEach(s => s.classList.toggle('active', parseInt(s.dataset.val) <= val));
  }
  setStars(5);
  stars.forEach(s => {
    s.addEventListener('click', () => setStars(parseInt(s.dataset.val)));
    s.addEventListener('mouseover', () => stars.forEach(st => st.classList.toggle('active', parseInt(st.dataset.val) <= parseInt(s.dataset.val))));
    s.addEventListener('mouseout', () => setStars(manualRating));
  });

  // Track current manual review data for saving on copy
  let manualCurrentReviewData = null;

  async function generateManual(instruction, previousResponse) {
    const reviewerName = document.getElementById('manual-name').value.trim() || 'Customer';
    const reviewText = document.getElementById('manual-review').value.trim();
    const rating = manualRating;
    if (!reviewText) { alert('Please paste a review first.'); return; }
    const btn = document.getElementById('manual-generate-btn');
    btn.disabled = true; btn.textContent = 'Generating...';
    try {
      const reviewData = { reviewerName, rating, reviewText };
      const response = await callGeminiPopup(reviewData, instruction || null, previousResponse || null);
      const box = document.getElementById('manual-response-box');
      const textarea = document.getElementById('manual-response-text');
      const scoreEl = document.getElementById('manual-score');
      textarea.value = response;
      box.style.display = 'block';

      const storedProfile = await new Promise(resolve => chrome.storage.local.get(['ranksniperProfile'], r => resolve(r.ranksniperProfile || {})));
      const score = scoreResponsePopup(response, storedProfile);
      const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
      scoreEl.textContent = 'Score: ' + score + '/100';
      scoreEl.style.background = color + '20'; scoreEl.style.border = '1px solid ' + color; scoreEl.style.color = color;

      // Show keywords used
      const kwEl = document.getElementById('manual-keywords-used');
      if (kwEl) {
        const found = [];
        const lower = response.toLowerCase();
        if (storedProfile.city && lower.includes(storedProfile.city.toLowerCase())) found.push(storedProfile.city);
        if (storedProfile.businessName && lower.includes(storedProfile.businessName.toLowerCase())) found.push(storedProfile.businessName);
        if (storedProfile.keywords || storedProfile.services) {
          const kwList = (storedProfile.keywords || storedProfile.services).split(',').map(k => k.trim()).filter(Boolean);
          kwList.forEach(k => { if (k && lower.includes(k.toLowerCase())) found.push(k); });
        }
        kwEl.innerHTML = found.length > 0
          ? found.map(k => '<span style="background:#1e3a5f;border:1px solid #2563eb50;border-radius:4px;color:#60a5fa;padding:2px 6px;font-size:10px;">' + k + '</span>').join(' ')
          : '<span style="color:#475569;font-size:10px;">None detected</span>';
      }

      // Store current data for saving on Copy
      manualCurrentReviewData = { reviewerName, rating, reviewText, response, business: storedProfile.businessName || 'Unknown', score };

    } catch (err) { alert('Error: ' + err.message); }
    finally { btn.disabled = false; btn.textContent = '⚡ Generate Response'; }
  }

  document.getElementById('manual-generate-btn').addEventListener('click', () => generateManual(null, null));
  document.getElementById('manual-regen-btn').addEventListener('click', () => generateManual(null, null));

  document.getElementById('manual-copy-btn').addEventListener('click', async () => {
    const text = document.getElementById('manual-response-text').value;
    if (!text) return;
    navigator.clipboard.writeText(text);
    const btn = document.getElementById('manual-copy-btn');
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 2000);

    if (!manualCurrentReviewData) return;
    const d = manualCurrentReviewData;
    // Update response to current textarea value in case user edited it
    d.response = text;

    // Save to local history
    chrome.storage.local.get(['rsHistory'], result => {
      const history = result.rsHistory || [];
      history.unshift({ date: new Date().toLocaleDateString(), reviewerName: d.reviewerName, rating: d.rating, reviewText: d.reviewText.substring(0, 100), response: d.response, business: d.business });
      chrome.storage.local.set({ rsHistory: history.slice(0, 50) });
    });

    // Save to backend (website history)
    chrome.storage.local.get(['rsToken'], async r => {
      if (!r.rsToken) return;
      try {
        await fetch('https://ranksniperweb-production.up.railway.app/api/responses/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + r.rsToken },
          body: JSON.stringify({ reviewerName: d.reviewerName, rating: d.rating, reviewText: d.reviewText.substring(0, 500), responseText: d.response, businessName: d.business, score: d.score || null })
        });
      } catch (err) { console.log('[RankSniper] Could not save to backend:', err.message); }
    });
  });

  async function sendRefine() {
    const instruction = document.getElementById('manual-refine-input').value.trim();
    const previous = document.getElementById('manual-response-text').value;
    if (!instruction || !previous) return;
    document.getElementById('manual-refine-input').value = '';
    await generateManual(instruction, previous);
  }

  document.getElementById('manual-refine-btn').addEventListener('click', sendRefine);
  document.getElementById('manual-refine-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendRefine(); });

});
