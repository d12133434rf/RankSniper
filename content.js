// RankSniper - Content Script v1.18
(function () {
  const GEMINI_API_KEY = 'AIzaSyDjrxPKNJB3o_7vac-JlG2aFdPjldZgYJQ';
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

  let businessProfile = null;
  let processedReviews = new Set();

  function loadProfile() {
    return new Promise(resolve => {
      chrome.storage.local.get(['ranksniperProfile'], result => {
        businessProfile = result.ranksniperProfile || null;
        resolve(result);
      });
    });
  }

  // Real GBP: each review card is div.OUCuxb
  function findReviewContainers() {
    const byReviewId = document.querySelectorAll('[data-review-id]');
    if (byReviewId.length > 0) return [...byReviewId];
    const real = document.querySelectorAll('div.OUCuxb');
    if (real.length > 0) return [...real];
    return [];
  }

  // Confirmed from real GBP HTML:
  //   Name:  <a class="LH5kS">
  //   Stars: span.DPvwYc (all 5 spans), span.DPvwYc.vVwMD (empty/grey)
  //   Text:  span.oiQd1c inside blockquote.rSdjR
  //   Reply: div.lGXsGc > button
  function extractReviewData(container) {
    // Name
    let reviewerName = 'Customer';
    const nameEl = container.querySelector('a.LH5kS');
    if (nameEl) reviewerName = nameEl.innerText.trim();

    // Rating: 5 total stars minus empty ones
    let rating = 5;
    const allStars   = container.querySelectorAll('span.DPvwYc');
    const emptyStars = container.querySelectorAll('span.DPvwYc.vVwMD');
    if (allStars.length === 5) {
      rating = 5 - emptyStars.length;
    }
    console.log('[RankSniper] name:', reviewerName, '| rating:', rating, '| empty stars:', emptyStars.length);

    // Review text
    let reviewText = '';
    const textEl = container.querySelector('span.oiQd1c')
                || container.querySelector('blockquote.rSdjR')
                || container.querySelector('.review-text');
    if (textEl) reviewText = textEl.innerText.trim();

    return { reviewerName, rating, reviewText };
  }

  async function callGemini(reviewData) {
    const profile   = businessProfile || {};
    const biz       = profile.businessName || 'Our Business';
    const city      = profile.city         || 'our city';
    const type      = profile.businessType || 'local business';
    const tone      = profile.tone         || 'friendly';
    const firstName = reviewData.reviewerName.split(' ')[0];

    let ratingGuidance = '';
    if (reviewData.rating <= 2) ratingGuidance = 'This is a negative review. Apologize sincerely, acknowledge their specific complaints, and explain how you will improve.';
    else if (reviewData.rating === 3) ratingGuidance = 'This is a mixed review. Thank them, acknowledge what fell short, and invite them back.';
    else ratingGuidance = 'This is a positive review. Thank them warmly and invite them back.';

    const prompt = `You are responding to a Google review for ${biz}, a ${type} in ${city}.
Tone: ${tone}.
Start your response with "Hi ${firstName}," — always use their first name.
${ratingGuidance}
Naturally include the city name (${city}) and business name (${biz}).
Keep it under 150 words. Sound genuine and human, not corporate.

Review (${reviewData.rating} out of 5 stars): "${reviewData.reviewText}"

Write only the response text, nothing else.`;

    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 200, temperature: 0.7 }
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err?.error?.message || 'Gemini API error');
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Could not generate response.';
  }

  function createSniperButton(reviewData, container) {
    const btn = document.createElement('button');
    btn.className = 'ranksniper-btn';
    btn.innerHTML = `<span class="rs-btn-icon">🎯</span><span class="rs-btn-text">Draft AI Response</span>`;
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      await handleDraftClick(btn, reviewData, container);
    });
    return btn;
  }

  async function handleDraftClick(btn, reviewData, container) {
    await loadProfile();
    const storedData = btn._reviewData || reviewData;
    console.log('[RankSniper] Generating for:', storedData.reviewerName, '| rating:', storedData.rating);
    btn.disabled = true;
    btn.innerHTML = `<span class="rs-btn-icon rs-spin">⟳</span><span class="rs-btn-text">Generating...</span>`;
    try {
      const responseText = await callGemini(storedData);
      showPanel(container, responseText, btn);
    } catch (err) {
      console.error('[RankSniper]', err);
      showNotice('Error: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<span class="rs-btn-icon">🎯</span><span class="rs-btn-text">Draft AI Response</span>`;
    }
  }

  function showPanel(container, responseText, sniperBtn) {
    container.querySelector('.rs-panel')?.remove();
    const panel = document.createElement('div');
    panel.className = 'rs-panel';
    const uid = Date.now();
    panel.innerHTML = `
      <div class="rs-panel-header">
        <span class="rs-panel-logo">🎯 RankSniper</span>
        <div class="rs-panel-badges"><span class="rs-badge rs-badge-seo">SEO Optimized</span></div>
        <button class="rs-panel-close">✕</button>
      </div>
      <div class="rs-panel-body">
        <textarea class="rs-response-text" rows="6">${responseText}</textarea>
        <div class="rs-panel-actions">
          <button class="rs-copy-btn">📋 Copy</button>
          <button class="rs-paste-btn">✍️ Paste into Reply Box</button>
          <button class="rs-regen-btn">🔄 Regenerate</button>
        </div>
        <div class="rs-keywords-row">
          <span class="rs-keywords-label">Keywords used:</span>
          <span class="rs-keywords-list" id="rs-kw-${uid}"></span>
        </div>
      </div>
    `;
    container.appendChild(panel);

    setTimeout(() => {
      const kwEl = panel.querySelector(`#rs-kw-${uid}`);
      if (kwEl) extractAndShowKeywords(kwEl, responseText);
    }, 100);

    panel.querySelector('.rs-panel-close')?.addEventListener('click', () => panel.remove());
    panel.querySelector('.rs-copy-btn')?.addEventListener('click', () => {
      navigator.clipboard.writeText(panel.querySelector('.rs-response-text').value);
      const b = panel.querySelector('.rs-copy-btn');
      b.textContent = '✅ Copied!';
      setTimeout(() => b.textContent = '📋 Copy', 2000);
    });
    panel.querySelector('.rs-paste-btn')?.addEventListener('click', () => {
      pasteIntoReplyBox(container, panel.querySelector('.rs-response-text').value);
    });
    panel.querySelector('.rs-regen-btn')?.addEventListener('click', async () => {
      panel.remove();
      const freshBtn = container.querySelector('.ranksniper-btn');
      if (freshBtn) await handleDraftClick(freshBtn, extractReviewData(container), container);
    });
  }

  function extractAndShowKeywords(el, text) {
    const profile = businessProfile || {};
    const keywords = [];
    const lower = text.toLowerCase();
    if (profile.city && lower.includes(profile.city.toLowerCase())) keywords.push(profile.city);
    if (profile.businessName && lower.includes(profile.businessName.toLowerCase())) keywords.push(profile.businessName);
    if (profile.services) {
      for (const s of profile.services.split(',').map(x => x.trim())) {
        if (s && lower.includes(s.toLowerCase())) keywords.push(s);
      }
    }
    el.innerHTML = keywords.map(k => `<span class="rs-keyword-tag">${k}</span>`).join('')
      || '<span style="color:#6b7280">None detected</span>';
  }

  function pasteIntoReplyBox(container, text) {
    const replyBtn = container.querySelector('div.lGXsGc button');
    if (replyBtn) replyBtn.click();
    setTimeout(() => {
      const textarea = document.querySelector('textarea[aria-label*="eply"], textarea[placeholder*="eply"]')
        || document.querySelector('textarea')
        || container.querySelector('[contenteditable="true"]');
      if (textarea) {
        textarea.focus();
        if (textarea.tagName === 'TEXTAREA') {
          textarea.value = text;
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          textarea.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          textarea.innerText = text;
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
        showNotice('Response pasted! Click Submit to post.', 'success');
      } else {
        navigator.clipboard.writeText(text);
        showNotice('Copied — paste manually into the reply box.', 'info');
      }
    }, 800);
  }

  function showNotice(message, type = 'info') {
    document.getElementById('rs-notice')?.remove();
    const notice = document.createElement('div');
    notice.id = 'rs-notice';
    notice.className = `rs-notice rs-notice-${type}`;
    notice.textContent = message;
    document.body.appendChild(notice);
    setTimeout(() => notice.remove(), 4000);
  }

  function injectButtons() {
    const containers = findReviewContainers();
    console.log('[RankSniper] Found', containers.length, 'containers');

    for (const container of containers) {
      // Always skip if button already injected successfully
      if (container.querySelector('.ranksniper-btn')) continue;
      const alreadyReplied = container.innerText?.toLowerCase().includes('owner replied')
        || container.querySelector('.replied-badge');
      if (alreadyReplied) continue;

      const reviewData = extractReviewData(container);
      if (!reviewData.reviewText || reviewData.reviewText.length < 5) {
        console.log('[RankSniper] Skipping container — text not ready yet, will retry');
        continue;
      }

      const btn = createSniperButton(reviewData, container);
      btn._reviewData = { ...reviewData };

      // Insert right after Reply button
      const replyBtn = container.querySelector('div.lGXsGc button');
      if (replyBtn) {
        replyBtn.insertAdjacentElement('afterend', btn);
      } else {
        container.appendChild(btn);
      }

      console.log('[RankSniper] ✅ Injected:', reviewData.reviewerName, '| ⭐', reviewData.rating, '| text:', reviewData.reviewText.substring(0, 40));
    }
  }

  const observer = new MutationObserver(() => {
    clearTimeout(window._rsInjectTimer);
    window._rsInjectTimer = setTimeout(injectButtons, 800);
  });
  observer.observe(document.body, { subtree: true, childList: true });

  async function init() {
    await loadProfile();
    console.log('[RankSniper] v1.18 loaded. Profile:', businessProfile ? '✅' : '⚠️ Not set');
    setTimeout(injectButtons, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
