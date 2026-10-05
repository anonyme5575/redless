// Visual layer: chamfered holographic frames, rain, particle bursts, and the shareable score card.
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const app = $("#app");
  const cssVar = (n) => getComputedStyle(app).getPropertyValue(n).trim();
  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);

  // ---------- frames: SVG outlines sized to their element ([data-frame]) ----------
  const SVGNS = "http://www.w3.org/2000/svg";
  function framePaths(type, w, h) {
    if (type === "hex") {
      const c = Math.min(22, w * 0.09);
      return { outline: `M${c} 0H${w - c}L${w} ${h / 2}L${w - c} ${h}H${c}L0 ${h / 2}Z`,
               ticks: `M${c + 8} 0H${c + 40}M${w - c - 40} ${h}H${w - c - 8}` };
    }
    const c = type === "board" ? 18 : 9;
    const outline = `M${c} 0H${w - c}L${w} ${c}V${h - c}L${w - c} ${h}H${c}L0 ${h - c}V${c}Z`;
    if (type !== "board") return { outline, ticks: `M${c + 4} 0H${c + 22}` };
    const m = h / 2;
    return { outline,
      ticks: `M0 ${c + 6}V${c + 40}M${w} ${h - c - 40}V${h - c - 6}M${c + 6} ${h}H${c + 50}M${w - c - 50} 0H${w - c - 6}`,
      extra: `M-7 ${m - 26}L-14 ${m}L-7 ${m + 26}M${w + 7} ${m - 26}L${w + 14} ${m}L${w + 7} ${m + 26}` };
  }
  function drawFrame(el) {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    let svg = el.querySelector(":scope > .frame-svg");
    if (!svg) {
      svg = document.createElementNS(SVGNS, "svg"); svg.setAttribute("class", "frame-svg"); svg.setAttribute("aria-hidden", "true");
      svg.innerHTML = '<path class="fill"/><path class="line" pathLength="1"/><path class="tick"/><path class="line extra"/>';
      el.prepend(svg);
    }
    const p = framePaths(el.dataset.frame, w, h);
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const [fill, line, tick, extra] = svg.children;
    fill.setAttribute("d", el.dataset.frame === "board" ? "" : p.outline);
    line.setAttribute("d", p.outline); tick.setAttribute("d", p.ticks); extra.setAttribute("d", p.extra || "");
  }
  const observer = "ResizeObserver" in window ? new ResizeObserver((es) => es.forEach((e) => drawFrame(e.target))) : null;
  function initFrames(root = document) {
    root.querySelectorAll("[data-frame]").forEach((el) => {
      if (el.dataset.framed) return;
      el.dataset.framed = "1";
      observer ? observer.observe(el) : drawFrame(el);
    });
  }
  function redrawFrames(root) { root.querySelectorAll("[data-frame]").forEach(drawFrame); }

  // ---------- canvases ----------
  const fxCv = $("#fx"), fxCtx = fxCv.getContext("2d");
  const rainCv = $("#rain"), rainCtx = rainCv.getContext("2d");
  let drops = [], rainColor = "#36c9ff", parts = [], dirty = false;
  function sizeCanvases() {
    const r = app.getBoundingClientRect(), d = dpr();
    for (const [cv, cx] of [[fxCv, fxCtx], [rainCv, rainCtx]]) {
      cv.width = r.width * d; cv.height = r.height * d; cx.setTransform(d, 0, 0, d, 0, 0);
    }
    drops = Array.from({ length: Math.round(r.width / 4) }, () => newDrop(r.width, r.height, true));
  }
  window.addEventListener("resize", sizeCanvases);
  function newDrop(w, h, anywhere) {
    const z = Math.random();
    return { x: Math.random() * (w + 60), y: anywhere ? Math.random() * h : -20, len: 8 + z * 22, v: 7 + z * 11, a: 0.05 + z * 0.22 };
  }
  function drawRain(dt, speed) {
    const w = rainCv.width / dpr(), h = rainCv.height / dpr(), k = speed * dt / 16.7;
    rainCtx.clearRect(0, 0, w, h);
    rainCtx.strokeStyle = rainColor; rainCtx.lineWidth = 1;
    for (const d of drops) {
      d.y += d.v * k; d.x -= d.v * k * 0.12;
      if (d.y > h + 20) Object.assign(d, newDrop(w, h, false));
      rainCtx.globalAlpha = d.a;
      rainCtx.beginPath(); rainCtx.moveTo(d.x, d.y); rainCtx.lineTo(d.x + d.len * 0.12, d.y - d.len); rainCtx.stroke();
    }
    rainCtx.globalAlpha = 1;
  }

  // ---------- particles ----------
  function burst(x, y, color, kind, big = false) {
    const n = big ? 26 : 14;
    parts.push({ type: "hexring", x, y, r: 8, life: 1, color });
    if (kind === "onde") { parts.push({ type: "ring", x, y, r: 6, life: 1, color }); parts.push({ type: "ring", x, y, r: 2, life: 1.25, color }); return; }
    if (kind === "eclair") {
      for (let i = 0; i < 6; i++) parts.push({ type: "bolt", x, y, a: (i / 6) * Math.PI * 2 + Math.random() * 0.5, len: 30 + Math.random() * 40, life: 1, color });
      return;
    }
    const palette = kind === "confetti" ? [cssVar("--green"), cssVar("--gold"), cssVar("--holo"), cssVar("--red")] : [color];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * (big ? 6 : 4);
      parts.push({
        type: kind === "pixels" ? "px" : kind === "confetti" ? "conf" : "shard",
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (kind === "confetti" ? 2 : 0),
        rot: Math.random() * 6, life: 1, size: kind === "pixels" ? 5 + Math.random() * 4 : 2 + Math.random() * 3,
        color: palette[i % palette.length],
      });
    }
  }
  function hexPath(c, x, y, r) {
    c.beginPath();
    for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; c[i ? "lineTo" : "moveTo"](x + Math.cos(a) * r, y + Math.sin(a) * r); }
    c.closePath();
  }
  function drawFx(dt) {
    if (!parts.length && !dirty) return;
    dirty = parts.length > 0;
    fxCtx.clearRect(0, 0, fxCv.width, fxCv.height);
    const k = dt / 16.7;
    parts = parts.filter((p) => (p.life -= 0.03 * k) > 0);
    for (const p of parts) {
      fxCtx.globalAlpha = Math.min(1, p.life);
      fxCtx.fillStyle = fxCtx.strokeStyle = p.color;
      if (p.type === "ring" || p.type === "hexring") {
        p.r += (p.type === "ring" ? 3.2 : 2.4) * k; fxCtx.lineWidth = 3 * p.life;
        if (p.type === "ring") { fxCtx.beginPath(); fxCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2); } else hexPath(fxCtx, p.x, p.y, p.r);
        fxCtx.stroke();
      } else if (p.type === "bolt") {
        const d = p.len * (1.2 - p.life); fxCtx.lineWidth = 3;
        fxCtx.beginPath(); fxCtx.moveTo(p.x + Math.cos(p.a) * d * 0.4, p.y + Math.sin(p.a) * d * 0.4);
        fxCtx.lineTo(p.x + Math.cos(p.a + 0.3) * d * 0.7, p.y + Math.sin(p.a + 0.3) * d * 0.7);
        fxCtx.lineTo(p.x + Math.cos(p.a) * d, p.y + Math.sin(p.a) * d); fxCtx.stroke();
      } else {
        p.x += p.vx * k; p.y += p.vy * k; p.vy += (p.type === "conf" ? 0.12 : 0.16) * k; p.vx *= 0.98; p.rot += 0.2 * k;
        if (p.type === "px") fxCtx.fillRect(Math.round(p.x / 4) * 4, Math.round(p.y / 4) * 4, p.size, p.size);
        else if (p.type === "conf") { fxCtx.save(); fxCtx.translate(p.x, p.y); fxCtx.rotate(p.rot); fxCtx.fillRect(-4, -2, 8, 4); fxCtx.restore(); }
        else {
          fxCtx.save(); fxCtx.translate(p.x, p.y); fxCtx.rotate(p.rot);
          fxCtx.beginPath(); fxCtx.moveTo(0, -p.size * 2); fxCtx.lineTo(p.size, p.size); fxCtx.lineTo(-p.size, p.size); fxCtx.fill(); fxCtx.restore();
        }
      }
    }
    fxCtx.globalAlpha = 1;
  }

  // ---------- share card (1080×1350 PNG) ----------
  let cityImg = null;
  function loadCity() {
    if (cityImg) return Promise.resolve(cityImg);
    return new Promise((res) => {
      const im = new Image();
      im.onload = () => { cityImg = im; res(im); };
      im.onerror = () => res(null);
      im.src = "assets/city.jpg";
    });
  }
  function chamfer(c, x, y, w, h, k) {
    c.beginPath();
    c.moveTo(x + k, y); c.lineTo(x + w - k, y); c.lineTo(x + w, y + k); c.lineTo(x + w, y + h - k);
    c.lineTo(x + w - k, y + h); c.lineTo(x + k, y + h); c.lineTo(x, y + h - k); c.lineTo(x, y + k); c.closePath();
  }
  // d: { score, mode, bpm, level, combo, rank, date, code }
  async function shareCard(d) {
    const W = 1080, H = 1350, cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const c = cv.getContext("2d");
    try { await Promise.all([document.fonts.load("800 100px Oxanium"), document.fonts.load("700 40px 'Chakra Petch'")]); } catch {}
    const col = { bg: cssVar("--bg"), holo: cssVar("--holo"), green: cssVar("--green"), red: cssVar("--red"), ink: cssVar("--ink"), muted: cssVar("--muted"), gold: cssVar("--gold") };
    c.fillStyle = col.bg; c.fillRect(0, 0, W, H);
    const img = await loadCity();
    if (img) {
      c.globalAlpha = 0.45;
      const s = Math.max(W / img.width, H / img.height);
      c.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
      c.globalAlpha = 1;
    }
    const g = c.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.75);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.7)");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.fillStyle = "rgba(255,255,255,.035)";
    for (let y = 0; y < H; y += 4) c.fillRect(0, y, W, 1);

    c.shadowColor = col.holo; c.shadowBlur = 18;
    c.strokeStyle = col.holo; c.lineWidth = 4;
    chamfer(c, 60, 60, W - 120, H - 120, 46); c.stroke();
    c.shadowBlur = 0;

    c.textAlign = "center"; c.fillStyle = col.ink;
    c.font = "800 70px Oxanium, sans-serif";
    c.fillText("NE TOUCHE PAS LE", W / 2, 210);
    c.fillStyle = col.red; c.shadowColor = col.red; c.shadowBlur = 24;
    c.font = "800 110px Oxanium, sans-serif"; c.fillText("ROUGE", W / 2, 330);
    c.shadowBlur = 0;

    c.fillStyle = col.holo; c.font = "700 40px 'Chakra Petch', sans-serif";
    c.fillText(d.mode.toUpperCase() + (d.code ? ` · CODE ${d.code}` : ""), W / 2, 450);
    c.fillStyle = col.ink; c.shadowColor = col.holo; c.shadowBlur = 30;
    c.font = "800 300px Oxanium, sans-serif"; c.fillText(String(d.score), W / 2, 760);
    c.shadowBlur = 0;
    c.fillStyle = col.muted; c.font = "600 40px 'Chakra Petch', sans-serif";
    c.fillText(`${d.bpm} BPM  ·  NIVEAU ${d.level}  ·  COMBO ${d.combo}`, W / 2, 850);

    // a row of tiles as signature
    const tiles = [col.green, col.green, col.red, col.green, col.gold, col.green];
    const tw = 110, gap = 22, x0 = (W - (tiles.length * tw + (tiles.length - 1) * gap)) / 2;
    tiles.forEach((t, i) => { c.fillStyle = t; chamfer(c, x0 + i * (tw + gap), 920, tw, tw, 16); c.fill(); });

    c.fillStyle = col.gold; c.font = "700 44px 'Chakra Petch', sans-serif";
    c.fillText(`RANG : ${d.rank.toUpperCase()}`, W / 2, 1140);
    c.fillStyle = col.muted; c.font = "600 34px 'Chakra Petch', sans-serif";
    c.fillText(d.date, W / 2, 1200);
    return cv;
  }

  NT.fx = {
    initFrames, redrawFrames, sizeCanvases, drawRain, burst, drawFx, shareCard,
    setRainColor(c) { rainColor = c; }, cssVar,
  };
})();
