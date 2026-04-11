// RankSniper - Content Script v1.34
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

  function saveToHistory(reviewerName, rating, reviewText, response) {
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
  }

  function scoreResponse(text, profile) {
    let score = 0;
    const lower = text.toLowerCase();
    const words = text.split(/\s+/).length;
    if (words >= 50 && words <= 150) score += 30;
    else if (words >= 30) score += 15;
    if (lower.startsWith('hi ') || lower.includes('thank you')) score += 20;
    if (profile?.businessName && lower.includes(profile.businessName.toLowerCase())) score += 20;
    if (profile?.city && lower.includes(profile.city.toLowerCase())) score += 20;
    if (!text.includes('—')) score += 10;
    return Math.min(score, 100);
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

    let prompt;
    if (instruction && previousResponse) {
      prompt = 'You wrote this response to a Google review for ' + biz + ' in ' + city + ':\n\n"' + previousResponse + '"\n\nThe user wants you to change it: "' + instruction + '"\n\nRewrite the response keeping it natural and human. Start with "Hi ' + firstName + ',". Under 150 words. Avoid em dashes. Include city (' + city + ') and business name (' + biz + ') naturally.' + custom + '\n\nWrite only the new response, nothing else.';
    } else {
      const g = reviewData.rating <= 2 ? 'Negative review: apologize sincerely and explain improvements.' : reviewData.rating === 3 ? 'Mixed review: thank them and acknowledge issues.' : 'Positive review: thank them warmly.';
      prompt = 'Respond to this Google review for ' + biz + ' (' + type + ') in ' + city + '. Tone: ' + tone + '. Start with "Hi ' + firstName + ',". ' + g + ' Include city and business name. Under 150 words. Write in a natural, human way - avoid em dashes, overly formal language, and AI-sounding phrases. Use simple conversational sentences.' + custom + '\n\nReview (' + reviewData.rating + '/5): "' + reviewData.reviewText + '"\n\nWrite only the response.';
    }

    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 200, temperature: 0.7 } }) });
    if (!res.ok) { const err = await res.json(); throw new Error(err?.error?.message || 'Gemini API error'); }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Could not generate response.';
  }

  async function handleDraftClick(btn, reviewData, card) {
    await loadProfile();
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
      navigator.clipboard.writeText(text);
      saveToHistory(reviewData.reviewerName, reviewData.rating, reviewData.reviewText, text);
      const b = panel.querySelector('.rs-copy-btn');
      b.textContent = 'Copied!';
      setTimeout(() => b.textContent = 'Copy', 2000);
    });
    panel.querySelector('.rs-paste-btn').addEventListener('click', () => {
      const text = panel.querySelector('.rs-response-text').value;
      saveToHistory(reviewData.reviewerName, reviewData.rating, reviewData.reviewText, text);
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
        const rb = card.querySelector('.F87tLd');
        if (rb) rb.parentElement.appendChild(btn);
        else card.appendChild(btn);
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
    console.log('[RankSniper] v1.34 loaded. API key:', geminiApiKey ? 'OK' : 'MISSING');
    setTimeout(injectButtons, 2000);
    setTimeout(injectButtons, 4000);
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
