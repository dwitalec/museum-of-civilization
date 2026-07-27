/* =========================================================================
   Progressive M&A Evaluation Dashboard — main.js
   Pure vanilla JS. No build step, no backend. State lives in memory + a
   localStorage-backed "portfolio" of saved deals.
   ========================================================================= */

(function () {
  'use strict';

  /* ---------------------------------------------------------------------
     Shared state for the deal currently being evaluated.
     --------------------------------------------------------------------- */
  const currentDeal = {
    name: '',
    price: 0,
    basics: { core: 5, competition: 5, data: 5, patterns: 5 },
    pestle: { political: 5, economic: 5, social: 5, technological: 5, legal: 5, environmental: 5 },
    reasons: [],
    confidence: 5,
    score: 0,
    verdict: 'PENDING'
  };

  const PORTFOLIO_KEY = 'pg_ma_portfolio_v1';

  /* =======================================================================
     1. TAB NAVIGATION
     ======================================================================= */
  const tabButtons = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.panel');

  function showPanel(targetId) {
    panels.forEach((p) => p.classList.toggle('active', p.id === targetId));
    tabButtons.forEach((b) => {
      const isActive = b.dataset.target === targetId;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', String(isActive));
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => showPanel(btn.dataset.target));
  });

  // Wire up the in-flow "Continue / Back" buttons to the same navigation.
  document.getElementById('toPreMortemBtn').addEventListener('click', () => {
    if (!validateEvaluationForm()) return;
    syncEvaluationState();
    document.getElementById('premortemTargetName').textContent = currentDeal.name || 'this target';
    showPanel('pre-mortem');
  });

  document.getElementById('backToEvalBtn').addEventListener('click', () => showPanel('evaluation-engine'));
  document.getElementById('backToPreMortemBtn').addEventListener('click', () => showPanel('pre-mortem'));

  document.getElementById('toSynthesisBtn').addEventListener('click', () => {
    if (!validatePreMortem()) return;
    syncPreMortemState();
    calculateDealViabilityScore();
    renderSynthesisReport();
    showPanel('executive-synthesis');
  });

  document.getElementById('newEvalBtn').addEventListener('click', resetEvaluation);

  /* =======================================================================
     2. LIVE SLIDER VALUE DISPLAY
     Every <input type="range"> is paired with an <output for="..."> element.
     We keep the output text and the track's fill (--val custom property)
     in sync on every input event.
     ======================================================================= */
  function bindSlider(input) {
    const output = document.querySelector(`output[for="${input.id}"]`);
    const update = () => {
      const min = Number(input.min) || 0;
      const max = Number(input.max) || 10;
      const pct = ((Number(input.value) - min) / (max - min)) * 100;
      input.style.setProperty('--val', pct + '%');
      if (output) output.textContent = input.value;
    };
    input.addEventListener('input', update);
    update();
  }

  document.querySelectorAll('input[type="range"]').forEach(bindSlider);

  /* =======================================================================
     3. EVALUATION ENGINE — read & validate
     ======================================================================= */
  function validateEvaluationForm() {
    const nameInput = document.getElementById('targetName');
    const priceInput = document.getElementById('targetPrice');
    const msg = document.getElementById('evalValidation');

    const name = nameInput.value.trim();
    const price = priceInput.value;

    if (!name) {
      msg.textContent = 'Enter the target company name before continuing.';
      msg.className = 'validation-msg error';
      nameInput.focus();
      return false;
    }
    if (price === '' || Number(price) < 0 || Number.isNaN(Number(price))) {
      msg.textContent = 'Enter a valid estimated purchase price ($M) before continuing.';
      msg.className = 'validation-msg error';
      priceInput.focus();
      return false;
    }

    msg.textContent = '';
    msg.className = 'validation-msg';
    return true;
  }

  function syncEvaluationState() {
    currentDeal.name = document.getElementById('targetName').value.trim();
    currentDeal.price = Number(document.getElementById('targetPrice').value);

    currentDeal.basics = {
      core: Number(document.getElementById('q-core').value),
      competition: Number(document.getElementById('q-competition').value),
      data: Number(document.getElementById('q-data').value),
      patterns: Number(document.getElementById('q-patterns').value)
    };

    currentDeal.pestle = {
      political: Number(document.getElementById('p-political').value),
      economic: Number(document.getElementById('p-economic').value),
      social: Number(document.getElementById('p-social').value),
      technological: Number(document.getElementById('p-technological').value),
      legal: Number(document.getElementById('p-legal').value),
      environmental: Number(document.getElementById('p-environmental').value)
    };
  }

  /* =======================================================================
     4. PRE-MORTEM SIMULATOR — read & validate
     ======================================================================= */
  const reasonsTextarea = document.getElementById('premortemReasons');
  const validationMsg = document.getElementById('premortemValidation');

  function parseReasons() {
    return reasonsTextarea.value
      .split('\n')
      .map((line) => line.replace(/^\s*\d+[.)]\s*/, '').trim())
      .filter((line) => line.length > 0);
  }

  function validatePreMortem() {
    const reasons = parseReasons();
    if (reasons.length < 3) {
      validationMsg.textContent = `Please list at least 3 reasons the deal failed (currently ${reasons.length}).`;
      validationMsg.className = 'validation-msg error';
      reasonsTextarea.focus();
      return false;
    }
    validationMsg.textContent = `${reasons.length} failure reasons captured.`;
    validationMsg.className = 'validation-msg ok';
    return true;
  }

  reasonsTextarea.addEventListener('input', () => {
    const count = parseReasons().length;
    if (count === 0) {
      validationMsg.textContent = '';
      validationMsg.className = 'validation-msg';
    } else if (count < 3) {
      validationMsg.textContent = `${count} of 3 minimum reasons entered.`;
      validationMsg.className = 'validation-msg';
    } else {
      validationMsg.textContent = `${count} failure reasons captured.`;
      validationMsg.className = 'validation-msg ok';
    }
  });

  function syncPreMortemState() {
    currentDeal.reasons = parseReasons();
    currentDeal.confidence = Number(document.getElementById('confidenceSlider').value);
  }

  /* =======================================================================
     5. DEAL VIABILITY SCORE (0-100)
     Weighting rationale:
       - 50% Strategic Fit: average of the 4 basic questions (each 0-10)
       - 30% Macro Resilience: inverted average of the 6 PESTLE/VUCA sliders
         (these sliders measure RISK, so lower risk => higher contribution)
       - 20% Mitigation Confidence: our pre-mortem confidence slider
     ======================================================================= */
  function calculateDealViabilityScore() {
    const b = currentDeal.basics;
    const basicAvg = (b.core + b.competition + b.data + b.patterns) / 4; // 0-10
    const basicScore = basicAvg * 10; // 0-100

    const p = currentDeal.pestle;
    const riskAvg = (p.political + p.economic + p.social + p.technological + p.legal + p.environmental) / 6; // 0-10
    const frictionScore = (10 - riskAvg) * 10; // 0-100, higher = less macro friction

    const confidenceScore = currentDeal.confidence * 10; // 0-100

    const weighted = (basicScore * 0.5) + (frictionScore * 0.3) + (confidenceScore * 0.2);
    currentDeal.score = Math.round(Math.max(0, Math.min(100, weighted)));

    if (currentDeal.score >= 75) currentDeal.verdict = 'PROCEED';
    else if (currentDeal.score >= 50) currentDeal.verdict = 'REVIEW';
    else currentDeal.verdict = 'REJECT';

    return currentDeal.score;
  }

  /* =======================================================================
     6. EXECUTIVE SYNTHESIS REPORT — render
     ======================================================================= */
  const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 52; // r=52, matches SVG in index.html

  function renderSynthesisReport() {
    document.getElementById('reportTargetName').textContent = currentDeal.name;
    document.getElementById('reportPrice').textContent = `$${currentDeal.price.toLocaleString()}M Estimated Price`;

    // Animated radial gauge
    const gaugeFill = document.getElementById('gaugeFill');
    const offset = GAUGE_CIRCUMFERENCE * (1 - currentDeal.score / 100);
    gaugeFill.style.strokeDasharray = String(GAUGE_CIRCUMFERENCE);
    // Force a reflow so the transition re-triggers on repeat evaluations.
    // eslint-disable-next-line no-unused-expressions
    gaugeFill.getBoundingClientRect();
    gaugeFill.style.strokeDashoffset = String(offset);
    document.getElementById('gaugeScore').textContent = currentDeal.score;

    let gaugeColor = 'var(--risk-high)';
    if (currentDeal.score >= 75) gaugeColor = 'var(--risk-low)';
    else if (currentDeal.score >= 50) gaugeColor = 'var(--risk-mid)';
    gaugeFill.style.stroke = gaugeColor;

    // Verdict banner
    const banner = document.getElementById('verdictBanner');
    const verdictText = document.getElementById('verdictText');
    banner.className = 'verdict-banner ' + currentDeal.verdict.toLowerCase();
    const verdictCopy = {
      PROCEED: 'PROCEED — Strategic fit and macro conditions support moving forward',
      REVIEW: 'REVIEW — Mixed signals; convene the deal team before committing capital',
      REJECT: 'REJECT — Risk profile and strategic fit do not justify this acquisition'
    };
    verdictText.textContent = verdictCopy[currentDeal.verdict];

    renderRiskBars();

    // Pre-mortem findings recap
    const list = document.getElementById('reportReasons');
    list.innerHTML = '';
    currentDeal.reasons.forEach((reason) => {
      const li = document.createElement('li');
      li.textContent = reason;
      list.appendChild(li);
    });
  }

  function riskColor(value) {
    // value is 0-10 risk level
    if (value >= 7) return 'var(--risk-high)';
    if (value >= 4) return 'var(--risk-mid)';
    return 'var(--risk-low)';
  }

  function renderRiskBars() {
    const container = document.getElementById('riskBars');
    container.innerHTML = '';

    const rows = [
      { label: 'Political', value: currentDeal.pestle.political },
      { label: 'Economic', value: currentDeal.pestle.economic },
      { label: 'Social', value: currentDeal.pestle.social },
      { label: 'Technological', value: currentDeal.pestle.technological },
      { label: 'Legal', value: currentDeal.pestle.legal },
      { label: 'Environmental', value: currentDeal.pestle.environmental },
      { label: 'Capability Gap', value: 10 - currentDeal.confidence }
    ];

    rows.forEach(({ label, value }) => {
      const row = document.createElement('div');
      row.className = 'risk-bar-row';

      const labelEl = document.createElement('span');
      labelEl.textContent = label;

      const track = document.createElement('div');
      track.className = 'risk-bar-track';
      const fill = document.createElement('div');
      fill.className = 'risk-bar-fill';
      fill.style.background = riskColor(value);
      track.appendChild(fill);

      const valueEl = document.createElement('span');
      valueEl.textContent = value.toFixed(0) + ' / 10';

      row.appendChild(labelEl);
      row.appendChild(track);
      row.appendChild(valueEl);
      container.appendChild(row);

      // Animate the fill in on the next frame so the transition is visible.
      requestAnimationFrame(() => {
        fill.style.width = (value / 10 * 100) + '%';
      });
    });
  }

  /* =======================================================================
     7. PORTFOLIO MAP (localStorage-backed)
     ======================================================================= */
  function loadPortfolio() {
    try {
      return JSON.parse(localStorage.getItem(PORTFOLIO_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  // Storage can be unavailable (private browsing, Safari on file:// URLs, or a
  // full quota). The portfolio is a convenience, not the core of the tool, so a
  // failure here degrades quietly rather than breaking the report flow.
  function savePortfolio(deals) {
    try {
      localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(deals));
      return true;
    } catch (e) {
      return false;
    }
  }

  // Holds deals in memory when localStorage is unavailable, so the map still
  // works for the duration of the session.
  let sessionDeals = null;

  function renderPortfolio(dealsOverride) {
    const deals = dealsOverride || sessionDeals || loadPortfolio();
    const plot = document.getElementById('portfolioPlot');
    const empty = document.getElementById('portfolioEmpty');
    const list = document.getElementById('portfolioList');

    // Clear previously plotted bubbles (keep the static gridlines/labels).
    plot.querySelectorAll('.deal-bubble').forEach((el) => el.remove());
    list.innerHTML = '';

    if (deals.length === 0) {
      empty.style.display = 'block';
      empty.textContent = 'No deals evaluated yet. Head to the Evaluation Engine to begin.';
      return;
    }
    empty.style.display = 'none';

    const maxPrice = Math.max(...deals.map((d) => d.price), 1);

    deals.forEach((deal) => {
      const bubble = document.createElement('div');
      bubble.className = 'deal-bubble';
      bubble.title = `${deal.name} — Score ${deal.score}, $${deal.price}M`;
      const xPct = Math.min(95, Math.max(5, (deal.price / maxPrice) * 90 + 5));
      const yPct = Math.min(95, Math.max(5, deal.score));
      bubble.style.left = xPct + '%';
      bubble.style.bottom = yPct + '%';
      bubble.style.background = deal.verdict === 'PROCEED'
        ? 'var(--risk-low)'
        : deal.verdict === 'REVIEW' ? 'var(--risk-mid)' : 'var(--risk-high)';
      plot.appendChild(bubble);

      const item = document.createElement('div');
      item.className = 'portfolio-item';
      item.innerHTML = `
        <span class="pi-name">${escapeHtml(deal.name)}</span>
        <span class="pi-meta">$${deal.price.toLocaleString()}M &middot; Score ${deal.score}</span>
        <span class="pi-verdict" style="background:${verdictBg(deal.verdict)};color:${verdictFg(deal.verdict)}">${deal.verdict}</span>
      `;
      list.appendChild(item);
    });
  }

  function verdictBg(v) {
    return v === 'PROCEED' ? 'rgba(46,158,107,0.22)' : v === 'REVIEW' ? 'rgba(217,164,65,0.22)' : 'rgba(200,80,63,0.22)';
  }
  function verdictFg(v) {
    return v === 'PROCEED' ? '#7be0ae' : v === 'REVIEW' ? '#ffd27a' : '#ff9d8e';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  document.getElementById('saveDealBtn').addEventListener('click', () => {
    const deals = loadPortfolio();
    deals.push({
      name: currentDeal.name,
      price: currentDeal.price,
      score: currentDeal.score,
      verdict: currentDeal.verdict,
      savedAt: new Date().toISOString()
    });

    if (!savePortfolio(deals)) {
      // Plot it for this session anyway so the click still does something visible.
      sessionDeals = deals;
      renderPortfolio(deals);
      showPanel('strategic-map');
      const empty = document.getElementById('portfolioEmpty');
      empty.style.display = 'block';
      empty.textContent = 'Browser storage is unavailable, so this deal is plotted for this session only and will be lost on refresh.';
      return;
    }

    sessionDeals = null;
    renderPortfolio();
    showPanel('strategic-map');
  });

  /* =======================================================================
     8. PRINT
     ======================================================================= */
  document.getElementById('printBtn').addEventListener('click', () => {
    document.getElementById('executive-synthesis').classList.add('panel-print-force');
    window.print();
  });

  window.addEventListener('afterprint', () => {
    document.getElementById('executive-synthesis').classList.remove('panel-print-force');
  });

  /* =======================================================================
     9. RESET
     ======================================================================= */
  function resetEvaluation() {
    document.getElementById('evaluationForm').reset();
    reasonsTextarea.value = '';
    document.querySelectorAll('.validation-msg').forEach((el) => {
      el.textContent = '';
      el.className = 'validation-msg';
    });
    document.querySelectorAll('input[type="range"]').forEach((input) => {
      input.value = 5;
      input.dispatchEvent(new Event('input'));
    });
    currentDeal.name = '';
    currentDeal.price = 0;
    currentDeal.reasons = [];
    currentDeal.score = 0;
    currentDeal.verdict = 'PENDING';
    showPanel('evaluation-engine');
  }

  /* =======================================================================
     INIT
     ======================================================================= */
  renderPortfolio();
})();
