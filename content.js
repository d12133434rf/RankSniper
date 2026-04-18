// RankSniper - Content Script v1.5
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

  // Save to both Chrome local storage AND backend Supabase
  async function saveToHistory(reviewerName, rating, reviewText, response, score) {
    // Save locally
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

    // Save to backend — re-read token in case it wasn't loaded yet
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
            reviewerName,
            rating,
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
    let score = 50;
    const lower = text.toLowerCase();
    const words = text.split(/\s+/).length;

    // Length scoring — ideal is 60-120 words
    if (words >= 60 && words <= 120) score += 12;
    else if (words >= 40 && words < 60) score += 7;
    else if (words > 120 && words <= 150) score += 6;
    else if (words < 40) score -= 5;

    // Starts with Hi [Name]
    if (lower.startsWith('hi ') && !lower.startsWith('hi there')) score += 8;
    else if (lower.startsWith('hi there')) score += 2;

    // City mentioned
    if (profile?.city) {
      const cityFirst = profile.city.split(',')[0].trim().toLowerCase();
      if (lower.includes(cityFirst)) score += 8;
    }

    // Business name mentioned
    if (profile?.businessName && lower.includes(profile.businessName.toLowerCase())) score += 8;

    // SEO keywords used — up to 10 points for using keywords
    const kwSources = [profile?.keywords, profile?.services].filter(Boolean).join(',');
    const kwList = kwSources.split(',').map(k => k.trim().replace(/\[City\]/gi, '').trim().toLowerCase()).filter(Boolean);
    const kwFound = kwList.filter(k => k && lower.includes(k)).length;
    score += Math.min(kwFound * 3, 10);

    // Has a call to action
    const hasCTA = lower.includes('come back') || lower.includes('visit us') || lower.includes('see you') ||
      lower.includes('give us another') || lower.includes('contact us') || lower.includes('stop by') ||
      lower.includes('welcome you back') || lower.includes('hope to see') || lower.includes('love to have you') ||
      lower.includes('look forward') || lower.includes('see you soon') || lower.includes('next time');
    if (hasCTA) score += 8;

    // No dashes
    if (!text.includes('—') && !text.includes(' - ')) score += 4;

    // Generic AI phrases penalty
    const genericPhrases = ['we strive to', 'we apologize for any inconvenience', 'at your earliest convenience',
      'do not hesitate', 'please do not hesitate', 'we are committed to', 'it is our goal',
      'rest assured', 'we value your feedback', 'thank you for bringing this to our attention',
      'we pride ourselves', 'it means a lot', 'reviews like yours', 'we are thrilled',
      'we are delighted', 'we are so pleased'];
    const genericCount = genericPhrases.filter(p => lower.includes(p)).length;
    score -= genericCount * 8;

    // Missing greeting penalty
    if (!lower.includes('hi') && !lower.includes('thank')) score -= 10;

    return Math.min(Math.max(Math.round(score), 0), 100);
  }

  function getKeywords(text, profile) {
    const lower = text.toLowerCase();
    const found = [];
    if (profile?.city) {
      const cityFirst = profile.city.split(',')[0].trim().toLowerCase();
      if (lower.includes(cityFirst)) found.push(profile.city.split(',')[0].trim());
    }
    if (profile?.businessName && lower.includes(profile.businessName.toLowerCase())) found.push(profile.businessName);
    const keywordSources = [profile?.services, profile?.keywords].filter(Boolean).join(',');
    for (const s of keywordSources.split(',').map(x => x.trim())) {
      if (s && lower.includes(s.toLowerCase()) && !found.includes(s)) found.push(s);
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

  function getSearchReviews() {
    try {
      return [...document.querySelectorAll('.bwb7ce')].map(card => ({
        reviewerName: (card.querySelector('.Vpc5Fe') || {innerText:'Customer'}).innerText.trim() || 'Customer',
        rating: parseFloat(((card.querySelector('[aria-label*="out of"]') || {getAttribute:()=>'5 out of 5'}).getAttribute('aria-label')).match(/[\d.]+/)?.[0] || '5'),
        reviewText: (card.querySelector('.OA1nbd') || {innerText:''}).innerText.trim()
      })).filter(r => r.reviewText.length > 0);
    } catch (e) { return []; }
  }

  async function callGemini(reviewData, instruction, previousResponse) {
    if (!geminiApiKey) throw new Error('No API key. Open RankSniper popup and enter your Gemini API key.');
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=' + geminiApiKey;
    const p = businessProfile || {};
    const biz = p.businessName || 'Our Business';
    const city = p.city || 'our city';
    const type = p.businessType || 'local business';
    const tone = p.tone || 'friendly';
    const firstName = reviewData.reviewerName.split(' ')[0];
    const custom = p.customInstructions ? '\nAdditional instructions: ' + p.customInstructions : '';
    const keywords = p.keywords || p.services || '';

    let prompt;
    if (instruction && previousResponse) {
      prompt = 'You wrote this response to a Google review for ' + biz + ' in ' + city + ':\n\n"' + previousResponse + '"\n\nThe user wants you to change it: "' + instruction + '"\n\nRewrite the response keeping it natural and human. Start with "Hi ' + firstName + '," on its own line. Under 120 words. Never use dashes, hyphens, or em dashes anywhere. Write like a real business owner, not a corporate email. Keep it short and genuine.' + custom + '\n\nWrite only the new response, nothing else.';
    } else {
      const g = reviewData.rating <= 2 ? 'Negative review: apologize sincerely and explain improvements.' : reviewData.rating === 3 ? 'Mixed review: thank them and acknowledge issues.' : 'Positive review: thank them warmly.';
      // Build keyword prompt — pick 3-5 keywords to weave in naturally
      const kwList = keywords ? keywords.split(',').map(k => k.trim()).filter(Boolean) : [];
      const kwPrompt = kwList.length > 0
        ? ' Naturally weave in 3 to 5 of these SEO keywords where they fit organically in the response (replace [City] with ' + city + '): ' + kwList.slice(0, 8).join(', ') + '. Do not force them — only use ones that fit naturally.'
        : '';
      prompt = 'Respond to this Google review for ' + biz + ' (' + type + ') in ' + city + '. Tone: ' + tone + '. Start with "Hi ' + firstName + '," on its own line. ' + g + ' Naturally mention the business name and city once each.' + kwPrompt + ' Under 120 words. Write like a real business owner texting a customer. Use short sentences. Never use dashes, hyphens, em dashes, or any kind of dash anywhere in the response. Never use corporate phrases like "we are thrilled", "it means a lot", "reviews like yours", "we pride ourselves", or "we strive". Never stuff keywords unnaturally. Sound warm and genuine.' + custom + '\n\nReview (' + reviewData.rating + '/5): "' + reviewData.reviewText + '"\n\nWrite only the response, nothing else.';
    }

    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 200, temperature: 0.7 } }) });
    if (!res.ok) { const err = await res.json(); throw new Error(err?.error?.message || 'Gemini API error'); }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Could not generate response.';
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
    } catch (err) { showNotice('Error: ' + err.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Draft AI Response'; }
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
    // Check city — match first word of city in case format differs (e.g. "Sun City, AZ" vs "Sun City")
    if (businessProfile?.city) {
      const cityFirst = businessProfile.city.split(',')[0].trim().toLowerCase();
      if (!responseText.toLowerCase().includes(cityFirst)) missingKeywords.push(businessProfile.city);
    }
    // Check business name
    if (businessProfile?.businessName && !responseText.toLowerCase().includes(businessProfile.businessName.toLowerCase())) {
      missingKeywords.push(businessProfile.businessName);
    }

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
    const isSearch = url.includes('google.com/search');
    const isBusiness = url.includes('business.google.com');
    const reviews = isSearch ? getSearchReviews() : isBusiness ? getReviewsFromPageData() : [];
    const cards = [...document.querySelectorAll(isSearch ? '.bwb7ce' : 'div.OUCuxb')];

    cards.forEach((card, i) => {
      if (card.querySelector('.ranksniper-btn')) return;
      const reviewData = reviews[i] || reviews[0];
      if (!reviewData || !reviewData.reviewText) return;
      const btn = document.createElement('button');
      btn.className = 'ranksniper-btn';
      btn.textContent = 'Draft AI Response';
      btn.addEventListener('click', async (e) => { e.stopPropagation(); e.preventDefault(); await handleDraftClick(btn, reviewData, card); });
      if (isSearch) {
        const actionRow = card.querySelector('.dwrWYe');
        if (actionRow) actionRow.appendChild(btn);
        else {
          const rb = card.querySelector('.F87tLd');
          if (rb) rb.parentElement.appendChild(btn);
          else card.appendChild(btn);
        }
      } else {
        const row = card.querySelector('div.lGXsGc');
        if (row) row.appendChild(btn);
        else card.appendChild(btn);
      }
    });
  }

  let t = null;
  new MutationObserver((mutations) => {
    const hasNewNodes = mutations.some(m => m.addedNodes.length > 0);
    if (!hasNewNodes) return;
    clearTimeout(t);
    t = setTimeout(() => {
      injectButtons();
      const cancelBtn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Cancel');
      const btn = document.querySelector('.ranksniper-btn');
      if (cancelBtn && btn && btn.parentElement !== cancelBtn.parentElement) {
        cancelBtn.insertAdjacentElement('afterend', btn);
      }
    }, 500);
  }).observe(document.body, { subtree: true, childList: true });

  async function init() {
    await loadProfile();
    console.log('[RankSniper] v1.5 loaded. Logged in:', isLoggedIn, '| Plan:', userPlan);
    setTimeout(injectButtons, 2000);
    setTimeout(injectButtons, 4000);
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
