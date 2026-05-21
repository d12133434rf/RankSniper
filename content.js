// RankSniper - Content Script v1.9
(function () {
  // Only run on business.google.com
  if (!window.location.href.includes('business.google.com')) return;

  const BACKEND = 'https://ranksniperweb-production.up.railway.app';
  let businessProfile = null;
  let userPlan = 'free';
  let isLoggedIn = false;
  let rsToken = null;

  function loadProfile() {
    return new Promise(resolve => {
      chrome.storage.local.get(['ranksniperProfile', 'rsPlan', 'rsToken', 'rsUser'], result => {
        businessProfile = result.ranksniperProfile || null;
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
    // Start at 50 baseline — a response that follows basic format earns this
    let score = 50;
    const lower = text.toLowerCase();
    const words = text.split(/\s+/).filter(Boolean).length;

    // === LENGTH (max 12 points) — wider range since responses scale with review length ===
    if (words >= 60 && words <= 220) score += 12;
    else if (words >= 50 && words <= 250) score += 9;
    else if (words >= 40 && words <= 280) score += 5;
    else if (words < 30) score -= 8;

    // === GREETING (max 5 points) ===
    // Any personalized "Hi [name]" or even "Hi there" counts since it's still polite
    if (/^hi [a-z]/i.test(text) && !lower.startsWith('hi there')) score += 5;
    else if (lower.startsWith('hi there') || lower.startsWith('hello there')) score += 3;
    else if (lower.startsWith('hi ') || lower.startsWith('hello ')) score += 4;
    else if (lower.startsWith('thanks') || lower.startsWith('thank you')) score += 3;

    // === BUSINESS NAME MENTION (max 10 points) ===
    if (profile?.businessName) {
      const bizLower = profile.businessName.toLowerCase();
      const bizCount = (lower.match(new RegExp(bizLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      if (bizCount === 1) score += 10;
      else if (bizCount === 2) score += 7;
      else if (bizCount >= 3) score += 3;
    }

    // === CITY MENTION (max 10 points) ===
    if (profile?.city) {
      const cityLower = profile.city.split(',')[0].trim().toLowerCase();
      const cityCount = (lower.match(new RegExp(cityLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      if (cityCount === 1) score += 10;
      else if (cityCount === 2) score += 6;
    }

    // === BUSINESS TYPE / SERVICE MENTION (max 8 points) ===
    if (profile?.businessType) {
      const typeLower = profile.businessType.toLowerCase();
      if (lower.includes(typeLower)) score += 8;
    }

    // === SEO KEYWORDS (max 8 points — lowered since keywords are optional and AI doesn't force them) ===
    const kwSources = [profile?.keywords, profile?.services].filter(Boolean).join(',');
    if (kwSources) {
      const kwList = kwSources.split(',').map(k => k.trim().replace(/\[City\]/gi, '').trim().toLowerCase()).filter(k => k && k.length > 2);
      const kwFound = kwList.filter(k => lower.includes(k)).length;
      if (kwFound >= 2) score += 8;
      else if (kwFound === 1) score += 5;
    } else {
      // If user didn't set keywords, give them the points by default so they're not penalized
      score += 5;
    }

    // === CALL TO ACTION (max 6 points) ===
    const ctaPhrases = ['come back', 'visit us', 'see you again', 'see you soon', 'give us another',
      'stop by', 'come see us', 'hope to see', 'love to have you', 'next visit', 'try us again',
      'come on in', 'come by', 'swing by', 'reach out', 'let us know', 'give us a call',
      'another shot', 'another try', 'another chance', 'welcome back', 'invite you back',
      'hope you'];
    if (ctaPhrases.some(p => lower.includes(p))) score += 6;

    // === CONTRACTIONS — sounds human (max 4 points) ===
    const contractions = ["we're", "we've", "we'll", "don't", "didn't", "it's", "that's", "you're", "you'll", "i'm", "can't", "won't", "isn't", "wasn't"];
    const contractionCount = contractions.filter(c => lower.includes(c)).length;
    if (contractionCount >= 3) score += 4;
    else if (contractionCount >= 1) score += 2;

    // === NO EM DASHES OR EN DASHES (2 points) ===
    if (!text.includes('—') && !text.includes('–')) score += 2;

    // === SPECIFIC ACKNOWLEDGMENT (5 points) ===
    const specificMarkers = ['mentioned', 'said', 'glad you', 'sorry', 'hear that', 'hear your',
      'about the', 'on the', 'for the', 'happy you', 'love that', 'great that',
      'soggy', 'rude', 'tasteless', 'cold', 'hot', 'slow', 'fast', 'friendly', 'helpful'];
    if (specificMarkers.some(m => lower.includes(m))) score += 5;

    // === PENALTIES — generic corporate phrases (-5 each) ===
    const genericPhrases = ['we strive to', 'we apologize for any inconvenience', 'at your earliest convenience',
      'do not hesitate', 'please do not hesitate', 'we are committed to', 'it is our goal',
      'we take pride', 'rest assured', 'we value your feedback', 'thank you for bringing this to our attention',
      'thrilled', 'delighted', 'means the world', 'thank you for sharing', 'thank you for taking the time',
      'we pride ourselves', 'it means a lot', 'reviews like yours', 'utmost', 'valued customer',
      'esteemed', 'training protocols', 'standard of care', 'quality checks', 'implementing measures'];
    const genericCount = genericPhrases.filter(p => lower.includes(p)).length;
    score -= genericCount * 5;

    // === MISSING ESSENTIALS PENALTY ===
    if (!lower.includes('hi') && !lower.includes('hello') && !lower.includes('thank')) score -= 10;

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

  async function callGemini(reviewData, instruction, previousResponse) {
    const url = BACKEND + '/api/generate';
    const p = businessProfile || {};
    const biz = p.businessName || 'Our Business';
    const city = p.city || 'our city';
    const type = p.businessType || 'local business';
    const tone = p.tone || 'friendly';
    const rawFirst = reviewData.reviewerName.split(' ')[0];
    const firstName = rawFirst.length === 1 ? 'there' : rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1).toLowerCase();
    const custom = p.customInstructions ? '\nAdditional instructions: ' + p.customInstructions : '';
    // Replace [City] placeholder in keywords with actual city
    const rawKeywords = p.keywords || p.services || '';
    const keywords = rawKeywords.replace(/\[City\]/gi, city).trim();

    let prompt;
    if (instruction && previousResponse) {
      prompt = 'You wrote this Google review response for ' + biz + ' in ' + city + ':\n\n"' + previousResponse + '"\n\nThe user wants: "' + instruction + '"\n\nRewrite it. Start with "Hi ' + firstName + ',". Keep it under 100 words. Use contractions. Sound like a real person. No dashes of any kind.' + custom + '\n\nWrite only the response.';
    } else {
      // Pick a random opener style for variety so responses don't all sound identical
      const negOpeners = [
        'Open by acknowledging what specifically went wrong from their review (do not start with "We\'re really sorry")',
        'Open by taking ownership of the specific issue they mentioned (do not start with apology language)',
        'Open by naming the specific problem and showing you read their review (avoid generic apology phrases)',
        'Open by addressing the exact thing they were disappointed about (skip the generic apology)',
        'Open by acknowledging their specific frustration directly (do not lead with "sorry")'
      ];
      const negOpener = negOpeners[Math.floor(Math.random() * negOpeners.length)];

      const sentimentPrompt = reviewData.rating <= 2
        ? 'TONE: This is a negative review. Be genuine, not corporate. Take ownership of what specifically went wrong. Use everyday words. Briefly mention how you will address it (without saying "implementing" or "reviewing protocols" or "dropped the ball"). End by inviting them back. ' + negOpener + '. DO NOT use these phrases anywhere: "dropped the ball", "that\'s on us", "we\'re really sorry", "we are sorry to hear", "we apologize", "sincere apologies", "sincerely apologize".'
        : reviewData.rating === 3
        ? 'TONE: This is a mixed review. Acknowledge specifically what they liked AND what disappointed them. No corporate hedging. Briefly note one thing you will improve. End with a warm invite back. Do not start with generic apology phrases.'
        : 'TONE: This is a positive review. Be warm and grateful without being over-the-top. Reference one specific thing they mentioned. Sound like a real owner who just read this on their phone. Keep it conversational. End with a brief, sincere note inviting them back. Do not start with "Thank you so much" or "Thanks so much".';

      const kwPrompt = keywords
        ? ' Include 1 keyword only if it sounds completely natural in context, do not force it: ' + keywords + '.'
        : '';

      // Scale response length to review length so detailed reviews get detailed responses
      const reviewWordCount = reviewData.reviewText.split(/\s+/).filter(Boolean).length;
      let lengthRule;
      let detailRule;
      if (reviewWordCount < 25) {
        lengthRule = '60 to 90 words';
        detailRule = 'Reference the specific thing they mentioned.';
      } else if (reviewWordCount < 60) {
        lengthRule = '80 to 120 words';
        detailRule = 'Address each specific issue or compliment they mentioned by name.';
      } else if (reviewWordCount < 120) {
        lengthRule = '120 to 170 words';
        detailRule = 'Address EVERY specific point they raised (each complaint or compliment must get its own sentence acknowledging it directly). Do not lump multiple issues into one vague sentence.';
      } else {
        lengthRule = '160 to 220 words';
        detailRule = 'Address EVERY specific point they raised individually (each complaint or compliment must get its own sentence). For long detailed reviews, the response must match that depth. Do not lump multiple issues together with vague phrases.';
      }

      prompt = 'You are the owner of ' + biz + ', a ' + type + ' in ' + city + '. Respond to this Google review.\n\n' +
        'Review (' + reviewData.rating + '/5 stars, ' + reviewWordCount + ' words): "' + reviewData.reviewText + '"\n\n' +
        'HARD REQUIREMENTS:\n' +
        '- Start with: Hi ' + firstName + ',\n' +
        '- Length: ' + lengthRule + '\n' +
        '- ' + detailRule + '\n' +
        '- Mention the business name (' + biz + ') exactly once, naturally in a sentence\n' +
        '- Mention the city (' + city + ') exactly once, naturally in a sentence\n' +
        '- Use contractions (we\'re, don\'t, it\'s)\n' +
        '- Sound like a real business owner wrote it, not a PR firm\n' +
        '- The response should feel proportional to the review — longer reviews deserve longer, more thorough responses\n\n' +
        sentimentPrompt + '\n' +
        kwPrompt + '\n\n' +
        'BANNED WORDS AND PHRASES (do not use any of these): thrilled, delighted, excited, wonderful, amazing, fantastic, cherished, mortified, absolutely, sincerely, means the world, we look forward, we hope to see you, thank you for sharing, thank you for taking the time, at your earliest convenience, do not hesitate, we are committed, it is our goal, we take pride, we pride ourselves, we strive to, rest assured, standard of care, training protocols, quality checks, implementing, reviews like yours, valued customer, esteemed, utmost.\n\n' +
        'BANNED PUNCTUATION: no em dashes, no en dashes, no hyphens used as sentence breaks.\n\n' +
        custom + '\n\n' +
        'Write only the response. No quotes, no signature, no preamble.';
    }

        const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + rsToken },
      body: JSON.stringify({ prompt })
    });
    if (!res.ok) { const err = await res.json(); throw new Error(err?.error || 'Generation failed'); }
    const data = await res.json();
    let output = data.text || 'Could not generate response.';
    output = output.replace(/\bthrilled\b/gi, 'happy');
    output = output.replace(/\bdelighted\b/gi, 'glad');
    output = output.replace(/\bwonderful\b/gi, 'great');
    output = output.replace(/\bfantastic\b/gi, 'great');
    output = output.replace(/\bamazing\b/gi, 'great');
    output = output.replace(/ - /g, ' ');
    output = output.replace(/—/g, '');
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
      showPanel(card, responseText, reviewData, btn);
    } catch (err) { showNotice('Error: ' + err.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Draft AI Response'; }
  }

  async function pasteIntoReplyBox(text, card, draftBtn) {
    // Google only allows ONE reply box open at a time on the whole page.
    // So we ALWAYS need to find this review's Reply button and click it to ensure
    // the correct reply box is the one currently open.

    // Step 1: Find this review's Reply button. It's a sibling of the Draft AI button
    // (we injected Draft right next to the Cancel button which replaces Reply when open).
    // If reply is currently closed for this review, the Reply button is in the same row.
    function findReplyBtn() {
      // Look near the Draft button first
      if (draftBtn) {
        let el = draftBtn.parentElement;
        for (let i = 0; i < 6 && el; i++) {
          const r = el.querySelector('button[jsname="rhPddf"]');
          if (r) return r;
          el = el.parentElement;
        }
      }
      // Fallback: look in the card
      return card?.querySelector('button[jsname="rhPddf"]') || null;
    }

    // Step 2: Check if the reply box currently open belongs to THIS review.
    // We check by seeing if the existing textarea is a descendant of the same review row as draftBtn.
    function isOurTextareaOpen() {
      const ta = document.querySelector('textarea[jsname="YPqjbf"]');
      if (!ta || !draftBtn) return null;
      // Walk up from draftBtn looking for an ancestor that also contains the textarea
      let el = draftBtn.parentElement;
      for (let i = 0; i < 8 && el; i++) {
        if (el.contains(ta)) return ta;
        el = el.parentElement;
      }
      return null;
    }

    let textarea = isOurTextareaOpen();

    if (!textarea) {
      // Either no reply box is open, or it's open for a DIFFERENT review.
      // Click this review's Reply button to open the right one (Google will auto-close the other).
      const replyBtn = findReplyBtn();
      if (replyBtn) {
        replyBtn.click();
        await new Promise(resolve => setTimeout(resolve, 900));
        textarea = isOurTextareaOpen();
      }
    }

    if (textarea) {
      textarea.focus();
      // Use execCommand to set value so Google's JS registers it
      textarea.value = '';
      textarea.dispatchEvent(new Event('focus'));
      document.execCommand('insertText', false, text);
      // Fallback if execCommand didn't work
      if (!textarea.value) {
        textarea.value = text;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      }
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      showNotice('Response pasted! Click Post reply to publish.', 'info');
    } else {
      // Fallback to clipboard
      navigator.clipboard.writeText(text).then(() => {
        showNotice('Copied! Click Reply then paste with Ctrl+V.', 'info');
      });
    }
  }

  function showPanel(card, responseText, reviewData, draftBtn) {
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

    panel.querySelector('.rs-paste-btn').addEventListener('click', async () => {
      const text = panel.querySelector('.rs-response-text').value;
      const currentScore = scoreResponse(text, businessProfile);
      saveToHistory(reviewData.reviewerName, reviewData.rating, reviewData.reviewText, text, currentScore);
      panel.remove();
      await pasteIntoReplyBox(text, card, draftBtn);
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
    // Cancel button (jsname="gQ2Xie") appears when reply box is open
    const cancelBtns = [...document.querySelectorAll('button[jsname="gQ2Xie"]')];
    console.log('[RankSniper] business.google.com — found', cancelBtns.length, 'open reply boxes');

    cancelBtns.forEach((cancelBtn) => {
      if (cancelBtn.nextElementSibling?.classList.contains('ranksniper-btn')) return;

      // Container is div.OUCuxb — 4 levels up from Cancel button (confirmed via console)
      const reviewContainer = cancelBtn.parentElement?.parentElement?.parentElement?.parentElement;

      const reviewTextEl = reviewContainer?.querySelector('span.oiQd1c');
      const reviewText = reviewTextEl ? reviewTextEl.innerText.trim() : '';

      const nameEl = reviewContainer?.querySelector('a.LH5kS');
      const reviewerName = nameEl ? nameEl.innerText.trim() : 'Customer';

      const filledStars = reviewContainer?.querySelectorAll('span.DPvwYc.MOLvNc');
      const rating = filledStars && filledStars.length > 0 ? filledStars.length : 5;

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

      cancelBtn.insertAdjacentElement('afterend', btn);
      console.log('[RankSniper] Injected next to Cancel for:', reviewerName || 'Customer');
    });

    // Fallback: old-style OUCuxb cards
    const reviews = getReviewsFromPageData();
    const oldCards = [...document.querySelectorAll('div.OUCuxb')];
    oldCards.forEach((card, i) => {
      if (card.querySelector('.ranksniper-btn')) return;
      const reviewData = reviews[i] || reviews[0];
      if (!reviewData || !reviewData.reviewText) return;
      const btn = document.createElement('button');
      btn.className = 'ranksniper-btn';
      btn.textContent = 'Draft AI Response';
      btn.addEventListener('click', async (e) => { e.stopPropagation(); e.preventDefault(); await handleDraftClick(btn, reviewData, card); });
      const row = card.querySelector('div.lGXsGc');
      if (row) row.appendChild(btn);
      else card.appendChild(btn);
    });
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
    console.log('[RankSniper] v1.15 loaded. Logged in:', isLoggedIn, '| Plan:', userPlan);
    setTimeout(injectButtons, 1500);
    setTimeout(injectButtons, 3000);
    setTimeout(injectButtons, 6000);
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
