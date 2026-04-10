// RankSniper - Content Script v1.23
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

  function getMapsReviews() {
    try {
      const cards = [...document.querySelectorAll("[data-review-id]")];
      return cards.map(card => {
        const nameEl = card.querySelector(".al6Kxe");
        const reviewerName = nameEl ? nameEl.innerText.split("\n")[0].trim() : "Customer";
        const ratingEl = card.querySelector(".kvMYJc");
        const ratingLabel = ratingEl ? ratingEl.getAttribute("aria-label") : "5 stars";
        const rating = parseInt(ratingLabel) || 5;
        const textEl = card.querySelector(".wiI7pd");
        const reviewText = textEl ? textEl.innerText.trim() : "";
        return { reviewerName, rating, reviewText, reviewId: card.getAttribute("data-review-id") };
      }).filter(r => r.reviewText.length > 0);
    } catch(e) { return []; }
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

  async function handleDraftClick(btn, reviewData, reviewCard) {
    await loadProfile();
    console.log('[RankSniper] Generating for:', reviewData.reviewerName, '| rating:', reviewData.rating);
    btn.disabled = true;
    btn.textContent = 'Generating...';
    try {
      const responseText = await callGemini(reviewData);
      showPanel(reviewCard, responseText, reviewData);
    } catch (err) {
      console.error('[RankSniper]', err);
      showNotice('Error: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Draft AI Response';
    }
  }

  function showPanel(reviewCard, responseText, reviewData) {
    reviewCard.querySelector('.rs-panel')?.remove();
    const panel = document.createElement('div');
    panel.className = 'rs-panel';
    const uid = Date.now();
    panel.innerHTML = '<div class="rs-panel-header"><span class="rs-panel-logo">RankSniper</span><div class="rs-panel-badges"><span class="rs-badge rs-badge-seo">SEO Optimized</span></div><button class="rs-panel-close">X</button></div><div class="rs-panel-body"><textarea class="rs-response-text" rows="6">' + responseText + '</textarea><div class="rs-panel-actions"><button class="rs-copy-btn">Copy</button><button class="rs-paste-btn">Paste into Reply Box</button><button class="rs-regen-btn">Regenerate</button></div><div class="rs-keywords-row"><span class="rs-keywords-label">Keywords used:</span><span class="rs-keywords-list" id="rs-kw-' + uid + '"></span></div></div>';
    reviewCard.appendChild(panel);
    setTimeout(() => { const kwEl = panel.querySelector('#rs-kw-' + uid); if (kwEl) extractAndShowKeywords(kwEl, responseText); }, 100);
    panel.querySelector('.rs-panel-close').addEventListener('click', () => panel.remove());
    panel.querySelector('.rs-copy-btn').addEventListener('click', () => { navigator.clipboard.writeText(panel.querySelector('.rs-response-text').value); const b = panel.querySelector('.rs-copy-btn'); b.textContent = 'Copied!'; setTimeout(() => b.textContent = 'Copy', 2000); });
    panel.querySelector('.rs-paste-btn').addEventListener('click', () => { pasteIntoReplyBox(reviewCard, panel.querySelector('.rs-response-text').value); });
    panel.querySelector('.rs-regen-btn').addEventListener('click', async () => { panel.remove(); const freshBtn = reviewCard.querySelector('.ranksniper-btn'); if (freshBtn) await handleDraftClick(freshBtn, reviewData, reviewCard); });
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

  function pasteIntoReplyBox(reviewCard, text) {
    const replyBtn = reviewCard.querySelector('div.lGXsGc button');
    if (replyBtn) replyBtn.click();
    setTimeout(() => {
      const textarea = document.querySelector('textarea[aria-label*="eply"], textarea[placeholder*="eply"]') || document.querySelector('textarea') || reviewCard.querySelector('[contenteditable="true"]');
      if (textarea) { textarea.focus(); if (textarea.tagName === 'TEXTAREA') { textarea.value = text; textarea.dispatchEvent(new Event('input', { bubbles: true })); textarea.dispatchEvent(new Event('change', { bubbles: true })); } else { textarea.innerText = text; textarea.dispatchEvent(new Event('input', { bubbles: true })); } showNotice('Response pasted! Click Submit to post.', 'success'); }
      else { navigator.clipboard.writeText(text); showNotice('Copied - paste manually.', 'info'); }
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
    const isMaps = window.location.href.includes("google.com/maps");
    const pageReviews = isMaps ? getMapsReviews() : getReviewsFromPageData();
    const reviewCards = isMaps ? [...document.querySelectorAll("[data-review-id]")] : [...document.querySelectorAll("div.OUCuxb")];
    console.log('[RankSniper] v1.23 - reviews:', pageReviews.length, '| cards:', reviewCards.length);
    if (pageReviews.length === 0 || reviewCards.length === 0) return;
    reviewCards.forEach((reviewCard, i) => {
      if (reviewCard.querySelector('.ranksniper-btn')) return;
      if (reviewCard.innerText?.toLowerCase().includes('owner replied')) return;
      const reviewData = pageReviews[i] || pageReviews[0];
      if (!reviewData) return;
      const btn = document.createElement('button');
      btn.className = 'ranksniper-btn';
      btn.textContent = 'Draft AI Response';
      btn.addEventListener('click', async (e) => { e.stopPropagation(); e.preventDefault(); await handleDraftClick(btn, reviewData, reviewCard); });
      const isMaps = window.location.href.includes("google.com/maps");
      if (isMaps) {
        const replyBtn = reviewCard.querySelector("button[aria-label*='Reply']");
        if (replyBtn && !replyBtn.nextElementSibling?.classList.contains("ranksniper-btn")) { 
          replyBtn.insertAdjacentElement("afterend", btn); 
        } else if (!replyBtn) { reviewCard.appendChild(btn); }
      } else {
        const lGXsGc = reviewCard.querySelector("div.lGXsGc");
        if (lGXsGc) { lGXsGc.appendChild(btn); } else { reviewCard.appendChild(btn); }
      }
      console.log('[RankSniper] Injected into:', reviewCard.querySelector('.ranksniper-btn')?.parentElement?.className);
    });
  }

  const observer = new MutationObserver(() => { clearTimeout(window._rsInjectTimer); window._rsInjectTimer = setTimeout(() => { injectButtons(); repositionButton(); }, 300); });

  function repositionButton() {
    const btn = document.querySelector('.ranksniper-btn');
    if (!btn) return;
    const cancelBtn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Cancel');
    if (cancelBtn && btn.parentElement !== cancelBtn.parentElement) {
      cancelBtn.insertAdjacentElement('afterend', btn);
    }
  }
  observer.observe(document.body, { subtree: true, childList: true });

  async function init() {
    await loadProfile();
    console.log('[RankSniper] v1.23 loaded. API key:', geminiApiKey ? 'OK' : 'MISSING');
    setTimeout(injectButtons, 1000);
    setTimeout(injectButtons, 2500);
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();





