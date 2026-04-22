// RankSniper - Content Script v1.8
(function () {
  const BACKEND = 'https://ranksniperweb-production.up.railway.app';
  let businessProfile = null;
  let geminiApiKey = null;
  let userPlan = 'free';
  let isLoggedIn = false;
  let rsToken = null;

  function loadProfile() {
    return new Promise(resolve => {
      chrome.storage.local.get(['ranksniperProfile', 'geminiApiKey', 'rsPlan', 'rsToken', 'rsUser'], result => {
        businessProfile = result.ranksniperProfile || null;
        geminiApiKey = result.geminiApiKey || null;
        userPlan = result.rsPlan || 'free';
        isLoggedIn = !!(result.rsToken && result.rsUser);
        rsToken = result.rsToken || null;
        resolve(result);
      });
    });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'RS_AUTH_UPDATE') {
      userPlan = msg.plan || 'free';
      isLoggedIn = true;
      if (msg.token) rsToken = msg.token;
    }
  });

  async function saveToHistory(reviewerName, rating, reviewText, response, score) {
    chrome.storage.local.get(['rsHistory'], result => {
      const history = result.rsHistory || [];
      history.unshift({
        date: new Date().toLocaleDateString(),
        reviewerName, rating,
        reviewText: reviewText.substring(0, 100),
        response,
        business: businessProfile?.businessName || 'Unknown'
      });
      chrome.storage.local.set({ rsHistory: history.slice(0, 50) });
    });

    const storedToken = rsToken || await new Promise(resolve => {
      chrome.storage.local.get(['rsToken'], r => resolve(r.rsToken || null));
    });
    if (storedToken) {
      rsToken = storedToken;
      try {
        await fetch(BACKEND + '/api/responses/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + rsToken },
          body: JSON.stringify({
            reviewerName, rating,
            reviewText: reviewText.substring(0, 500),
            responseText: response,
            businessName: businessProfile?.businessName || '',
            score: score || null
          })
        });
      } catch (err) {
        console.log('[RankSniper] Could not save to backend:', err.message);
      }
    }
  }

  function scoreResponse(text, profile) {
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
    const genericCount = genericPhrases.filter(p => lower.includes(p)).length;
    score -= genericCount * 5;
    if (!lower.includes('hi') && !lower.includes('thank')) score -= 8;
    return Math.min(Math.max(Math.round(score), 0), 100);
  }

  function getKeywords(text, profile) {
    const lower = text.toLowerCase();
    const found = [];
    if (profile?.city && lower.includes(profile.city.toLowerCase())) found.push(profile.city);
    if (profile?.businessName && lower.includes(profile.businessName.toLowerCase())) found.push(profile.businessName);
    if (profile?.services) {
      for (const s of profile.services.split(',').map(x => x.trim())) {
        if (s && lower.includes(s.toLowerCase())) found.push(s);
      }
    }
    return found;
  }

  function getReviewsFromPageData() {
    try {
      const script = document.querySelector('script.ds\\:3');
      if (!script) return [];
      const match = script.textContent.match(/data:(\[.*\])\s*,\s*sideChannel/s);
      if (!match) return [];
      const data = JSON.parse(match[1]);
      const reviews = data?.[2];
      if (!Array.isArray(reviews)) return [];
      return reviews.map(r => ({
        reviewText: r[5] || r[6] || '',
        rating: r[19] ?? 5,
        reviewerName: r[32]?.[1] || 'Customer'
      })).filter(r => r.reviewText.length > 0);
    } catch (e) { return []; }
  }

  function extractReviewDataFromCard(card) {
    const nameEl = card.querySelector('a.PskQHd');
    const reviewerName = nameEl ? nameEl.innerText.trim() || 'Customer' : 'Customer';
    const starsEl = card.querySelector('span[role="img"][aria-label*="out of"]');
    const rating = starsEl ? parseFloat(starsEl.getAttribute('aria-label').match(/[\d.]+/)?.[0] || '5') : 5;
    const textEl = card.querySelector('div.Fv38Af');
    const reviewText = textEl ? textEl.innerText.trim() : '';
    return { reviewerName, rating, reviewText };
  }

  async function callGemini(reviewData, instruction, previousResponse) {
    if (!geminiApiKey) throw new Error('No API key. Open RankSniper popup and enter your Gemini API key.');
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=' + geminiApiKey;
    const p = businessProfile || {};
    const biz = p.businessName || 'Our Business';
    const city = p.city || 'our city';
    const type = p.businessType || 'local business';
    const tone = p.tone || 'friendly';
    const rawFirst = reviewData.reviewerName.split(' ')[0];
    const firstName = rawFirst.length === 1 ? 'there' : rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1).toLowerCase();
    const custom = p.customInstructions ? '\nAdditional instructions: ' + p.customInstructions : '';
    const keywords = p.keywords || p.services || '';

    let prompt;
    if (instruction && previousResponse) {
      prompt = 'You wrote this response to a Google review for ' + biz + ' in ' + city + ':\n\n"' + previousResponse + '"\n\nThe user wants you to change it: "' + instruction + '"\n\nRewrite the response keeping it natural and human. Start with "Hi ' + firstName + ',". Under 150 words. Never use em dashes, hyphens, or any kind of dash. Never use the word thrilled, delighted, or excited. Include city (' + city + ') and business name (' + biz + ') naturally.' + custom + '\n\nWrite only the new response, nothing else.';
    } else {
      const g = reviewData.rating <= 2 ? 'Negative review: apologize sincerely and explain improvements.' : reviewData.rating === 3 ? 'Mixed review: thank them and acknowledge issues.' : 'Positive review: thank them warmly.';
      const kwPrompt = keywords ? ' Naturally weave 3 to 4 of these keywords into the response where they fit - spread them out across the response, do not list them all in one sentence: ' + keywords + '. Write like a real person, not a marketer. Each keyword should feel like it belongs in the sentence.' : '';
      prompt = 'Respond to this Google review for ' + biz + ' (' + type + ') in ' + city + '. Tone: ' + tone + '. Start with "Hi ' + firstName + ',". ' + g + ' Include city and business name.' + kwPrompt + ' Under 150 words. Write like a real business owner, not a marketing person. Never use em dashes, hyphens, or any kind of dash. Never use the words thrilled, delighted, excited, wonderful, amazing, fantastic, appreciate, valued, cherished, or means the world. Never start with "Thank you for sharing" or "Thank you for taking the time". Never say "we hope to see you" or "we look forward". Never use corporate filler. Keep it short, warm, and real.' + custom + '\n\nReview (' + reviewData.rating + '/5): "' + reviewData.reviewText + '"\n\nWrite only the response.';
    }

    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 200, temperature: 0.7 } }) });
    if (!res.ok) { const err = await res.json(); throw new Error(err?.error?.message || 'Gemini API error'); }
    const data = await res.json();
    let output = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Could not generate response.';
    output = output.replace(/\bthrilled\b/gi, 'happy');
    output = output.replace(/\bdelighted\b/gi, 'glad');
    output = output.replace(/\bwonderful\b/gi, 'great');
    output = output.replace(/\bfantastic\b/gi, 'great');
    output = output.replace(/\bamazing\b/gi, 'great');
    output = output.replace(/ - /g, ' ');
    output = output.replace(/\u2014/g, '');
    return output;
  }

  async function handleDraftClick(btn, reviewData, card) {
    await loadProfile();
    if (!isLoggedIn) {
      showNotice('Please log in via the RankSniper popup to use this feature.', 'error');
      return;
    }
    if (userPlan !== 'pro') {
      showNotice('Active subscription required. Visit getranksniper.com to subscribe.', 'error');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Generating...';
    try {
      const responseText = await callGemini(reviewData, null, null);
      showPanel(card, responseText, reviewData);
    } catch (err) {
      showNotice('Error: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Draft AI Response';
    }
  }

  function pasteIntoTextarea(text) {
    navigator.clipboard.writeText(text).then(() => {
      showNotice('Copied! Click the reply box and press Ctrl+V to paste.', 'info');
    });
  }

  function showPanel(card, responseText, reviewData) {
    card.querySelector('.rs-panel')?.remove();
    const panel = document.createElement('div');
    panel.className = 'rs-panel';
    const uid = Date.now();
    const score = scoreResponse(responseText, businessProfile);
    const scoreColor = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
    const keywords = getKeywords(responseText, businessProfile);
    const missingKeywords = [];
    if (businessProfile?.city && !responseText.toLowerCase().includes(businessProfile.city.toLowerCase())) missingKeywords.push(businessProfile.city);
    if (businessProfile?.businessName && !responseText.toLowerCase().includes(businessProfile.businessName.toLowerCase())) missingKeywords.push(businessProfile.businessName);

    panel.innerHTML = `
      <div class="rs-panel-header">
        <span class="rs-panel-logo">RankSniper</span>
        <div class="rs-panel-badges">
          <span class="rs-badge rs-badge-seo">SEO Optimized</span>
          <span style="background:${scoreColor}20;border:1px solid ${scoreColor};color:${scoreColor};font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;">Score: ${score}/100</span>
        </div>
        <button class="rs-panel-close">X</button>
      </div>
      <div class="rs-panel-body">
        <textarea class="rs-response-text" rows="5">${responseText}</textarea>
        ${missingKeywords.length > 0 ? '<div style="font-size:11px;color:#f59e0b;margin-top:6px;">Tip: Consider adding: ' + missingKeywords.join(', ') + '</div>' : ''}
        <div class="rs-panel-actions">
          <button class="rs-copy-btn">Copy</button>
          <button class="rs-paste-btn">Paste into Reply Box</button>
          <button class="rs-regen-btn">Regenerate</button>
        </div>
        <div class="rs-keywords-row">
          <span class="rs-keywords-label">Keywords used:</span>
          <span class="rs-keywords-list" id="rs-kw-${uid}"></span>
        </div>
        <div class="rs-chat-box">
          <div class="rs-chat-label">Refine this response:</div>
          <div class="rs-chat-input-row">
            <input type="text" class="rs-chat-input" placeholder='e.g. "Make it shorter" or "Sound more apologetic"'>
            <button class="rs-chat-send">Go</button>
          </div>
          <div class="rs-chat-history" id="rs-chat-${uid}"></div>
        </div>
      </div>
    `;
    card.appendChild(panel);

    setTimeout(() => {
      const kw = panel.querySelector('#rs-kw-' + uid);
      if (kw) kw.innerHTML = keywords.map(k => '<span class="rs-keyword-tag">' + k + '</span>').join('') || '<span style="color:#6b7280">None</span>';
    }, 100);

    panel.querySelector('.rs-panel-close').addEventListener('click', () => panel.remove());

    panel.querySelector('.rs-copy-btn').addEventListener('click', () => {
      const text = panel.querySelector('.rs-response-text').value;
      const currentScore = scoreResponse(text, businessProfile);
      navigator.clipboard.writeText(text);
      saveToHistory(reviewData.reviewerName, reviewData.rating, reviewData.reviewText, text, currentScore);
      const b = panel.querySelector('.rs-copy-btn');
      b.textContent = 'Copied!';
      setTimeout(() => b.textContent = 'Copy', 2000);
    });

    panel.querySelector('.rs-paste-btn').addEventListener('click', () => {
      const text = panel.querySelector('.rs-response-text').value;
      const currentScore = scoreResponse(text, businessProfile);
      saveToHistory(reviewData.reviewerName, reviewData.rating, reviewData.reviewText, text, currentScore);
      const rb = card.querySelector('.F87tLd') || card.querySelector('div.lGXsGc button') || card.querySelector('button[aria-label*="Reply"]');
      if (rb) rb.click();
      setTimeout(() => pasteIntoTextarea(text), 1000);
    });

    panel.querySelector('.rs-regen-btn').addEventListener('click', async () => {
      panel.remove();
      const fb = card.querySelector('.ranksniper-btn');
      if (fb) await handleDraftClick(fb, reviewData, card);
    });

    const chatInput = panel.querySelector('.rs-chat-input');
    const chatSend = panel.querySelector('.rs-chat-send');
    const chatHistory = panel.querySelector('#rs-chat-' + uid);

    async function sendInstruction() {
      const instruction = chatInput.value.trim();
      if (!instruction) return;
      const currentResponse = panel.querySelector('.rs-response-text').value;
      const userMsg = document.createElement('div');
      userMsg.style.cssText = 'font-size:11px;color:#60a5fa;margin-bottom:4px;';
      userMsg.textContent = 'You: ' + instruction;
      chatHistory.appendChild(userMsg);
      chatInput.value = '';
      chatSend.disabled = true;
      chatSend.textContent = '...';
      try {
        await loadProfile();
        const newResponse = await callGemini(reviewData, instruction, currentResponse);
        panel.querySelector('.rs-response-text').value = newResponse;
        const aiMsg = document.createElement('div');
        aiMsg.style.cssText = 'font-size:11px;color:#22c55e;margin-bottom:4px;';
        aiMsg.textContent = 'Done! Response updated above.';
        chatHistory.appendChild(aiMsg);
      } catch (err) {
        const errMsg = document.createElement('div');
        errMsg.style.cssText = 'font-size:11px;color:#ef4444;';
        errMsg.textContent = 'Error: ' + err.message;
        chatHistory.appendChild(errMsg);
      } finally {
        chatSend.disabled = false;
        chatSend.textContent = 'Go';
      }
    }

    chatSend.addEventListener('click', sendInstruction);
    chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendInstruction(); });
  }

  function showNotice(msg, type) {
    document.getElementById('rs-notice')?.remove();
    const n = document.createElement('div');
    n.id = 'rs-notice';
    n.className = 'rs-notice rs-notice-' + (type || 'info');
    n.textContent = msg;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 4000);
  }

  function injectButtons() {
    const url = window.location.href;
    const isBusiness = url.includes('business.google.com');
    const isSearch = url.includes('google.com/search');

    // ── business.google.com/reviews ─────────────────────────────────────────────
    if (isBusiness) {
      // Cancel button (jsname="gQ2Xie") appears when reply box is open — inject next to it
      const cancelBtns = [...document.querySelectorAll('button[jsname="gQ2Xie"]')];
      console.log('[RankSniper] business.google.com — found', cancelBtns.length, 'open reply boxes');

      cancelBtns.forEach((cancelBtn) => {
        if (cancelBtn.nextElementSibling?.classList.contains('ranksniper-btn')) return;

        // Walk up to find review container for data extraction
        const reviewContainer = cancelBtn.closest('li, [data-review-id], .k6DwOf, .oFvkI') || cancelBtn.parentElement?.parentElement?.parentElement;

        const reviewTextEl = reviewContainer?.querySelector('.OA1nbd, .Jtu6fd, .wiI7pd, [jsname="fbQN7e"]');
        const reviewText = reviewTextEl ? reviewTextEl.innerText.trim() : '';

        const nameEl = reviewContainer?.querySelector('.TSUbDb, .d4r55, .sCuL2, [jsname="gp20Tb"]');
        const reviewerName = nameEl ? nameEl.innerText.trim().split('\n')[0] : 'Customer';

        const starsEl = reviewContainer?.querySelector('[aria-label*="out of"], [aria-label*="star"]');
        const rating = starsEl ? parseFloat(starsEl.getAttribute('aria-label').match(/[\d.]+/)?.[0] || '5') : 5;

        const reviewData = { reviewerName, rating, reviewText };

        const btn = document.createElement('button');
        btn.className = 'ranksniper-btn';
        btn.textContent = 'Draft AI Response';
        btn.style.marginLeft = '8px';
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          e.preventDefault();
          await handleDraftClick(btn, reviewData, reviewContainer || cancelBtn.parentElement);
        });

        // Place right after Cancel button (same row)
        cancelBtn.insertAdjacentElement('afterend', btn);
        console.log('[RankSniper] Injected next to Cancel for:', reviewerName || 'Customer');
      });

      // Fallback: old-style OUCuxb cards
      const oldReviews = getReviewsFromPageData();
      const oldCards = [...document.querySelectorAll('div.OUCuxb')];
      oldCards.forEach((card, i) => {
        if (card.querySelector('.ranksniper-btn')) return;
        const reviewData = oldReviews[i] || oldReviews[0];
        if (!reviewData || !reviewData.reviewText) return;
        const btn = document.createElement('button');
        btn.className = 'ranksniper-btn';
        btn.textContent = 'Draft AI Response';
        btn.addEventListener('click', async (e) => { e.stopPropagation(); e.preventDefault(); await handleDraftClick(btn, reviewData, card); });
        const row = card.querySelector('div.lGXsGc');
        if (row) row.appendChild(btn);
        else card.appendChild(btn);
      });
      return;
    }

    // ── google.com/search ────────────────────────────────────────────────────────
    if (isSearch) {
      // Entry point 1: "1 Google review" link (jsaction="DdQmte") — inject button next to it
      const reviewCountLink = document.querySelector('a[jsaction="DdQmte"]');
      if (reviewCountLink && !document.querySelector('.ranksniper-search-btn')) {
        const btn = document.createElement('button');
        btn.className = 'ranksniper-btn ranksniper-search-btn';
        btn.textContent = 'Draft AI Response';
        btn.style.marginLeft = '8px';
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          e.preventDefault();
          await loadProfile();
          if (!isLoggedIn) { showNotice('Please log in via the RankSniper popup.', 'error'); return; }
          if (userPlan !== 'pro') { showNotice('Active subscription required. Visit getranksniper.com to subscribe.', 'error'); return; }
          // Grab review data from visible KuKPRc cards or Fv38Af text
          let reviewData = null;
          const cards = [...document.querySelectorAll('div.KuKPRc')];
          if (cards.length > 0) reviewData = extractReviewDataFromCard(cards[0]);
          if (!reviewData || !reviewData.reviewText) {
            const textEl = document.querySelector('div.Fv38Af');
            const starsEl = document.querySelector('span[role="img"][aria-label*="out of"]');
            const nameEl = document.querySelector('a.PskQHd');
            reviewData = {
              reviewerName: nameEl ? nameEl.innerText.trim() : 'Customer',
              rating: starsEl ? parseFloat(starsEl.getAttribute('aria-label').match(/[\d.]+/)?.[0] || '5') : 5,
              reviewText: textEl ? textEl.innerText.trim() : ''
            };
          }
          if (!reviewData.reviewText) { showNotice('Could not find review text on this page.', 'error'); return; }
          btn.disabled = true; btn.textContent = 'Generating...';
          try {
            const responseText = await callGemini(reviewData, null, null);
            showPanel(reviewCountLink.parentElement || document.body, responseText, reviewData);
          } catch (err) { showNotice('Error: ' + err.message, 'error'); }
          finally { btn.disabled = false; btn.textContent = 'Draft AI Response'; }
        });
        reviewCountLink.insertAdjacentElement('afterend', btn);
        console.log('[RankSniper] Injected next to "1 Google review" link');
      }

      // Entry point 2: "Read reviews" button (jsname="Q4Dse") — inject button next to it
      const readReviewsBtn = document.querySelector('button[jsname="Q4Dse"]');
      if (readReviewsBtn && !readReviewsBtn.nextElementSibling?.classList.contains('ranksniper-rr-btn')) {
        const btn = document.createElement('button');
        btn.className = 'ranksniper-btn ranksniper-rr-btn';
        btn.textContent = 'Draft AI Response';
        btn.style.marginLeft = '8px';
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          e.preventDefault();
          await loadProfile();
          if (!isLoggedIn) { showNotice('Please log in via the RankSniper popup.', 'error'); return; }
          if (userPlan !== 'pro') { showNotice('Active subscription required. Visit getranksniper.com to subscribe.', 'error'); return; }
          let reviewData = null;
          const cards = [...document.querySelectorAll('div.KuKPRc')];
          if (cards.length > 0) reviewData = extractReviewDataFromCard(cards[0]);
          if (!reviewData || !reviewData.reviewText) {
            const textEl = document.querySelector('div.Fv38Af');
            const starsEl = document.querySelector('span[role="img"][aria-label*="out of"]');
            const nameEl = document.querySelector('a.PskQHd');
            reviewData = {
              reviewerName: nameEl ? nameEl.innerText.trim() : 'Customer',
              rating: starsEl ? parseFloat(starsEl.getAttribute('aria-label').match(/[\d.]+/)?.[0] || '5') : 5,
              reviewText: textEl ? textEl.innerText.trim() : ''
            };
          }
          if (!reviewData.reviewText) { showNotice('Could not find review text on this page.', 'error'); return; }
          btn.disabled = true; btn.textContent = 'Generating...';
          try {
            const responseText = await callGemini(reviewData, null, null);
            showPanel(readReviewsBtn.parentElement || document.body, responseText, reviewData);
          } catch (err) { showNotice('Error: ' + err.message, 'error'); }
          finally { btn.disabled = false; btn.textContent = 'Draft AI Response'; }
        });
        readReviewsBtn.insertAdjacentElement('afterend', btn);
        console.log('[RankSniper] Injected next to "Read reviews" button');
      }

      // Also inject into any visible KuKPRc review cards
      const cards = [...document.querySelectorAll('div.KuKPRc')];
      console.log('[RankSniper] google.com/search — found', cards.length, 'KuKPRc cards');
      cards.forEach((card) => {
        if (card.querySelector('.ranksniper-btn')) return;
        const reviewData = extractReviewDataFromCard(card);
        if (!reviewData.reviewText) return;
        const btn = document.createElement('button');
        btn.className = 'ranksniper-btn';
        btn.textContent = 'Draft AI Response';
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          e.preventDefault();
          await handleDraftClick(btn, reviewData, card);
        });
        const actionRow = card.querySelector('.FkJOzc');
        if (actionRow) {
          actionRow.style.display = 'flex';
          actionRow.style.alignItems = 'center';
          actionRow.style.gap = '8px';
          actionRow.appendChild(btn);
        } else {
          card.appendChild(btn);
        }
      });
    }
  }

  let t = null;
  new MutationObserver((mutations) => {
    const hasNewNodes = mutations.some(m => m.addedNodes.length > 0);
    if (!hasNewNodes) return;
    clearTimeout(t);
    t = setTimeout(injectButtons, 500);
  }).observe(document.body, { subtree: true, childList: true });

  async function init() {
    await loadProfile();
    console.log('[RankSniper] v1.8 loaded. Logged in:', isLoggedIn, '| Plan:', userPlan);
    setTimeout(injectButtons, 1500);
    setTimeout(injectButtons, 3000);
    setTimeout(injectButtons, 6000);
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
