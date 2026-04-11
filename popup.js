document.addEventListener('DOMContentLoaded', () => {

  // Tabs
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
    chrome.storage.local.get(['rsProfiles', 'rsActiveProfile', 'ranksniperUsage', 'ranksniperPlan'], result => {
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

  loadProfiles(result => {
    const usage = result.ranksniperUsage || 0;
    const plan = result.ranksniperPlan || 'free';
    const limit = plan === 'pro' ? 'Unlimited' : '5';
    document.getElementById('usage-text').textContent = usage + ' / ' + limit + ' this month';
    document.getElementById('usage-fill').style.width = plan === 'pro' ? '100%' : Math.min((usage / 5) * 100, 100) + '%';
    if (plan === 'pro') {
      document.getElementById('plan-badge').textContent = 'PRO';
      document.getElementById('plan-badge').style.color = '#22c55e';
      document.getElementById('upgrade-section').style.display = 'none';
    }
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
          <div class="history-response" onclick="navigator.clipboard.writeText(this.dataset.text);this.style.color='#22c55e';setTimeout(()=>this.style.color='',1500)" data-text="${h.response.replace(/"/g, '&quot;')}" title="Click to copy">${h.response.substring(0, 120)}...</div>
        </div>
      `).join('');
    });
  }

  document.getElementById('clear-history').addEventListener('click', () => {
    if (!confirm('Clear all response history?')) return;
    chrome.storage.local.set({ rsHistory: [] }, () => loadHistory());
  });
});
