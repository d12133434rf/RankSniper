const API = 'https://ranksniperweb-production.up.railway.app';

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
  const tokenResult = await new Promise(resolve => chrome.storage.local.get(['rsToken', 'ranksniperProfile'], resolve));
  const rsToken = tokenResult.rsToken;
  const p = tokenResult.ranksniperProfile || {};
  const biz = p.businessName || 'Our Business';
  const city = p.city || 'our city';
  const type = p.businessType || 'local business';
  const tone = p.tone || 'friendly';
  const rawFirst = (reviewData.reviewerName || 'Customer').split(' ')[0];
  const firstName = rawFirst.length === 1 ? 'there' : rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1).toLowerCase();
  const custom = p.customInstructions ? '\nAdditional instructions: ' + p.customInstructions : '';
  // Replace [City] placeholder with actual city value
  const rawKeywords = p.keywords || p.services || '';
  const keywords = rawKeywords.replace(/\[City\]/gi, city).trim();

  let prompt;
  if (instruction && previousResponse) {
    prompt = 'You wrote this Google review response for ' + biz + ' in ' + city + ':\n\n"' + previousResponse + '"\n\nThe user wants: "' + instruction + '"\n\nRewrite it. Start with "Hi ' + firstName + ',". Keep it natural and human. Use contractions. No dashes of any kind.' + custom + '\n\nWrite only the response.';
  } else {
    const negOpeners = [
      'Open by acknowledging what specifically went wrong from their review (do not start with "We\'re really sorry")',
      'Open by taking ownership of the specific issue they mentioned (do not start with apology language)',
      'Open by naming the specific problem and showing you read their review (avoid generic apology phrases)',
      'Open by addressing the exact thing they were disappointed about (skip the generic apology)',
      'Open by acknowledging their specific frustration directly (do not lead with "sorry")'
    ];
    const negOpener = negOpeners[Math.floor(Math.random() * negOpeners.length)];

    const sentimentPrompt = reviewData.rating <= 2
      ? 'TONE: This is a negative review. Be genuine, not corporate. Take ownership of what specifically went wrong. Use everyday words. Briefly mention how you will address it (without saying "implementing" or "reviewing protocols" or "dropped the ball"). End by inviting them back. ' + negOpener + '. DO NOT use these phrases anywhere: "dropped the ball", "that\'s on us", "we\'re really sorry", "we are sorry to hear", "we apologize", "sincere apologies", "sincerely apologize".'
      : reviewData.rating === 3
      ? 'TONE: This is a mixed review. Acknowledge specifically what they liked AND what disappointed them. No corporate hedging. Briefly note one thing you will improve. End with a warm invite back. Do not start with generic apology phrases.'
      : 'TONE: This is a positive review. Be warm and grateful without being over-the-top. Reference one specific thing they mentioned. Sound like a real owner who just read this on their phone. Keep it conversational. End with a brief, sincere note inviting them back. Do not start with "Thank you so much" or "Thanks so much".';

    const kwPrompt = keywords
      ? ' Include 1 keyword only if it sounds completely natural in context, do not force it: ' + keywords + '.'
      : '';

    const reviewWordCount = reviewData.reviewText.split(/\s+/).filter(Boolean).length;
    let lengthRule, detailRule;
    if (reviewWordCount < 25) {
      lengthRule = '60 to 90 words';
      detailRule = 'Reference the specific thing they mentioned.';
    } else if (reviewWordCount < 60) {
      lengthRule = '80 to 120 words';
      detailRule = 'Address each specific issue or compliment they mentioned by name.';
    } else if (reviewWordCount < 120) {
      lengthRule = '120 to 170 words';
      detailRule = 'Address EVERY specific point they raised (each complaint or compliment must get its own sentence). Do not lump multiple issues into one vague sentence.';
    } else {
      lengthRule = '160 to 220 words';
      detailRule = 'Address EVERY specific point they raised individually. For long detailed reviews, the response must match that depth.';
    }

    prompt = 'You are the owner of ' + biz + ', a ' + type + ' in ' + city + '. Respond to this Google review.\n\n' +
      'Review (' + reviewData.rating + '/5 stars, ' + reviewWordCount + ' words): "' + reviewData.reviewText + '"\n\n' +
      'HARD REQUIREMENTS:\n' +
      '- Start with: Hi ' + firstName + ',\n' +
      '- Length: ' + lengthRule + '\n' +
      '- ' + detailRule + '\n' +
      '- Mention the business name (' + biz + ') exactly once, naturally in a sentence\n' +
      '- Mention the city (' + city + ') exactly once, naturally in a sentence\n' +
      '- Use contractions (we\'re, don\'t, it\'s)\n' +
      '- Sound like a real business owner wrote it, not a PR firm\n\n' +
      sentimentPrompt + '\n' +
      kwPrompt + '\n\n' +
      'BANNED WORDS AND PHRASES (do not use any of these): thrilled, delighted, excited, wonderful, amazing, fantastic, cherished, mortified, absolutely, sincerely, means the world, we look forward, we hope to see you, thank you for sharing, thank you for taking the time, at your earliest convenience, do not hesitate, we are committed, it is our goal, we take pride, we pride ourselves, we strive to, rest assured, standard of care, training protocols, quality checks, implementing, reviews like yours, valued customer, esteemed, utmost.\n\n' +
      'BANNED PUNCTUATION: no em dashes, no en dashes, no hyphens used as sentence breaks.\n\n' +
      custom + '\n\nWrite only the response. No quotes, no signature, no preamble.';
  }

  const res = await fetch(API + '/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + rsToken },
    body: JSON.stringify({ prompt })
  });
  if (!res.ok) { const err = await res.json(); throw new Error(err?.error || 'Generation failed'); }
  const data = await res.json();
  let output = data.text || 'Could not generate response.';
  output = output.replace(/\bthrilled\b/gi, 'happy').replace(/\bdelighted\b/gi, 'glad').replace(/\bwonderful\b/gi, 'great').replace(/\bfantastic\b/gi, 'great').replace(/\bamazing\b/gi, 'great').replace(/ - /g, ' ').replace(/—/g, '');
  return output;
}

function scoreResponsePopup(text, profile) {
  let score = 50;
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean).length;

  if (words >= 60 && words <= 220) score += 12;
  else if (words >= 50 && words <= 250) score += 9;
  else if (words >= 40 && words <= 280) score += 5;
  else if (words < 30) score -= 8;

  if (/^hi [a-z]/i.test(text) && !lower.startsWith('hi there')) score += 5;
  else if (lower.startsWith('hi there') || lower.startsWith('hello there')) score += 3;
  else if (lower.startsWith('hi ') || lower.startsWith('hello ')) score += 4;
  else if (lower.startsWith('thanks') || lower.startsWith('thank you')) score += 3;

  if (profile?.businessName) {
    const bizLower = profile.businessName.toLowerCase();
    const bizCount = (lower.match(new RegExp(bizLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    if (bizCount === 1) score += 10;
    else if (bizCount === 2) score += 7;
    else if (bizCount >= 3) score += 3;
  }

  if (profile?.city) {
    const cityLower = profile.city.split(',')[0].trim().toLowerCase();
    const cityCount = (lower.match(new RegExp(cityLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    if (cityCount === 1) score += 10;
    else if (cityCount === 2) score += 6;
  }

  if (profile?.businessType) {
    if (lower.includes(profile.businessType.toLowerCase())) score += 8;
  }

  const kwSources = [profile?.keywords, profile?.services].filter(Boolean).join(',');
  if (kwSources) {
    const kwList = kwSources.split(',').map(k => k.trim().replace(/\[City\]/gi, '').trim().toLowerCase()).filter(k => k && k.length > 2);
    const kwFound = kwList.filter(k => lower.includes(k)).length;
    if (kwFound >= 2) score += 8;
    else if (kwFound === 1) score += 5;
  } else {
    score += 5;
  }

  const ctaPhrases = ['come back', 'visit us', 'see you again', 'see you soon', 'give us another',
    'stop by', 'come see us', 'hope to see', 'love to have you', 'next visit', 'try us again',
    'come on in', 'come by', 'swing by', 'reach out', 'let us know', 'give us a call',
    'another shot', 'another try', 'another chance', 'welcome back', 'invite you back', 'hope you'];
  if (ctaPhrases.some(p => lower.includes(p))) score += 6;

  const contractions = ["we're", "we've", "we'll", "don't", "didn't", "it's", "that's", "you're", "you'll", "i'm", "can't", "won't", "isn't", "wasn't"];
  const contractionCount = contractions.filter(c => lower.includes(c)).length;
  if (contractionCount >= 3) score += 4;
  else if (contractionCount >= 1) score += 2;

  if (!text.includes('\u2014') && !text.includes('\u2013')) score += 2;

  const specificMarkers = ['mentioned', 'said', 'glad you', 'sorry', 'hear that', 'hear your',
    'about the', 'on the', 'for the', 'happy you', 'love that', 'great that',
    'soggy', 'rude', 'tasteless', 'cold', 'hot', 'slow', 'fast', 'friendly', 'helpful'];
  if (specificMarkers.some(m => lower.includes(m))) score += 5;

  const genericPhrases = ['we strive to', 'we apologize for any inconvenience', 'at your earliest convenience',
    'do not hesitate', 'please do not hesitate', 'we are committed to', 'it is our goal',
    'we take pride', 'rest assured', 'we value your feedback', 'thank you for bringing this to our attention',
    'thrilled', 'delighted', 'means the world', 'thank you for sharing', 'thank you for taking the time',
    'we pride ourselves', 'it means a lot', 'reviews like yours', 'utmost', 'valued customer',
    'esteemed', 'training protocols', 'standard of care', 'quality checks', 'implementing measures'];
  score -= genericPhrases.filter(p => lower.includes(p)).length * 5;

  if (!lower.includes('hi') && !lower.includes('hello') && !lower.includes('thank')) score -= 10;

  let finalScore = Math.min(Math.max(Math.round(score), 0), 100);
  if (finalScore >= 96) {
    const variance = (words % 5);
    finalScore = 94 + variance;
  }
  return finalScore;
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
