document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(["geminiApiKey"], r => { if (r.geminiApiKey && document.getElementById("geminiApiKey")) document.getElementById("geminiApiKey").value = r.geminiApiKey; });
  chrome.storage.local.get(["ranksniperProfile", "ranksniperUsage", "ranksniperPlan"], (result) => {
    const profile = result.ranksniperProfile || {};
    const usage = result.ranksniperUsage || 0;
    const plan = result.ranksniperPlan || "free";
    if (profile.businessName) document.getElementById("businessName").value = profile.businessName;
    if (profile.city) document.getElementById("city").value = profile.city;
    if (profile.businessType) document.getElementById("businessType").value = profile.businessType;
    if (profile.services) document.getElementById("services").value = profile.services;
    if (profile.tone) document.getElementById("tone").value = profile.tone;
    const limit = plan === "pro" ? "Unlimited" : "5";
    document.getElementById("usage-text").textContent = usage + " / " + limit + " this month";
    document.getElementById("usage-fill").style.width = plan === "pro" ? "100%" : Math.min((usage/5)*100,100) + "%";
    if (plan === "pro") {
      const badge = document.getElementById("plan-badge");
      badge.textContent = "PRO"; badge.style.color = "#22c55e";
      document.getElementById("upgrade-section").style.display = "none";
    }
  });
  document.getElementById("save-profile").addEventListener("click", () => {
    const profile = {
      businessName: document.getElementById("businessName").value.trim(),
      city: document.getElementById("city").value.trim(),
      businessType: document.getElementById("businessType").value,
      services: document.getElementById("services").value.trim(),
      tone: document.getElementById("tone").value,
    };
    const saveBtn = document.getElementById("save-profile");
    saveBtn.textContent = "Saving...";
    saveBtn.disabled = true;
    const apiKey = document.getElementById("geminiApiKey") ? document.getElementById("geminiApiKey").value.trim() : null;
    if (apiKey) chrome.storage.local.set({ geminiApiKey: apiKey });
    chrome.storage.local.set({ ranksniperProfile: profile }, () => {
      if (chrome.runtime.lastError) { saveBtn.textContent = "Error"; saveBtn.disabled = false; return; }
      saveBtn.textContent = "Saved!";
      setTimeout(() => { saveBtn.textContent = "Save Profile"; saveBtn.disabled = false; }, 2000);
    });
  });
});

