const API = 'https://ranksniperweb-production.up.railway.app';

document.addEventListener('DOMContentLoaded', () => {

  // Check if already logged in — verify plan with backend every time
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
          // Token expired or invalid — force logout
          chrome.storage.local.remove(['rsToken', 'rsUser', 'rsPlan', 'ranksniperPlan']);
          showLoginScreen();
        }
      } catch (err) {
        // Network error — fall back to cached plan
        showMainApp(result.rsUser, result.rsPlan || 'free');
      }
    } else {
      showLoginScreen();
    }
  });

  // LOGIN
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

      // Save token and user info
      // Block users with no active subscription
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

  // Allow Enter key on password field
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

    // Show user email
    document.getElementById('user-email-display').textContent = user.email;

    // Set plan badge
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

    // Usage display
    document.getElementById('usage-text').textContent = plan === 'pro' ? 'Unlimited responses' : 'Free plan — upgrade for unlimited';
    document.getElementById('usage-fill').style.width = plan === 'pro' ? '100%' : '0%';

    // Load profiles
    loadProfiles(() => {});

    // Notify content script of auth state
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'RS_AUTH_UPDATE', plan, token: null }).catch(() => {});
      }
    });
  }

  // LOGOUT
  document.getElementById('logout-btn').addEventListener('click', () => {
    chrome.storage.local.remove(['rsToken', 'rsUser', 'rsPlan', 'ranksniperPlan'], () => {
      showLoginScreen();
    });
  });

  // TABS
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

  function loadProfiles(cb) {
    chrome.storage.local.get(['rsProfiles', 'rsActiveProfile', 'ranksniperUsage', 'rsPlan'], result => {
      profiles = result.rsProfiles || {};
      activeProfileId = result.rsActiveProfile || null;
      if (Object.keys(profiles).length === 0) {
        chrome.storage.local.get(['ranksniperProfile'], old => {
          if (old.ranksniperProfile) {
            const id = 'profile_' + Date.now();
            profiles[id] = { ...old.ranksniperProfile, profileName: old.ranksniperProfile.businessName || 'Main Profile' };
            activeProfileId = id;
            chrome.storage.local.set({ rsProfiles: profiles, rsActiveProfile: id });
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
    document.getElementById('profileName').value = p.profileName || '';
    document.getElementById('businessName').value = p.businessName || '';
    document.getElementById('city').value = p.city || '';
    document.getElementById('businessType').value = p.businessType || '';
    document.getElementById('services').value = p.services || '';
    document.getElementById('tone').value = p.tone || 'friendly';
    document.getElementById('customInstructions').value = p.customInstructions || '';
  }

  function clearForm() {
    ['profileName','businessName','city','services','customInstructions'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('businessType').value = '';
    document.getElementById('tone').value = 'friendly';
  }

  document.getElementById('profile-select').addEventListener('change', e => {
    activeProfileId = e.target.value;
    fillForm(profiles[activeProfileId]);
    chrome.storage.local.set({ rsActiveProfile: activeProfileId, ranksniperProfile: profiles[activeProfileId] });
  });

  document.getElementById('btn-new-profile').addEventListener('click', () => {
    const id = 'profile_' + Date.now();
    profiles[id] = { profileName: 'New Profile', businessName: '', city: '', businessType: '', services: '', tone: 'friendly', customInstructions: '' };
    activeProfileId = id;
    chrome.storage.local.set({ rsProfiles: profiles, rsActiveProfile: id });
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
    chrome.storage.local.set({ rsProfiles: profiles, rsActiveProfile: activeProfileId, ranksniperProfile: activeProfileId ? profiles[activeProfileId] : null });
    renderProfileSelector();
  });

  document.getElementById('save-profile').addEventListener('click', () => {
    const profile = {
      profileName: document.getElementById('profileName').value.trim() || document.getElementById('businessName').value.trim() || 'My Profile',
      businessName: document.getElementById('businessName').value.trim(),
      city: document.getElementById('city').value.trim(),
      businessType: document.getElementById('businessType').value,
      services: document.getElementById('services').value.trim(),
      tone: document.getElementById('tone').value,
      customInstructions: document.getElementById('customInstructions').value.trim(),
    };
    if (!activeProfileId) activeProfileId = 'profile_' + Date.now();
    profiles[activeProfileId] = profile;
    const saveBtn = document.getElementById('save-profile');
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;
    chrome.storage.local.set({ rsProfiles: profiles, rsActiveProfile: activeProfileId, ranksniperProfile: profile }, () => {
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
