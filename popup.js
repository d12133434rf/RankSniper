const API = 'https://ranksniperweb-production.up.railway.app';

// SEO-optimized entity-based keywords by business type
const SEO_KEYWORDS = {
  'restaurant': ['best dining in [City]', 'top-rated restaurant', 'lunch specials', 'outdoor seating', 'online reservations', 'happy hour deals', 'family dining', 'menu favorites', 'dine-in and takeout', 'local food favorite'],
  'barber shop': ["men's haircut [City]", 'beard trim', 'hot towel shave', 'best barber in [City]', 'hair fades', 'hair styling', 'walk-in haircut', 'low fade specialist', 'kids haircut', 'barber near me'],
  'hair salon': ['hair coloring [City]', 'balayage specialist', 'keratin treatment', 'best hair salon', 'haircut and blowout', 'highlights and lowlights', 'hair extensions', 'salon near me', 'color correction', 'bridal hair'],
  'nail salon': ['gel manicure [City]', 'acrylic nails', 'nail art specialist', 'pedicure near me', 'dip powder nails', 'best nail salon', 'nail extensions', 'luxury pedicure', 'nail salon near me', 'nail technician'],
  'auto shop': ['brake repair [City]', 'oil change near me', 'transmission service', 'check engine light', 'tire rotation', 'scheduled maintenance', 'auto repair shop', 'engine diagnostics', 'AC repair', 'car inspection'],
  'dental office': ['teeth whitening [City]', 'emergency dentist', 'dental implants', 'root canal specialist', 'teeth cleaning', 'cosmetic dentistry', 'dental crowns', 'pediatric dentist', 'Invisalign provider', 'dentist accepting new patients'],
  'gym': ['gym membership [City]', 'personal trainer', 'group fitness classes', 'weight loss program', 'CrossFit near me', 'gym near me', '24 hour gym', 'fitness center', 'strength training', 'yoga classes'],
  'spa': ['massage therapy [City]', 'deep tissue massage', 'facial treatment', 'couples massage', 'hot stone massage', 'spa near me', 'relaxation massage', 'body wrap treatment', 'prenatal massage', 'day spa'],
  'retail store': ['shop local [City]', 'unique gifts', 'online and in-store', 'sale and deals', 'locally owned store', 'retail near me', 'gift shop', 'boutique store', 'same day pickup', 'quality products'],
  'real estate': ['homes for sale [City]', 'real estate agent', 'buyer and seller representation', 'property listings', 'first-time homebuyer', 'real estate near me', 'home valuation', 'luxury homes', 'investment properties', 'local market expert'],
  'law firm': ['personal injury lawyer [City]', 'free consultation', 'no win no fee', 'family law attorney', 'criminal defense lawyer', 'estate planning', 'immigration attorney', 'business law', 'law firm near me', 'experienced attorneys'],
  'medical office': ['primary care [City]', 'same day appointments', 'accepting new patients', 'telehealth available', 'urgent care near me', 'family medicine', 'annual physical exam', 'lab work on-site', 'insurance accepted', 'board certified physicians'],
  'other': ['best [City] service', 'top-rated local business', 'near me', 'highly recommended', 'locally owned', 'same day service', 'free consultation', 'affordable pricing', 'experienced team', 'trusted local provider']
};

document.addEventListener('DOMContentLoaded', () => {

  chrome.storage.local.get(['rsToken', 'rsUser', 'rsPlan'], async result => {
    if (result.rsToken && result.rsUser) {
      try {
        const res = await fetch(API + '/api/auth/me', {
          headers: { 'Authorization': 'Bearer ' + result.rsToken }
        });
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

    btn.disabled = true;
    btn.textContent = 'Logging in...';
    errorEl.style.display = 'none';

    try {
      const res = await fetch(API + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();

      if (!res.ok) {
        showError(data.error || 'Login failed. Please try again.');
        btn.disabled = false;
        btn.textContent = 'Log In';
        return;
      }

      if (data.user.plan !== 'pro') {
        showError('No active subscription. Visit getranksniper.com to subscribe.');
        btn.disabled = false;
        btn.textContent = 'Log In';
        return;
      }

      chrome.storage.local.set({
        rsToken: data.token,
        rsUser: data.user,
        rsPlan: data.user.plan,
        ranksniperPlan: data.user.plan
      }, () => {
        showMainApp(data.user, data.user.plan);
      });

    } catch (err) {
      showError('Network error. Check your connection.');
      btn.disabled = false;
      btn.textContent = 'Log In';
    }
  });

  document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('login-btn').click();
  });

  function showError(msg) {
    const el = document.getElementById('login-error');
    el.textContent = msg;
    el.style.display = 'block';
  }

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
    if (plan === 'pro') {
      badge.textContent = 'PRO';
      badge.style.color = '#22c55e';
      badge.style.borderColor = '#22c55e50';
      document.getElementById('upgrade-section').style.display = 'none';
    } else {
      badge.textContent = 'Free';
      badge.style.color = '#60a5fa';
      document.getElementById('upgrade-section').style.display = 'block';
    }

    document.getElementById('usage-text').textContent = plan === 'pro' ? 'Unlimited responses' : 'Free plan — upgrade for unlimited';
    document.getElementById('usage-fill').style.width = plan === 'pro' ? '100%' : '0%';

    loadProfiles(() => {});

    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'RS_AUTH_UPDATE', plan, token: null }).catch(() => {});
      }
    });
  }

  document.getElementById('logout-btn').addEventListener('click', () => {
    chrome.storage.local.remove(['rsToken', 'rsUser', 'rsPlan', 'ranksniperPlan'], () => {
      showLoginScreen();
    });
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

  // Auto-generate SEO keywords when business type changes
  document.getElementById('businessType').addEventListener('change', function() {
    const type = this.value;
    if (!type) return;
    const keywords = SEO_KEYWORDS[type] || SEO_KEYWORDS['other'];
    // Only auto-fill if keywords field is empty or was previously auto-generated
    const keywordsField = document.getElementById('keywords');
    if (!keywordsField.dataset.manuallyEdited) {
      keywordsField.value = keywords.slice(0, 5).join(', ');
    }
  });

  // Track manual keyword edits
  document.getElementById('keywords').addEventListener('input', function() {
    this.dataset.manuallyEdited = 'true';
  });

  // Reset manual edit flag when profile loads
  function resetKeywordsFlag() {
    document.getElementById('keywords').dataset.manuallyEdited = '';
  }

  function getKeywordSuggestions(type) {
    return (SEO_KEYWORDS[type] || SEO_KEYWORDS['other']);
  }

  function renderKeywordSuggestions(type, currentKeywords) {
    const container = document.getElementById('keyword-suggestions');
    if (!container) return;
    const allKeywords = getKeywordSuggestions(type);
    const current = currentKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    const suggestions = allKeywords.filter(k => !current.includes(k.toLowerCase()));
    
    if (suggestions.length === 0) {
      container.innerHTML = '';
      return;
    }

    const label = document.getElementById('chips-label');
    if (label) label.style.display = suggestions.length > 0 ? 'block' : 'none';
    container.innerHTML = suggestions.slice(0, 6).map(k =>
      `<span class="keyword-chip" data-keyword="${k}">${k}</span>`
    ).join('');

    container.querySelectorAll('.keyword-chip').forEach(chip => {
      chip.addEventListener('click', function() {
        const kw = this.dataset.keyword;
        const field = document.getElementById('keywords');
        const current = field.value.trim();
        const existing = current.split(',').map(k => k.trim().toLowerCase());
        if (existing.includes(kw.toLowerCase())) return;
        field.value = current ? current + ', ' + kw : kw;
        field.dataset.manuallyEdited = 'true';
        renderKeywordSuggestions(document.getElementById('businessType').value, field.value);
      });
    });
  }

  document.getElementById('keywords').addEventListener('input', function() {
    this.dataset.manuallyEdited = 'true';
    const type = document.getElementById('businessType').value;
    renderKeywordSuggestions(type, this.value);
  });

  document.getElementById('businessType').addEventListener('change', function() {
    const type = this.value;
    if (!type) return;
    const keywordsField = document.getElementById('keywords');
    if (!keywordsField.dataset.manuallyEdited) {
      const keywords = SEO_KEYWORDS[type] || SEO_KEYWORDS['other'];
      keywordsField.value = keywords.slice(0, 5).join(', ');
    }
    renderKeywordSuggestions(type, keywordsField.value);
  });

  function loadProfiles(cb) {
    chrome.storage.sync.get(['rsProfiles', 'rsActiveProfile'], syncResult => { chrome.storage.local.get(['ranksniperUsage', 'rsPlan'], localResult => { const result = {...localResult, ...syncResult};
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
          renderProfileSelector();
          if (cb) cb(result);
        });
      } else {
        renderProfileSelector();
        if (cb) cb(result);
      }
    });
  }

  function renderProfileSelector() {
    const sel = document.getElementById('profile-select');
    sel.innerHTML = '';
    const ids = Object.keys(profiles);
    if (ids.length === 0) { sel.innerHTML = '<option value="">No profiles</option>'; clearForm(); return; }
    ids.forEach(id => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = profiles[id].profileName || profiles[id].businessName || 'Unnamed';
      if (id === activeProfileId) opt.selected = true;
      sel.appendChild(opt);
    });
    const currentId = activeProfileId && profiles[activeProfileId] ? activeProfileId : ids[0];
    activeProfileId = currentId;
    sel.value = currentId;
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
    // Show suggestions for loaded profile
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
    activeProfileId = e.target.value;
    fillForm(profiles[activeProfileId]);
    chrome.storage.sync.set({ rsActiveProfile: activeProfileId }); chrome.storage.local.set({ ranksniperProfile: profiles[activeProfileId] });
  });

  document.getElementById('btn-new-profile').addEventListener('click', () => {
    const id = 'profile_' + Date.now();
    profiles[id] = { profileName: 'New Profile', businessName: '', city: '', businessType: '', keywords: '', tone: 'friendly', customInstructions: '' };
    activeProfileId = id;
    chrome.storage.sync.set({ rsProfiles: profiles, rsActiveProfile: id });
    renderProfileSelector();
    document.getElementById('profile-select').value = id;
    fillForm(profiles[id]);
    document.getElementById('profileName').focus();
  });

  document.getElementById('btn-delete-profile').addEventListener('click', () => {
    if (!activeProfileId || Object.keys(profiles).length <= 1) { alert('You need at least one profile.'); return; }
    if (!confirm('Delete this profile?')) return;
    delete profiles[activeProfileId];
    activeProfileId = Object.keys(profiles)[0] || null;
    chrome.storage.sync.set({ rsProfiles: profiles, rsActiveProfile: activeProfileId }); chrome.storage.local.set({ ranksniperProfile: activeProfileId ? profiles[activeProfileId] : null });
    renderProfileSelector();
  });

  document.getElementById('save-profile').addEventListener('click', () => {
    const profile = {
      profileName: document.getElementById('profileName').value.trim() || document.getElementById('businessName').value.trim() || 'My Profile',
      businessName: document.getElementById('businessName').value.trim(),
      city: document.getElementById('city').value.trim(),
      businessType: document.getElementById('businessType').value,
      keywords: document.getElementById('keywords').value.trim(),
      services: document.getElementById('keywords').value.trim(), // keep backward compat
      tone: document.getElementById('tone').value,
      customInstructions: document.getElementById('customInstructions').value.trim(),
    };
    if (!activeProfileId) activeProfileId = 'profile_' + Date.now();
    profiles[activeProfileId] = profile;
    const saveBtn = document.getElementById('save-profile');
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;
    chrome.storage.sync.set({ rsProfiles: profiles, rsActiveProfile: activeProfileId }, () => { chrome.storage.local.set({ ranksniperProfile: profile });
      if (chrome.runtime.lastError) { saveBtn.textContent = 'Error'; saveBtn.disabled = false; return; }
      saveBtn.textContent = 'Saved!';
      renderProfileSelector();
      setTimeout(() => { saveBtn.textContent = 'Save Profile'; saveBtn.disabled = false; }, 2000);
    });
  });

  function loadHistory() {
    chrome.storage.local.get(['rsHistory'], result => {
      const history = result.rsHistory || [];
      const list = document.getElementById('history-list');
      if (history.length === 0) { list.innerHTML = '<div class="history-empty">No responses yet. Generate your first AI response!</div>'; return; }
      const stars = r => r <= 1 ? '1 star' : r <= 2 ? '2 stars' : r <= 3 ? '3 stars' : r <= 4 ? '4 stars' : '5 stars';
      list.innerHTML = history.map(h => `
        <div class="history-item">
          <div class="history-meta">
            <span class="history-name">${h.reviewerName} - ${h.business}</span>
            <span class="history-date">${h.date}</span>
          </div>
          <div class="history-rating">${stars(h.rating)} | "${h.reviewText}..."</div>
          <div class="history-response" onclick="navigator.clipboard.writeText(this.dataset.text);this.style.color='#22c55e';setTimeout(()=>this.style.color='',1500)" data-text="${h.response.replace(/"/g, '&quot;')}" title="Click to copy">${h.response}</div>
        </div>
      `).join('');
    });
  }

  document.getElementById('clear-history').addEventListener('click', () => {
    if (!confirm('Clear all response history?')) return;
    chrome.storage.local.set({ rsHistory: [] }, () => loadHistory());
  });
});
