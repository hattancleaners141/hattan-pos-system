/* Hattan Ops Suite V35 — alterations "tailor talk" for AI intake (typed or spoken)
 *
 * Understands how counter staff and tailors actually say it and prices each job from the
 * Alterations price list (ALTERATION_VARIANTS), e.g.
 *   "hem 2 pants"                     → 2 × Shorten / Hem Pants
 *   "jeans keep original hem"         → Shorten Jeans — Keep Original Hem
 *   "take in waist and hem black slacks" → Hem + Waist Adjustment
 *   "taper the jeans, shorten jacket sleeves" → Taper Pants + Shorten Sleeves
 *   "blown crotch", "moth hole in sweater", "new zip on parka", "sew 3 buttons on shirt",
 *   "let out waist", "TI waist", "take up the dress", "shorten straps", "reline coat" …
 * A garment mentioned only with alteration words is NOT also added as dry cleaning, unless
 * cleaning is said too ("dry clean and hem 2 pants" adds both).
 */
(function () {
  'use strict';
  if (typeof ALTERATION_VARIANTS === 'undefined') return;
  const V = id => ALTERATION_VARIANTS.find(a => a.id === id);

  // ---- garments, in tailor words ----
  const GARMENTS = [
    ['jeans', /\b(?:jeans?|denims?|levis)\b/],
    ['suit', /\b(?:suits?|tux(?:edo)?s?)\b/],
    ['sportjacket', /\b(?:sport\s*(?:coat|jacket)s?|suit\s+jackets?|blazers?)\b/],
    ['wintercoat', /\b(?:parkas?|puffers?|down\s+(?:coat|jacket)s?|winter\s+(?:coat|jacket)s?|ski\s+jackets?|long\s+(?:winter\s+)?(?:coat|jacket)s?)\b/],
    ['coat', /\b(?:over\s*coats?|top\s*coats?|trench(?:\s*coats?)?|pea\s*coats?|coats?)\b/],
    ['jacket', /\b(?:jackets?|bombers?|windbreakers?)\b/],
    ['gown', /\b(?:gowns?|maxi(?:\s+dress(?:es)?)?|long\s+dress(?:es)?|bridesmaid\s+dress(?:es)?|prom\s+dress(?:es)?|wedding\s+dress(?:es)?)\b/],
    ['dress', /\b(?:dress(?:es)?)\b/],
    ['skirt', /\b(?:skirts?)\b/],
    ['blouse', /\b(?:blouses?|tops?)\b/],
    ['shirt', /\b(?:dress\s+shirts?|button[ -]?downs?|shirts?|polos?)\b/],
    ['sweater', /\b(?:sweaters?|cardigans?|knits?|jumpers?|hoodies?|sweatshirts?)\b/],
    ['pants', /\b(?:pants?|trousers?|slacks?|chinos?|khakis?|shorts|leggings|joggers)\b/],
    ['vest', /\b(?:vests?|waistcoats?)\b/],
  ];

  // ---- jobs, in tailor words (order matters: specific before general) ----
  const OPS = [
    ['ORIGHEM', /\b(?:orig(?:inal)?|og|euro(?:pean)?|factory|keep(?:ing)?\s+(?:the\s+)?(?:orig(?:inal)?\s+|factory\s+)?)\s*hems?\b|\bre-?attach(?:ed)?\s+(?:the\s+)?hems?\b/],
    ['SLEEVES', /\b(?:sleeves?|cuffs?\s+(?:on|of)\s+(?:the\s+)?(?:jacket|coat|blazer|shirt)s?)\b/],
    ['STRAPS', /\bstraps?\b/],
    ['CROTCH', /\b(?:crotch|inseam\s+(?:rip|hole|tear|split)|blown\s+out\s+crotch)\b/],
    ['LETDOWN', /\b(?:let\s+down|lengthen(?:ed|ing)?|let\s+out\s+(?:the\s+)?(?:length|hems?)|drop\s+(?:the\s+)?hems?|make\s+(?:them\s+|it\s+)?longer)\b/],
    ['WAISTOUT', /\b(?:let\s*(?:it\s+|them\s+)?out|l\.?o\.?\b|loosen|open\s+up|make\s+(?:it\s+|them\s+)?(?:bigger|looser)|waist\s+out)\b/],
    ['TAPER', /\b(?:taper(?:ed|ing)?|slim(?:\s+(?:down|fit|out))?|narrow(?:\s+(?:the\s+)?legs?)?|peg(?:ged)?|take\s+in\s+(?:the\s+)?(?:legs?|thighs?|sides?|body)|darts?)\b/],
    ['TAKEIN', /\b(?:take(?:n)?\s*(?:it\s+|them\s+)?in|took\s+in|bring\s+in|t\.?i\.?\b|nip(?:ped)?|tighten|make\s+(?:it\s+|them\s+)?(?:smaller|tighter)|waist\s+in)\b/],
    ['HEM', /\b(?:hem(?:s|med|ming)?|shorten(?:ed|ing)?|take\s+up|taken\s+up|turn\s+up|cut\s+(?:down|short)|too\s+long|length|cuff(?:s|ed)?|break)\b/],
    ['WAIST', /\bwaist(?:band)?\b/],
    ['ZIPPER', /\b(?:zip(?:per)?s?|zipp?er)\b/],
    ['BUTTON', /\bbuttons?\b/],
    ['HOOK', /\b(?:hook\s*(?:and|&|n)\s*eyes?|hooks?|snaps?)\b/],
    ['LINING', /\b(?:re-?lin(?:e|ing)|lining)\b/],
    ['HOLE', /\b(?:patch(?:es|ed)?|holes?|rips?|ripped|tears?|torn|darn(?:ing)?|moth(?:\s+holes?)?|reweav(?:e|ing))\b/],
    ['SEAM', /\b(?:seams?|split|open\s+seam|re-?sew|re-?stitch|stitch(?:ing)?|sew\s+(?:up|back)|came\s+apart|coming\s+apart|unravel(?:l?ing|ed)?)\b/],
  ];
  const CLEAN = /\b(?:dry\s*clean(?:ed|ing)?|clean(?:ed|ing)?|press(?:ed|ing)?|launder(?:ed)?|wash(?:ed)?)\b/;
  const NUM_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, pair: 1, both: 2, couple: 2 };

  const prep = t => ' ' + String(t || '').toLowerCase().replace(/[&+]/g, ' and ').replace(/[’']/g, '').replace(/\s+/g, ' ').trim() + ' ';
  function clauses(text) {
    // Split on punctuation, and on "and"/"also"/"plus" when a new garment starts.
    const parts = text.split(/[,;.\n]+|\b(?:also|plus|then)\b/).map(s => s.trim()).filter(Boolean);
    const out = [];
    parts.forEach(p => {
      const sub = p.split(/\band\b(?=\s+(?:\d+|one|two|three|four|five|a|an|the|his|her|my)?\s*(?:pair\s+of\s+)?(?:\w+\s+){0,2}?(?:jeans?|pants?|trousers?|slacks?|dress|gown|skirt|jacket|blazer|coat|parka|shirt|blouse|sweater|suit|vest)\b)/);
      sub.forEach(s => { s = s.trim(); if (s) out.push(s); });
    });
    return out;
  }
  function garmentIn(c) {
    let best = null;
    for (const [k, re] of GARMENTS) { const m = re.exec(c); if (m && (!best || m.index < best.index || (m.index === best.index && m[0].length > best.word.length))) best = { k, index: m.index, end: m.index + m[0].length, word: m[0] }; }
    return best;
  }
  function opsIn(c) {
    const found = [];
    let rest = c;
    for (const [k, re] of OPS) { const g = new RegExp(re.source, 'g'); let m; while ((m = g.exec(rest))) { found.push({ k, index: m.index, word: m[0] }); rest = rest.slice(0, m.index) + ' '.repeat(m[0].length) + rest.slice(m.index + m[0].length); g.lastIndex = m.index + m[0].length; } }
    return found.sort((a, b) => a.index - b.index);
  }
  function qtyBefore(c, idx) {
    const before = c.slice(0, idx);
    // a number right before the garment, allowing up to 2 describing words ("2 black wool pants")
    const m = before.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a|an|pair|both|couple)\s*(?:x\s+)?(?:pairs?\s+of\s+|of\s+)?((?:[a-z]+\s+){0,2})$/);
    if (m && !/\b(?:buttons?|on|in|for|with|to|the|and|hem|waist|zip\w*)\b/.test(m[2])) { const v = /^\d/.test(m[1]) ? Number(m[1]) : NUM_WORDS[m[1]]; if (v) return Math.min(50, v); }
    const x = c.match(/\bx\s*(\d+)\b|\b(\d+)\s*x\b/);
    if (x) return Math.min(50, Number(x[1] || x[2]));
    return 1;
  }
  function colorIn(c) { try { const cs = typeof v10FindColors === 'function' ? v10FindColors(c) : []; return cs[0] || 'print'; } catch (_) { return 'print'; } }

  // (garment, job) → price-list line
  function variantFor(g, op, ctx) {
    const long = /\b(?:long|maxi|gown|floor)\b/.test(ctx);
    const pick = (...ids) => ids.map(V).find(Boolean);
    const isPants = ['pants', 'jeans', 'suit'].includes(g);
    switch (op) {
      case 'ORIGHEM': return pick('jeans_hem_original');
      case 'HEM': case 'LETDOWN':
        if (g === 'jeans') return pick('jeans_hem', 'pants_hem_short', 'pants_hem');
        if (g === 'gown') return pick('dress_hem_long', 'dress_hem');
        if (g === 'dress') return long ? pick('dress_hem_long', 'dress_hem') : pick('dress_hem');
        if (g === 'skirt') return pick('skirt_hem', 'dress_hem');
        if (['jacket', 'sportjacket', 'coat', 'wintercoat', 'shirt', 'blouse', 'sweater', 'vest'].includes(g)) return pick('custom_alt', 'general_custom');
        return pick('pants_hem_short', 'pants_hem');
      case 'SLEEVES':
        if (['coat', 'wintercoat'].includes(g)) return pick('coat_sleeves', 'jacket_sleeves');
        if (['shirt', 'blouse', 'sweater'].includes(g)) return pick('custom_alt', 'general_custom');
        return pick('jacket_sleeves', 'jacket_sleeve');
      case 'TAPER':
        if (g === 'shirt') return pick('shirt_taper');
        if (g === 'blouse') return pick('blouse_taper', 'shirt_taper');
        if (['jacket', 'sportjacket'].includes(g)) return pick('sport_jacket_taper');
        if (['dress', 'gown'].includes(g)) return pick('dress_takein');
        return pick('pants_taper');
      case 'TAKEIN': case 'WAIST':
        if (['dress', 'gown'].includes(g)) return pick('dress_takein');
        if (g === 'shirt') return pick('shirt_taper');
        if (g === 'blouse') return pick('blouse_taper', 'shirt_taper');
        if (['jacket', 'sportjacket'].includes(g)) return pick('sport_jacket_taper');
        return pick('waist_in', 'pants_waist');
      case 'WAISTOUT': return ['dress', 'gown', 'jacket', 'sportjacket', 'shirt', 'blouse'].includes(g) ? pick('custom_alt', 'general_custom') : pick('waist_out', 'pants_waist');
      case 'ZIPPER':
        if (g === 'wintercoat') return pick('winter_jacket_zipper', 'coat_zipper');
        if (g === 'coat') return pick('coat_zipper', 'winter_jacket_zipper');
        if (['jacket', 'sportjacket'].includes(g)) return pick('jacket_zipper', 'coat_zipper');
        if (['dress', 'gown', 'skirt'].includes(g)) return pick('dress_zipper');
        return pick('pants_zipper');
      case 'BUTTON':
        if (['jacket', 'sportjacket', 'coat', 'wintercoat', 'suit', 'vest'].includes(g)) return pick('jacket_button', 'button_replace');
        if (['shirt', 'blouse'].includes(g)) return pick('shirt_button', 'button_replace');
        return pick('button_replace', 'shirt_button');
      case 'HOOK': return pick('general_hook');
      case 'LINING': return pick('lining_repair', 'custom_alt');
      case 'STRAPS': return pick('dress_straps', 'custom_alt');
      case 'CROTCH': return pick('crotch_hole', 'patch');
      case 'HOLE': return g === 'sweater' ? pick('sweater_hole', 'patch') : pick('patch', 'general_patch');
      case 'SEAM':
        if (['dress', 'gown', 'skirt'].includes(g)) return pick('dress_seam', 'seam_repair');
        if (['shirt', 'blouse'].includes(g)) return pick('shirt_seam', 'seam_repair');
        if (isPants) return pick('pants_seam', 'seam_repair');
        return pick('seam_repair', 'pants_seam');
    }
    return pick('custom_alt', 'general_custom');
  }

  function parse(raw) {
    const text = prep(raw), items = [];
    if (!OPS.some(([, re]) => re.test(text))) return items;
    const gAlt = typeof garmentById === 'function' ? garmentById('g_alteration') : null;
    if (!gAlt) return items;
    let lastGarment = null, lastQty = 1, lastColor = 'print';
    clauses(text).forEach(c => {
      const ops = opsIn(' ' + c + ' ');
      const g = garmentIn(c);
      if (!ops.length) { if (g) { lastGarment = g.k; lastQty = qtyBefore(c, g.index); lastColor = colorIn(c); } return; }
      const garment = g ? g.k : lastGarment;
      const qty = g ? qtyBefore(c, g.index) : lastQty;
      const color = g ? colorIn(c) : lastColor;
      if (g) { lastGarment = g.k; lastQty = qty; lastColor = color; }
      let kinds = [...new Set(ops.map(o => o.k))];
      // "waist" alone means take in unless "let out" was said; hem + waist on pants = combined job.
      if (kinds.includes('WAIST') && (kinds.includes('TAKEIN') || kinds.includes('WAISTOUT'))) kinds = kinds.filter(k => k !== 'WAIST');
      if (kinds.includes('ORIGHEM')) kinds = kinds.filter(k => k !== 'HEM');
      if (kinds.includes('SLEEVES')) kinds = kinds.filter(k => k !== 'HEM');
      if (kinds.includes('CROTCH')) kinds = kinds.filter(k => k !== 'HOLE' && k !== 'SEAM');
      if (kinds.includes('STRAPS')) kinds = kinds.filter(k => k !== 'HEM');
      const pantsLike = ['pants', 'jeans', 'suit', null].includes(garment);
      if (pantsLike && kinds.includes('HEM') && kinds.some(k => ['WAIST', 'TAKEIN', 'WAISTOUT'].includes(k)) && V('pants_length_waist')) {
        kinds = kinds.filter(k => !['HEM', 'WAIST', 'TAKEIN', 'WAISTOUT'].includes(k));
        kinds.unshift('__HEMWAIST');
      }
      // Suits: sleeves belong to the jacket, hem/waist/taper to the pants.
      kinds.forEach(k => {
        let gk = garment || 'pants';
        if (gk === 'suit') gk = ['SLEEVES', 'BUTTON', 'LINING'].includes(k) ? 'sportjacket' : 'pants';
        const a = k === '__HEMWAIST' ? V('pants_length_waist') : variantFor(gk, k, c);
        if (!a) return;
        let lineQty = qty;
        if (k === 'BUTTON') { const m = c.match(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|an)\s+(?:\w+\s+)?buttons?/); if (m) lineQty = (/^\d/.test(m[1]) ? Number(m[1]) : NUM_WORDS[m[1]]) * Math.max(1, g ? qty : 1); }
        const extra = [];
        if (/\bcuff(?:s|ed)?\b/.test(c) && k === 'HEM') extra.push('cuffs');
        if (k === 'LETDOWN') extra.push('let down / lengthen');
        if (/\bblind\s+(?:stitch|hem)\b/.test(c)) extra.push('blind stitch');
        if (/\bchain\s*stitch\b/.test(c)) extra.push('chain stitch');
        if (/\brush\b|\btoday\b/.test(c)) extra.push('RUSH');
        const measure = (c.match(/\b\d+(?:\.\d+)?\s*(?:"|in(?:ch(?:es)?)?\b|”)|\b\d+\s*\/\s*\d+\s*(?:"|in(?:ch(?:es)?)?)?/) || [])[0];
        if (measure) extra.push(measure.trim());
        items.push({
          garmentId: gAlt.id, materialId: 'standard', colorId: color || 'print', qty: lineQty, unitPrice: Number(a.price || 0), buttonType: 'none',
          garmentNote: [`${a.garment} · ${a.name}`, ...extra, a.price ? '' : 'PRICE TO QUOTE', 'AI — verify measurement'].filter(Boolean).join(' · '),
          serviceType: 'alterations', alterationVariantId: a.id,
        });
      });
    });
    return items;
  }
  window.hcParseAlterations = parse;

  // Replace the old alteration reader used by typed and spoken intake.
  // Global function declarations live on window, so replacing the window property updates every caller.
  const assign = (name, fn) => { window[name] = fn; };
  assign('v10ParseAlteration', function v35ParseAlteration(text) { try { return parse(text); } catch (e) { console.error('V35 alterations', e); return []; } });

  // Don't also add the garment as dry cleaning when the clause is only about alterations.
  if (typeof v10IsNonDryGarmentContext === 'function') {
    const base = v10IsNonDryGarmentContext;
    assign('v10IsNonDryGarmentContext', function v35NonDry(text, match) {
      const t = String(text || '');
      const startCut = Math.max(t.lastIndexOf(',', match.index), t.lastIndexOf(';', match.index), t.lastIndexOf('.', match.index));
      const ends = [',', ';', '.'].map(ch => t.indexOf(ch, match.end)).filter(i => i >= 0);
      const clause = ' ' + t.slice(startCut + 1, ends.length ? Math.min(...ends) : t.length).toLowerCase() + ' ';
      if (CLEAN.test(clause)) return false; // "dry clean and hem 2 pants" → clean AND alter
      return base(text, match) || OPS.some(([, re]) => re.test(clause));
    });
  }
})();
