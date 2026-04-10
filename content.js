// RankSniper - Content Script v1.24
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
      return reviews.map(r => ({ reviewText: r[5] || r[6] || '', rating: r[19] ?? 5, reviewerName: r[32]?.[1] || 'Customer' })).filter(r => r.reviewText.length > 0);
    } catch (e) { return []; }
  }
  function getMapsReviews() {
    try {
      return [...document.querySelectorAll('[data-review-id]')].map(card => {
        const nameEl = card.querySelector('.al6Kxe');
        const reviewerName = nameEl ? nameEl.innerText.split('\n')[0].trim() : 'Customer';
        const ratingEl = card.querySelector('.kvMYJc');
        const rating = parseInt(ratingEl?.getAttribute('aria-label')) || 5;
        const reviewText = card.querySelector('.wiI7pd')?.innerText.trim() || '';
        return { reviewerName, rating, reviewText };
      }).filter(r => r.reviewText.length > 0);
    } catch (e) { return []; }
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
    let g = reviewData.rating <= 2 ? 'Negative review: apologize sincerely and explain how you will improve.' : reviewData.rating === 3 ? 'Mixed review: thank them and acknowledge what fell short.' : 'Positive review: thank them warmly.';
    const prompt = 'Respond to this Google review for ' + biz + ' (' + type + ') in ' + city + '. Tone: ' + tone + '. Start with "Hi ' + firstName + ',". ' + g + ' Include city and business name naturally. Under 150 words. Sound human.\n\nReview (' + reviewData.rating + '/5): "' + reviewData.reviewText + '"\n\nWrite only the response.';
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 200, temperature: 0.7 } }) });
    if (!res.ok) { const err = await res.json(); throw new Error(err?.error?.message || 'Gemini API error'); }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Could not generate response.';
  }
  async function handleDraftClick(btn, reviewData, reviewCard) {
    await loadProfile();
    btn.disabled = true; btn.textContent = 'Generating...';
    try { const rt = await callGemini(reviewData); showPanel(reviewCard, rt, reviewData); }
    catch (err) { showNotice('Error: ' + err.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Draft AI Response'; }
  }
  function showPanel(reviewCard, responseText, reviewData) {
    reviewCard.querySelector('.rs-panel')?.remove();
    const panel = document.createElement('div');
    panel.className = 'rs-panel';
    const uid = Date.now();
    panel.innerHTML = '<div class="rs-panel-header"><span class="rs-panel-logo">RankSniper</span><div class="rs-panel-badges"><span class="rs-badge rs-badge-seo">SEO Optimized</span></div><button class="rs-panel-close">X</button></div><div class="rs-panel-body"><textarea class="rs-response-text" rows="6">' + responseText + '</textarea><div class="rs-panel-actions"><button class="rs-copy-btn">Copy</button><button class="rs-paste-btn">Paste into Reply Box</button><button class="rs-regen-btn">Regenerate</button></div><div class="rs-keywords-row"><span class="rs-keywords-label">Keywords used:</span><span class="rs-keywords-list" id="rs-kw-' + uid + '"></span></div></div>';
    reviewCard.appendChild(panel);
    setTimeout(() => { const kw = panel.querySelector('#rs-kw-' + uid); if (kw) { const p = businessProfile||{}; const lower = responseText.toLowerCase(); const tags = [p.city,p.businessName,...(p.services||'').split(',').map(s=>s.trim())].filter(k=>k&&lower.includes(k.toLowerCase())); kw.innerHTML = tags.map(k=>'<span class="rs-keyword-tag">'+k+'</span>').join('')||'<span style="color:#6b7280">None</span>'; } }, 100);
    panel.querySelector('.rs-panel-close').addEventListener('click', () => panel.remove());
    panel.querySelector('.rs-copy-btn').addEventListener('click', () => { navigator.clipboard.writeText(panel.querySelector('.rs-response-text').value); const b=panel.querySelector('.rs-copy-btn'); b.textContent='Copied!'; setTimeout(()=>b.textContent='Copy',2000); });
    panel.querySelector('.rs-paste-btn').addEventListener('click', () => {
      const replyBtn = reviewCard.querySelector('div.lGXsGc button') || reviewCard.querySelector('button[aria-label*="Reply"]');
      if (replyBtn) replyBtn.click();
      setTimeout(() => { const ta = document.querySelector('textarea[aria-label*="eply"],textarea[placeholder*="eply"]')||document.querySelector('textarea')||reviewCard.querySelector('[contenteditable="true"]'); if (ta) { ta.focus(); ta.value=panel.querySelector('.rs-response-text').value; ta.dispatchEvent(new Event('input',{bubbles:true})); ta.dispatchEvent(new Event('change',{bubbles:true})); showNotice('Pasted! Click Submit.','success'); } else { navigator.clipboard.writeText(panel.querySelector('.rs-response-text').value); showNotice('Copied - paste manually.','info'); } }, 800);
    });
    panel.querySelector('.rs-regen-btn').addEventListener('click', async () => { panel.remove(); const fb=reviewCard.querySelector('.ranksniper-btn'); if(fb) await handleDraftClick(fb,reviewData,reviewCard); });
  }
  function showNotice(message, type) {
    document.getElementById('rs-notice')?.remove();
    const n=document.createElement('div'); n.id='rs-notice'; n.className='rs-notice rs-notice-'+(type||'info'); n.textContent=message; document.body.appendChild(n); setTimeout(()=>n.remove(),4000);
  }
  function injectButtons() {
    const isMaps = window.location.href.includes('google.com/maps');
    const reviews = isMaps ? getMapsReviews() : getReviewsFromPageData();
    const cards = isMaps ? [...document.querySelectorAll('[data-review-id]')] : [...document.querySelectorAll('div.OUCuxb')];
    cards.forEach((card, i) => {
      if (card.querySelector('.ranksniper-btn')) return;
      const reviewData = reviews[i] || reviews[0];
      if (!reviewData || !reviewData.reviewText) return;
      const btn = document.createElement('button');
      btn.className = 'ranksniper-btn';
      btn.textContent = 'Draft AI Response';
      btn.addEventListener('click', async (e) => { e.stopPropagation(); e.preventDefault(); await handleDraftClick(btn, reviewData, card); });
      if (isMaps) {
        const replyBtn = card.querySelector('button[aria-label*="Reply"]');
        if (replyBtn) replyBtn.insertAdjacentElement('afterend', btn);
        else card.appendChild(btn);
      } else {
        const row = card.querySelector('div.lGXsGc');
        if (row) row.appendChild(btn);
        else card.appendChild(btn);
      }
    });
  }
  let t = null;
  const observer = new MutationObserver(() => { clearTimeout(t); t = setTimeout(injectButtons, 800); });
  observer.observe(document.body, { subtree: true, childList: true });
  async function init() {
    await loadProfile();
    console.log('[RankSniper] v1.24 loaded. API key:', geminiApiKey ? 'OK' : 'MISSING');
    setTimeout(injectButtons, 1500);
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();
