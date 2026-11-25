// Browser checks for the on-video speed controller.
//
// How to run: serve the repository root (python3 -m http.server 8765), open
// http://localhost:8765/tests/harness.html in a window at least 1000 x 700,
// then run `await runVspTests()` in the console. Each entry in the result
// has { name, pass, detail }.
//
// The harness video is at (60, 60) and is 640 x 360.

(function () {
  const realSetTimeout = window.setTimeout.bind(window);
  const sleep = (ms) => new Promise((r) => realSetTimeout(r, ms));

  const INSIDE = { x: 380, y: 300 };   // on the video, away from the controller
  const OUTSIDE = { x: 850, y: 560 };  // on the page, off the video

  function assert(cond, message) {
    if (!cond) throw new Error(message);
  }

  // Search the document and every open shadow root.
  function roots() {
    const out = [document];
    document.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot) out.push(el.shadowRoot);
    });
    return out;
  }
  function all(sel) {
    return roots().flatMap((r) => Array.from(r.querySelectorAll(sel)));
  }
  function one(sel) {
    return all(sel)[0] || null;
  }
  function deepActive() {
    let a = document.activeElement;
    while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
    return a;
  }
  function isOurs(el) {
    if (!el) return false;
    if (String(el.className).includes('vsp-')) return true;
    return Array.from(el.attributes || []).some((a) => a.name.startsWith('data-vsp'));
  }

  function mouse(type, x, y, target) {
    const t = target || document.elementFromPoint(x, y) || document.body;
    t.dispatchEvent(new MouseEvent(type, {
      clientX: x, clientY: y, view: window,
      bubbles: type !== 'mouseenter', composed: true, cancelable: true
    }));
  }
  function moveTo(x, y) {
    mouse('mouseenter', x, y);
    mouse('mousemove', x, y);
  }
  // Poll until fn() is true. The page can run slowly when the browser pane
  // is in the background, so the checks wait for a result and do not use
  // fixed delays.
  async function waitFor(fn, timeout) {
    const end = Date.now() + (timeout || 3000);
    while (Date.now() < end) {
      if (fn()) return true;
      await sleep(50);
    }
    return !!fn();
  }
  // Move the pointer onto the video and wait for the controller.
  async function hover(p) {
    moveTo(p.x, p.y);
    await sleep(40);
    moveTo(p.x + 2, p.y + 2);
    await waitFor(() => isShown(controller()), 1500);
  }
  // Move the pointer off the video and wait for the controller to hide.
  async function leave() {
    moveTo(OUTSIDE.x, OUTSIDE.y);
    await sleep(40);
    moveTo(OUTSIDE.x + 2, OUTSIDE.y + 2);
    await waitFor(() => all('.vsp-controller').every(isHidden), 2000);
  }
  function key(k, opts) {
    const t = deepActive() || document.body;
    t.dispatchEvent(new KeyboardEvent('keydown', Object.assign({
      key: k, bubbles: true, composed: true, cancelable: true
    }, opts)));
  }

  const video = () => document.getElementById('v');
  const controller = () => one('.vsp-controller');
  function isShown(c) {
    return !!c && c.classList.contains('vsp-visible') && getComputedStyle(c).visibility === 'visible';
  }
  function isHidden(c) {
    const cs = getComputedStyle(c);
    return !c.classList.contains('vsp-visible') && (cs.opacity === '0' || cs.visibility === 'hidden');
  }
  async function openSettings() {
    await hover(INSIDE);
    controller().querySelector('.vsp-settings-button').click();
    await waitFor(() => one('.vsp-settings-modal'), 1000);
    const modal = one('.vsp-settings-modal');
    assert(modal, 'settings window did not open');
    return modal;
  }
  async function closeSettings() {
    const cancel = one('.vsp-settings-cancel');
    if (cancel) cancel.click();
    await waitFor(() => !one('.vsp-settings-modal'), 1000);
  }

  const tests = [];
  const test = (name, fn) => tests.push({ name, fn });

  // ---- Existing behaviour that must keep working ----

  test('controller shows when the pointer moves over the video', async () => {
    await hover(INSIDE);
    assert(isShown(controller()), 'controller is not visible after hover');
  });

  test('controller hides when the pointer leaves the video', async () => {
    await hover(INSIDE);
    await leave();
    assert(isHidden(controller()), 'controller is still visible after leave');
  });

  test('a speed button sets the playback rate and saves it', async () => {
    await hover(INSIDE);
    controller().querySelector('[data-speed="1.5"]').click();
    assert(video().playbackRate === 1.5, 'rate is ' + video().playbackRate);
    assert(window.__vspStore.preferredSpeed === 1.5, 'speed was not saved');
    assert(controller().querySelector('[data-speed="1.5"]').classList.contains('vsp-active'), 'button is not active');
  });

  test('keyboard shortcuts R, D and S change the speed', async () => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true }));
    assert(video().playbackRate === 1, 'R did not reset: ' + video().playbackRate);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true, cancelable: true }));
    assert(video().playbackRate === 1.5, 'D did not go faster: ' + video().playbackRate);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true }));
    assert(video().playbackRate === 1, 'S did not go slower: ' + video().playbackRate);
  });

  test('popup messages set and read the speed', async () => {
    let reply = null;
    window.__vspMessage({ action: 'setSpeed', speed: 2 }, {}, () => {});
    assert(video().playbackRate === 2, 'setSpeed did not apply');
    window.__vspMessage({ action: 'getSpeed' }, {}, (r) => { reply = r; });
    assert(reply && reply.speed === 2, 'getSpeed returned ' + JSON.stringify(reply));
    window.__vspMessage({ action: 'setSpeed', speed: 1 }, {}, () => {});
  });

  test('compact mode shows the speed list and the list sets the speed', async () => {
    await hover(INSIDE);
    const c = controller();
    c.querySelector('.vsp-toggle-button').click();
    assert(c.classList.contains('vsp-minimized'), 'controller did not minimize');
    assert(window.__vspStore.isMinimized === true, 'compact mode was not saved');
    c.querySelector('.vsp-current-speed').click();
    await sleep(50);
    const options = c.querySelectorAll('.vsp-dial-option');
    assert(options.length === 5, 'speed list has ' + options.length + ' options');
    options[2].click();
    await sleep(50);
    assert(video().playbackRate === 2, 'list did not set the speed');
    assert(!c.querySelector('.vsp-speed-dial'), 'list did not close');
    c.querySelector('.vsp-toggle-button').click();
    assert(!c.classList.contains('vsp-minimized'), 'controller did not expand');
    window.__vspMessage({ action: 'setSpeed', speed: 1 }, {}, () => {});
  });

  test('settings Save changes the preset buttons', async () => {
    let modal = await openSettings();
    modal.querySelector('.vsp-checkbox[value="0.5"]').click();
    modal.querySelector('.vsp-settings-save').click();
    await waitFor(() => !one('.vsp-settings-modal'), 1000);
    assert(!one('.vsp-settings-modal'), 'settings window did not close');
    assert(controller().querySelector('[data-speed="0.5"]'), '0.5x button was not added');
    assert(all('.vsp-controller').length === 1, 'controller count is ' + all('.vsp-controller').length);
    modal = await openSettings();
    modal.querySelector('.vsp-checkbox[value="0.5"]').click();
    modal.querySelector('.vsp-settings-save').click();
    await waitFor(() => !one('.vsp-settings-modal'), 1000);
    assert(!controller().querySelector('[data-speed="0.5"]'), '0.5x button was not removed');
  });

  test('visible controller follows the video when the page scrolls', async () => {
    await hover(INSIDE);
    window.scrollTo(0, 40);
    const gap = () => controller().getBoundingClientRect().top - video().getBoundingClientRect().top;
    const followed = await waitFor(() => Math.abs(gap() - 10) < 1, 2000);
    const seen = gap();
    window.scrollTo(0, 0);
    await waitFor(() => Math.abs(gap() - 10) < 1, 2000);
    assert(followed, 'controller is ' + seen + ' px below the video top, expected 10');
  });

  test('drag moves the controller and saves the position', async () => {
    await hover(INSIDE);
    const bar = controller().querySelector('.vsp-buttons');
    const r = bar.getBoundingClientRect();
    const start = { x: r.left + 3, y: r.top + 3 };
    mouse('mousedown', start.x, start.y, bar);
    mouse('mousemove', start.x + 100, start.y + 50, document.body);
    mouse('mouseup', start.x + 100, start.y + 50, document.body);
    await sleep(100);
    const saved = window.__vspStore.controllerOffset;
    assert(saved && saved.x === 110 && saved.y === 60, 'saved offset is ' + JSON.stringify(saved));
    const v = video().getBoundingClientRect();
    const c = controller().getBoundingClientRect();
    assert(Math.abs(c.left - (v.left + 110)) < 1, 'controller left is ' + c.left);
    // Put it back.
    const r2 = bar.getBoundingClientRect();
    mouse('mousedown', r2.left + 3, r2.top + 3, bar);
    mouse('mousemove', r2.left + 3 - 100, r2.top + 3 - 50, document.body);
    mouse('mouseup', r2.left + 3 - 100, r2.top + 3 - 50, document.body);
    await sleep(100);
  });

  // ---- Defect 1: the hidden controller must not receive clicks ----

  test('hidden controller does not take clicks from the video', async () => {
    await hover(INSIDE);
    const c = controller();
    const r = c.getBoundingClientRect();
    await leave();
    assert(isHidden(c), 'controller is not hidden');
    const hit = document.elementFromPoint(r.left + 30, r.top + 20);
    assert(getComputedStyle(c).visibility === 'hidden' || await waitFor(() => getComputedStyle(c).visibility === 'hidden'),
      'hidden controller still has visibility: visible');
    assert(hit === video(), 'click target is <' + hit.tagName.toLowerCase() + ' class="' + hit.className + '">, not the video');
  });

  // ---- Defect 2: a hidden video must not put a controller on the page ----

  test('a display:none video has no reachable controller', async () => {
    const hv = document.createElement('video');
    hv.style.display = 'none';
    hv.muted = true;
    hv.src = 'clip.mp4';
    document.body.appendChild(hv);
    await new Promise((r) => hv.addEventListener('loadedmetadata', r, { once: true }));
    await sleep(300);
    try {
      const hit = document.elementFromPoint(40, 25);
      assert(!isOurs(hit), 'page corner click target is our element: ' + hit.className);
      moveTo(40, 25);
      await sleep(40);
      moveTo(42, 27);
      await waitFor(() => all('.vsp-controller').some((c) => c.classList.contains('vsp-visible')), 800);
      const shown = all('.vsp-controller').filter((c) => c.classList.contains('vsp-visible'));
      assert(shown.length === 0, shown.length + ' controller(s) became visible at the page corner');
    } finally {
      hv.remove();
      await sleep(200);
    }
  });

  // ---- Defect 3: no work while the pointer is still ----

  test('extension does no work while the pointer is idle', async () => {
    await hover(INSIDE);
    assert(isShown(controller()), 'controller did not show');
    // Idle hide happens 2.5 s after the last pointer movement.
    const hid = await waitFor(() => isHidden(controller()), 5000);
    assert(hid, 'controller did not hide after idle time');
    await sleep(500);

    const counts = { rects: 0, frames: 0, timers: 0 };
    const proto = Element.prototype;
    const realRect = proto.getBoundingClientRect;
    const realRAF = window.requestAnimationFrame;
    const realTimeout = window.setTimeout;
    const realInterval = window.setInterval;
    proto.getBoundingClientRect = function () { counts.rects++; return realRect.call(this); };
    window.requestAnimationFrame = function (f) { counts.frames++; return realRAF.call(window, f); };
    window.setTimeout = function () { counts.timers++; return realTimeout.apply(window, arguments); };
    window.setInterval = function () { counts.timers++; return realInterval.apply(window, arguments); };
    await sleep(1500);
    proto.getBoundingClientRect = realRect;
    window.requestAnimationFrame = realRAF;
    window.setTimeout = realTimeout;
    window.setInterval = realInterval;

    assert(counts.rects === 0 && counts.frames === 0 && counts.timers === 0,
      'in 1.5 s idle: ' + counts.rects + ' layout reads, ' + counts.frames + ' animation frames, ' + counts.timers + ' timers');

    await hover(INSIDE);
    assert(isShown(controller()), 'controller did not show again after idle hide');
  });

  // ---- Defect 4: page styles must not change the controller ----

  test('page styles do not change the controller or the settings window', async () => {
    const hostile = document.createElement('style');
    hostile.textContent = [
      'p { height: 900px; }',
      'h3 { font-size: 60px; }',
      'button { text-transform: uppercase; letter-spacing: 6px; }',
      'body > div:not(.wrap) { transform: translateX(50px); }',
      'div { line-height: 5; }'
    ].join('\n');
    document.head.appendChild(hostile);
    try {
      const modal = await openSettings();
      const m = modal.getBoundingClientRect();
      assert(m.height < 480, 'settings window is ' + Math.round(m.height) + ' px high');
      const save = getComputedStyle(modal.querySelector('.vsp-settings-save'));
      assert(save.textTransform === 'none', 'Save button text-transform is ' + save.textTransform);
      assert(save.letterSpacing === 'normal', 'Save button letter-spacing is ' + save.letterSpacing);
      assert(/system|apple/i.test(getComputedStyle(modal).fontFamily), 'settings window font is ' + getComputedStyle(modal).fontFamily);
      await closeSettings();
      await hover(INSIDE);
      const v = video().getBoundingClientRect();
      const c = controller().getBoundingClientRect();
      assert(Math.abs(c.left - (v.left + 10)) < 1, 'controller left is ' + c.left + ', expected ' + (v.left + 10));
      assert(c.height < 60, 'controller is ' + Math.round(c.height) + ' px high');
    } finally {
      await closeSettings();
      hostile.remove();
    }
  });

  // ---- Defect 5: keyboard support in the settings window ----

  test('settings window is a labelled modal dialog', async () => {
    const modal = await openSettings();
    try {
      assert(modal.getAttribute('role') === 'dialog', 'role is ' + modal.getAttribute('role'));
      assert(modal.getAttribute('aria-modal') === 'true', 'aria-modal is ' + modal.getAttribute('aria-modal'));
      const labelId = modal.getAttribute('aria-labelledby');
      const label = labelId && modal.querySelector('#' + labelId);
      assert(label && label.textContent.trim(), 'dialog has no label');
    } finally {
      await closeSettings();
    }
  });

  test('focus moves into the settings window and stays there', async () => {
    const modal = await openSettings();
    try {
      assert(modal.contains(deepActive()), 'focus is on <' + deepActive().tagName.toLowerCase() + '>, not in the window');
      const focusable = modal.querySelectorAll('input, button');
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      last.focus();
      key('Tab');
      assert(deepActive() === first, 'Tab from the last control did not go to the first');
      key('Tab', { shiftKey: true });
      assert(deepActive() === last, 'Shift+Tab from the first control did not go to the last');
    } finally {
      await closeSettings();
    }
  });

  test('Escape closes the settings window and focus goes back to the gear', async () => {
    await openSettings();
    key('Escape');
    await waitFor(() => !one('.vsp-settings-modal'), 1000);
    assert(!one('.vsp-settings-modal'), 'Escape did not close the window');
    const active = deepActive();
    assert(active && active.classList.contains('vsp-settings-button'),
      'focus is on <' + active.tagName.toLowerCase() + ' class="' + active.className + '">');
  });

  test('page shortcuts do not fire while the settings window is open', async () => {
    await openSettings();
    try {
      window.__vspMessage({ action: 'setSpeed', speed: 1 }, {}, () => {});
      key('d');
      assert(video().playbackRate === 1, 'D changed the speed to ' + video().playbackRate);
    } finally {
      await closeSettings();
    }
  });

  test('controller buttons have accessible names and a focus ring', async () => {
    await hover(INSIDE);
    const c = controller();
    const unnamed = Array.from(c.querySelectorAll('button')).filter((b) =>
      !(b.getAttribute('aria-label') || b.textContent.trim()));
    assert(unnamed.length === 0, unnamed.length + ' button(s) have no name: ' + unnamed.map((b) => b.className).join(', '));
    const noType = Array.from(c.querySelectorAll('button')).filter((b) => b.getAttribute('type') !== 'button');
    assert(noType.length === 0, noType.length + ' button(s) are not type="button"');
    const sheets = roots().flatMap((r) => Array.from(r.styleSheets || []));
    const rules = sheets.flatMap((s) => { try { return Array.from(s.cssRules); } catch (e) { return []; } });
    const ours = rules.filter((r) => r.selectorText && r.selectorText.includes('vsp-'));
    const killers = ours.filter((r) => r.style.outlineStyle === 'none' && !r.selectorText.includes(':focus'));
    assert(killers.length === 0, killers.length + ' rule(s) remove the focus outline');
    assert(rules.some((r) => r.selectorText && r.selectorText.includes(':focus-visible')), 'no :focus-visible rule');
  });

  async function runVspTests() {
    for (let i = 0; i < 100 && !(window.__vspLoaded && controller()); i++) await sleep(100);
    const results = [];
    window.__vspResults = results;
    if (!controller()) {
      results.push({ name: 'setup', pass: false, detail: 'no controller was created' });
      return results;
    }
    for (const t of tests) {
      try {
        await t.fn();
        results.push({ name: t.name, pass: true, detail: '' });
      } catch (e) {
        results.push({ name: t.name, pass: false, detail: e.message });
      }
      // Reset between tests.
      await closeSettings();
      await leave();
    }
    window.__vspDone = true;
    return results;
  }

  window.runVspTests = runVspTests;
})();
