document.addEventListener('DOMContentLoaded', () => {

  // Load saved profile
  chrome.storage.local.get(['ranksniperProfile', 'ranksniperUsage', 'ranksniperPlan'], (result) => {
    const profile = result.ranksniperProfile || {};
    const usage = result.ranksniperUsage || 0;
    const plan = result.ranksniperPlan || 'free';

    if (profile.businessName) document.getElementById('businessName').value = profile.businessName;
    if (profile.city) document.getElementById('city').value = profile.city;
    if (profile.businessType) document.getElementById('businessType').value = profile.businessType;
    if (profile.services) document.getElementById('services').value = profile.services;
    if (profile.tone) document.getElementById('tone').value = profile.tone;
    if (result.geminiApiKey) document.getElementById('geminiApiKey').value = result.geminiApiKey;

    const limit = plan === 'pro' ? 'âˆž' : '5';
    document.getElementById('usage-text').textContent = `${usage} / ${limit} this month`;
    document.getElementById('usage-fill').style.width = plan === 'pro' ? '100%' : `${Math.min((usage / 5) * 100, 100)}%`;
    document.getElementById('usage-fill').style.background = plan === 'pro'
      ? 'linear-gradient(90deg, #22c55e, #4ade80)'
      : usage >= 5
        ? 'linear-gradient(90deg, #ef4444, #f87171)'
        : 'linear-gradient(90deg, #3b82f6, #60a5fa)';

    const badge = document.getElementById('plan-badge');
    if (plan === 'pro') {
      badge.textContent = 'PRO';
      badge.style.color = '#22c55e';
      badge.style.borderColor = '#22c55e30';
      document.getElementById('upgrade-section').style.display = 'none';
    }
  });

  // Save profile
  document.getElementById('save-profile').addEventListener('click', () => {
    const profile = {
      businessName: document.getElementById('businessName').value.trim(),
      city: document.getElementById('city').value.trim(),
      businessType: document.getElementById('businessType').value,
      services: document.getElementById('services').value.trim(),
      tone: document.getElementById('tone').value,
    };

    const saveBtn = document.getElementById('save-profile');
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;

    chrome.storage.local.set({ ranksniperProfile: profile, geminiApiKey: (document.getElementById('geminiApiKey') ? document.getElementById('geminiApiKey').value.trim() : null) }, () => {
      if (chrome.runtime.lastError) {
        saveBtn.textContent = 'âŒ Error saving';
        saveBtn.disabled = false;
        console.error(chrome.runtime.lastError);
        return;
      }
      saveBtn.textContent = 'âœ… Saved!';
      setTimeout(() => {
        saveBtn.textContent = 'Save Profile';
        saveBtn.disabled = false;
      }, 2000);
    });
  });

});


