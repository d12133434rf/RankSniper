// RankSniper - Content Script v1.22
(function () {
  let businessProfile = null;
  let geminiApiKey = null;

  function loadProfile() {
    return new Promise(resolve => {
      chrome.storage.local.get(['ranksniperProfile', 'geminiApiKey'], result => {
        businessProfile = result.ranksniperProfile || null;
        geminiApiKey = result.geminiApiKey || null;
        resolve(result);
      });
    });
  }

  function getReviewsFromPageData() {
    try {
      const script = document.querySelector('script.ds\\:3');
      if (!script) return [];
      const raw = script.textContent;
      const match = raw.match(/data:(\[.*\])\s*,\s*sideChannel/s);
      if (!match) return [];
      const data = JSON.parse(match[1]);
      const reviews = data?.[2];
      if (!Array.isArray(reviews)) return [];
      return reviews.map(r => ({
        reviewText: r[5] || r[6] || '',
        rating: r[19] ?? 5,
        reviewerName: r[32]?.[1] || 'Customer',
        reviewId: r[0] || ''
      })).filter(r => r.reviewText.length > 0);
    } catch (e) {
      console.log('[RankSniper] JSON parse error:', e.message);
      return [];
    }
  }

  function findReviewContainers() {
    const byReviewId = document.querySelectorAll('[data-review-id]');
    if (byReviewId.length > 0) return [...byReviewId];
    return [...document.querySelectorAll('div.OUCuxb')];
  }

  async function callGemini(reviewData) {
    if (!geminiApiKey) throw new Error('No API key. Open RankSniper popup and enter your Gemini API key.');
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=' + geminiApiKey;
    const profile = businessProfile || {};
    const biz = profile.businessName || 'Our Business';
    const city = profile.city || 'our city';
    const type = profile.businessType || 'local business';
    const tone = profile.tone || 'friendly';
    const firstName = reviewData.reviewerName.split(' ')[0];
    let ratingGuidance = '';
    if (reviewData.rating <= 2) ratingGuidance = 'This is a negative review. Apologize sincerely, acknowledge their specific complaints, and explain how you will improve.';
    else if (reviewData.rating === 3) ratingGuidance = 'This is a mixed review. Thank them, acknowledge what fell short, and invite them back.';
    else ratingGuidance = 'This is a positive review. Thank them warmly and invite them back.';
    const prompt = 'You are responding to a Google review for ' + biz + ', a ' + type + ' in ' + city + '.\nTone: ' + tone + '.\nStart your response with "Hi ' + firstName + '," - always use their first name.\n' + ratingGuidance + '\nNaturally include the city name (' + city + ') and business name (' + biz + ').\nKeep it under 150 words. Sound genuine and human, not corporate.\n\nReview (' + reviewData.rating + ' out of 5 stars): "' + reviewData.reviewText + '"\n\nWrite only the response text, nothing else.';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 200, temperature: 0.7 } })
    });
    if (!res.ok) { const err = await res.json(); throw new Error(err?.error?.message || 'Gemini API error'); }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Could not generate response.';
  }

  function createSniperButton(reviewData, container) {
    const btn = document.createElement('button');
    btn.className = 'ranksniper-btn';
    btn.textContent = 'Draft AI Response';
    btn.addEventListener('click', async (e) => { e.stopPropagation(); e.preventDefault(); await handleDraftClick(btn, reviewData, container); });
    return btn;
  }

  async function handleDraftClick(btn, reviewData, container) {
    await loadProfile();
    console.log('[RankSniper] Generating for:', reviewData.reviewerName, '| rating:', reviewData.rating);
    btn.disabled = true;
    btn.textContent = 'Generating...';
    try {
      const responseText = await callGemini(reviewData);
      showPanel(container, responseText, btn, reviewData);
    } catch (err) {
      console.error('[RankSniper]', err);
      showNotice('Error: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Draft AI Response';
    }
  }

  function showPanel(container, responseText, sniperBtn, reviewData) {
    container.querySelector('.rs-panel')?.remove();
    const panel = document.createElement('div');
    panel.className = 'rs-panel';
    const uid = Date.now();
    panel.innerHTML = '<div class="rs-panel-header"><span class="rs-panel-logo">RankSniper</span><div class="rs-panel-badges"><span class="rs-badge rs-badge-seo">SEO Optimized</span></div><button class="rs-panel-close">X</button></div><div class="rs-panel-body"><textarea class="rs-response-text" rows="6">' + responseText + '</textarea><div class="rs-panel-actions"><button class="rs-copy-btn">Copy</button><button class="rs-paste-btn">Paste into Reply Box</button><button class="rs-regen-btn">Regenerate</button></div><div class="rs-keywords-row"><span class="rs-keywords-label">Keywords used:</span><span class="rs-keywords-list" id="rs-kw-' + uid + '"></span></div></div>';
    container.appendChild(panel);
    setTimeout(() => { const kwEl = panel.querySelector('#rs-kw-' + uid); if (kwEl) extractAndShowKeywords(kwEl, responseText); }, 100);
    panel.querySelector('.rs-panel-close').addEventListener('click', () => panel.remove());
    panel.querySelector('.rs-copy-btn').addEventListener('click', () => { navigator.clipboard.writeText(panel.querySelector('.rs-response-text').value); const b = panel.querySelector('.rs-copy-btn'); b.textContent = 'Copied!'; setTimeout(() => b.textContent = 'Copy', 2000); });
    panel.querySelector('.rs-paste-btn').addEventListener('click', () => { pasteIntoReplyBox(container, panel.querySelector('.rs-response-text').value); });
    panel.querySelector('.rs-regen-btn').addEventListener('click', async () => { panel.remove(); const freshBtn = container.querySelector('.ranksniper-btn'); if (freshBtn) await handleDraftClick(freshBtn, reviewData, container); });
  }

  function extractAndShowKeywords(el, text) {
    const profile = businessProfile || {};
    const keywords = [];
    const lower = text.toLowerCase();
    if (profile.city && lower.includes(profile.city.toLowerCase())) keywords.push(profile.city);
    if (profile.businessName && lower.includes(profile.businessName.toLowerCase())) keywords.push(profile.businessName);
    if (profile.services) { for (const s of profile.services.split(',').map(x => x.trim())) { if (s && lower.includes(s.toLowerCase())) keywords.push(s); } }
    el.innerHTML = keywords.map(k => '<span class="rs-keyword-tag">' + k + '</span>').join('') || '<span style="color:#6b7280">None detected</span>';
  }

  function pasteIntoReplyBox(container, text) {
    const replyBtn = container.querySelector('div.lGXsGc button');
    if (replyBtn) replyBtn.click();
    setTimeout(() => {
      const textarea = document.querySelector('textarea[aria-label*="eply"], textarea[placeholder*="eply"]') || document.querySelector('textarea') || container.querySelector('[contenteditable="true"]');
      if (textarea) { textarea.focus(); if (textarea.tagName === 'TEXTAREA') { textarea.value = text; textarea.dispatchEvent(new Event('input', { bubbles: true })); textarea.dispatchEvent(new Event('change', { bubbles: true })); } else { textarea.innerText = text; textarea.dispatchEvent(new Event('input', { bubbles: true })); } showNotice('Response pasted! Click Submit to post.', 'success'); }
      else { navigator.clipboard.writeText(text); showNotice('Copied - paste manually into the reply box.', 'info'); }
    }, 800);
  }

  function showNotice(message, type) {
    document.getElementById('rs-notice')?.remove();
    const notice = document.createElement('div');
    notice.id = 'rs-notice';
    notice.className = 'rs-notice rs-notice-' + (type || 'info');
    notice.textContent = message;
    document.body.appendChild(notice);
    setTimeout(() => notice.remove(), 4000);
  }

  function injectButtons() {
    const pageReviews = getReviewsFromPageData();
    const containers = findReviewContainers();
    console.log('[RankSniper] v1.22 - reviews:', pageReviews.length, '| containers:', containers.length);
    if (pageReviews.length === 0 || containers.length === 0) return;
    containers.forEach((container, i) => {
      if (container.querySelector('.ranksniper-btn')) return;
      if (container.innerText?.toLowerCase().includes('owner replied')) return;
      const reviewData = pageReviews[i] || pageReviews[0];
      if (!reviewData) return;
      console.log('[RankSniper] Injecting:', reviewData.reviewerName, '| rating:', reviewData.rating);
      const btn = createSniperButton(reviewData, container);
      const replyBtn = container.querySelector('div.lGXsGc button');
      if (replyBtn) { replyBtn.insertAdjacentElement('afterend', btn); } else { container.appendChild(btn); }
    });
  }

  const observer = new MutationObserver(() => { clearTimeout(window._rsInjectTimer); window._rsInjectTimer = setTimeout(injectButtons, 500); });
  observer.observe(document.body, { subtree: true, childList: true });

  async function init() {
    await loadProfile();
    console.log('[RankSniper] v1.22 loaded. Profile:', businessProfile ? 'OK' : 'Not set', '| API key:', geminiApiKey ? 'OK' : 'MISSING - open popup to add key');
    setTimeout(injectButtons, 1000);
    setTimeout(injectButtons, 2500);
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();
