// Chaos mode mini-game: a screaming chicken runs across a farm and jumps over trees (tap = jump).
// Pure canvas, cartoon style. Everything is drawn in a virtual 400 × 300 space, scaled to the canvas.
// The game (game.js) owns time, lives and score: step() only reports what happened.
(() => {
  "use strict";
  const VW = 400, VH = 300, GROUND = 238;
  const INK = "#1d1a17";
  const rnd = (a, b) => a + Math.random() * (b - a);

  function Chicken(canvas) {
    const ctx = canvas.getContext("2d");
    let s = null;

    function start(tempo = 1) {
      const dpr = Math.min(2, window.devicePixelRatio || 1), r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
      s = {
        t: 0, y: 0, vy: 0, run: 0, air: false, hurtUntil: 0, shake: 0, scroll: 0,
        speed: 165 * tempo, obstacles: [], grains: [], parts: [], pops: [], next: 0.9,
        clouds: Array.from({ length: 4 }, (_, i) => ({ x: i * 120 + rnd(0, 60), y: rnd(25, 85), k: rnd(0.7, 1.2) })),
      };
      draw();
    }

    function jump() {
      if (!s || s.y > 2) return false;
      s.vy = 640; s.air = true;
      return true;
    }

    // Advances the world by dt ms. Returns { hit, grains } for this step.
    function step(dt, spawning = true) {
      const out = { hit: false, grains: 0 };
      if (!s) return out;
      const sec = dt / 1000;
      s.t += sec; s.scroll += s.speed * sec; s.run += sec * 14;
      // Jump physics
      s.vy -= 1500 * sec; s.y = Math.max(0, s.y + s.vy * sec);
      if (s.y === 0) {
        if (s.air) { s.air = false; for (let k = 0; k < 6; k++) s.parts.push({ x: 72 + rnd(-6, 22), y: GROUND, vx: rnd(-60, 20), vy: rnd(20, 70), life: 0.4, kind: "dust" }); }
        s.vy = Math.max(0, s.vy);
      }
      // Obstacles: round tree, pine, bush. Grains float above some gaps.
      s.next -= sec;
      if (spawning && s.next <= 0) {
        const r = Math.random(), kind = r < 0.45 ? "tree" : r < 0.8 ? "pine" : "bush";
        const h = kind === "bush" ? rnd(28, 38) : kind === "pine" ? rnd(74, 96) : rnd(68, 92);
        const w = kind === "bush" ? rnd(40, 52) : kind === "pine" ? rnd(36, 44) : rnd(34, 42);
        s.obstacles.push({ kind, x: VW + 30, w, h, apples: kind === "tree" ? Math.floor(rnd(0, 4)) : 0, seed: Math.random() });
        if (Math.random() < 0.6) s.grains.push({ x: VW + 30 + w / 2, y: GROUND - h - rnd(25, 45), got: false });
        s.next = rnd(1.15, 2) * (165 / s.speed) + 0.15;
      }
      for (const o of s.obstacles) o.x -= s.speed * sec;
      for (const g of s.grains) g.x -= s.speed * sec;
      s.obstacles = s.obstacles.filter((o) => o.x + o.w > -40);
      s.grains = s.grains.filter((g) => g.x > -20 && !g.got);
      // Collisions (chicken box shrunk so a near miss is a miss)
      const cx = 66, cw = 34, ch = 34, cy = s.y;
      if (s.t > s.hurtUntil) {
        for (const o of s.obstacles) {
          const ox = o.x + o.w * 0.18, ow = o.w * 0.64, oh = o.h * (o.kind === "pine" ? 0.8 : 0.88);
          if (ox < cx + cw && ox + ow > cx && cy < oh) {
            s.hurtUntil = s.t + 1.2; s.shake = 0.35; out.hit = true;
            for (let k = 0; k < 14; k++) s.parts.push({ x: cx + 16, y: GROUND - cy - 22, vx: rnd(-120, 120), vy: rnd(40, 200), life: rnd(0.6, 1.1), rot: rnd(0, 6), kind: "feather" });
            break;
          }
        }
      }
      for (const g of s.grains) {
        if (Math.abs(g.x - (cx + 18)) < 26 && Math.abs((GROUND - g.y) - (cy + 22)) < 30) {
          g.got = true; out.grains++;
          s.pops.push({ x: g.x, y: g.y, life: 0.7, text: "+2" });
          for (let k = 0; k < 5; k++) s.parts.push({ x: g.x, y: g.y, vx: rnd(-50, 50), vy: rnd(20, 90), life: 0.5, kind: "spark" });
        }
      }
      for (const p of s.parts) { p.life -= sec; p.x += p.vx * sec; p.y -= p.vy * sec; p.vy -= (p.kind === "feather" ? 120 : 300) * sec; if (p.rot !== undefined) p.rot += sec * 5; }
      s.parts = s.parts.filter((p) => p.life > 0);
      for (const p of s.pops) { p.life -= sec; p.y -= 40 * sec; }
      s.pops = s.pops.filter((p) => p.life > 0);
      s.shake = Math.max(0, s.shake - sec);
      draw();
      return out;
    }

    // ---------- drawing ----------
    function outline(w = 2.4) { ctx.lineWidth = w; ctx.strokeStyle = INK; ctx.lineJoin = "round"; ctx.lineCap = "round"; }
    function blob(x, y, r, fill, stroke = true) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); if (stroke) ctx.stroke(); }

    function sky() {
      const g = ctx.createLinearGradient(0, 0, 0, GROUND);
      g.addColorStop(0, "#5ec4f2"); g.addColorStop(0.7, "#bfe9f7"); g.addColorStop(1, "#f7e7b4");
      ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
      // Sun with slow rays
      ctx.save(); ctx.translate(340, 52);
      ctx.fillStyle = "rgba(255, 224, 102, .35)";
      for (let k = 0; k < 10; k++) { ctx.rotate(Math.PI / 5); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(48, -6 + Math.sin(s.t * 2 + k) * 2); ctx.lineTo(48, 6); ctx.fill(); }
      ctx.restore();
      outline(2); blob(340, 52, 22, "#ffd34d");
      // Clouds (slow parallax)
      for (const c of s.clouds) {
        const x = ((c.x - s.scroll * 0.08) % (VW + 120) + VW + 120) % (VW + 120) - 60;
        ctx.save(); ctx.translate(x, c.y); ctx.scale(c.k, c.k);
        ctx.fillStyle = "#fff"; outline(2);
        ctx.beginPath(); ctx.arc(0, 0, 14, Math.PI * 0.5, Math.PI * 1.5); ctx.arc(14, -10, 15, Math.PI, Math.PI * 1.9); ctx.arc(32, -4, 13, Math.PI * 1.3, Math.PI * 0.5); ctx.closePath();
        ctx.fill(); ctx.stroke(); ctx.restore();
      }
    }
    function hills(color, base, amp, period, k) {
      const off = s.scroll * k;
      ctx.beginPath(); ctx.moveTo(0, GROUND);
      for (let x = 0; x <= VW; x += 8) ctx.lineTo(x, base - amp * (0.6 + 0.4 * Math.sin((x + off) / period) * Math.sin((x + off) / (period * 0.37))));
      ctx.lineTo(VW, GROUND); ctx.closePath();
      ctx.fillStyle = color; ctx.fill(); outline(2); ctx.stroke();
    }
    function fence() {
      const off = (s.scroll * 0.6) % 40;
      ctx.fillStyle = "#d9a066"; outline(1.8);
      ctx.fillRect(0, GROUND - 34, VW, 5); ctx.strokeRect(-2, GROUND - 34, VW + 4, 5);
      ctx.fillRect(0, GROUND - 20, VW, 5); ctx.strokeRect(-2, GROUND - 20, VW + 4, 5);
      for (let x = -off; x < VW + 40; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, GROUND); ctx.lineTo(x, GROUND - 40); ctx.lineTo(x + 4, GROUND - 45); ctx.lineTo(x + 8, GROUND - 40); ctx.lineTo(x + 8, GROUND); ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
    }
    function ground() {
      ctx.fillStyle = "#7cc24a"; ctx.fillRect(0, GROUND, VW, 12);
      ctx.fillStyle = "#c98f4d"; ctx.fillRect(0, GROUND + 12, VW, VH - GROUND);
      outline(2.4); ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(VW, GROUND); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, GROUND + 12); ctx.lineTo(VW, GROUND + 12); ctx.lineWidth = 1.6; ctx.stroke();
      // Grass tufts and pebbles scrolling at full speed
      const off = s.scroll % 26;
      ctx.strokeStyle = "#4f8f2c"; ctx.lineWidth = 2;
      for (let x = -off; x < VW; x += 26) { ctx.beginPath(); ctx.moveTo(x, GROUND + 2); ctx.lineTo(x + 3, GROUND - 6); ctx.moveTo(x + 5, GROUND + 2); ctx.lineTo(x + 6, GROUND - 4); ctx.stroke(); }
      const off2 = s.scroll % 57;
      ctx.fillStyle = "#a8743b";
      for (let x = -off2; x < VW; x += 57) { ctx.beginPath(); ctx.ellipse(x + 10, GROUND + 30, 6, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(x + 38, GROUND + 48, 4, 2, 0, 0, Math.PI * 2); ctx.fill(); }
    }

    function tree(o) {
      const x = o.x, w = o.w, h = o.h, base = GROUND;
      outline();
      if (o.kind === "bush") {
        blob(x + w * 0.25, base - h * 0.45, h * 0.5, "#3f9c3a");
        blob(x + w * 0.75, base - h * 0.45, h * 0.5, "#3f9c3a");
        blob(x + w * 0.5, base - h * 0.62, h * 0.55, "#4cb043");
        blob(x + w * 0.42, base - h * 0.75, h * 0.16, "#7ad66a", false);
        for (let k = 0; k < 3; k++) blob(x + w * (0.25 + k * 0.25), base - h * (0.4 + (k % 2) * 0.3), 3, "#e8384f", false);
        return;
      }
      // Trunk with roots and bark lines
      const tw = w * 0.34, tx = x + w / 2 - tw / 2, th = o.kind === "pine" ? h * 0.3 : h * 0.55;
      ctx.fillStyle = "#8a5a2b";
      ctx.beginPath(); ctx.moveTo(tx - 5, base); ctx.quadraticCurveTo(tx + 2, base - 4, tx + 2, base - th); ctx.lineTo(tx + tw - 2, base - th);
      ctx.quadraticCurveTo(tx + tw - 2, base - 4, tx + tw + 5, base); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "#5e3b19"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(tx + tw * 0.4, base - 6); ctx.lineTo(tx + tw * 0.45, base - th * 0.6); ctx.moveTo(tx + tw * 0.7, base - th * 0.3); ctx.lineTo(tx + tw * 0.68, base - th * 0.8); ctx.stroke();
      outline();
      if (o.kind === "pine") {
        const layers = 3;
        for (let k = 0; k < layers; k++) {
          const ly = base - th - k * (h - th) / layers * 0.85, lw = w * (1.15 - k * 0.25), lh = (h - th) / layers * 1.35;
          ctx.fillStyle = k % 2 ? "#2e7d4f" : "#2a6f46";
          ctx.beginPath(); ctx.moveTo(x + w / 2 - lw / 2 - 4, ly); ctx.quadraticCurveTo(x + w / 2, ly + 5, x + w / 2 + lw / 2 + 4, ly); ctx.lineTo(x + w / 2, ly - lh); ctx.closePath();
          ctx.fill(); ctx.stroke();
          ctx.fillStyle = "rgba(255,255,255,.18)";
          ctx.beginPath(); ctx.moveTo(x + w / 2 - lw / 2 + 4, ly - 3); ctx.lineTo(x + w / 2 - 2, ly - lh + 8); ctx.lineTo(x + w / 2 - 2, ly - 3); ctx.closePath(); ctx.fill();
        }
        return;
      }
      // Round tree: layered foliage, shading, highlights, apples
      const cx = x + w / 2, cy = base - h + w * 0.55, r = w * 0.62;
      blob(cx - r * 0.75, cy + r * 0.35, r * 0.7, "#2f8a3e");
      blob(cx + r * 0.75, cy + r * 0.35, r * 0.7, "#2f8a3e");
      blob(cx, cy, r, "#3fa64c");
      blob(cx - r * 0.35, cy - r * 0.35, r * 0.55, "#4dbb59");
      blob(cx - r * 0.45, cy - r * 0.5, r * 0.2, "#8be07f", false);
      blob(cx + r * 0.3, cy - r * 0.1, r * 0.12, "#8be07f", false);
      outline(1.6);
      for (let k = 0; k < o.apples; k++) {
        const a = o.seed * 6 + k * 2.1;
        blob(cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.45 + 4, 4, "#e8384f");
      }
    }

    function grain(g) {
      const bob = Math.sin(s.t * 6 + g.x * 0.05) * 3;
      ctx.save(); ctx.translate(g.x, g.y + bob);
      outline(1.6);
      ctx.fillStyle = "#ffd34d";
      ctx.beginPath(); ctx.ellipse(0, 0, 6, 9, 0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "#c98a1a"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-3, -4); ctx.lineTo(3, -4); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.moveTo(-3, 4); ctx.lineTo(3, 4); ctx.stroke();
      ctx.restore();
    }

    // The chicken, facing right. (x, base) = back of the feet on the ground.
    function chicken() {
      const x = 62, base = GROUND - s.y, run = s.run;
      const hurt = s.t < s.hurtUntil, scream = s.air || hurt;
      if (hurt && Math.floor(s.t * 12) % 2) ctx.globalAlpha = 0.45;
      // Shadow
      ctx.fillStyle = "rgba(0,0,0,.18)";
      ctx.beginPath(); ctx.ellipse(x + 22, GROUND + 3, 18 - Math.min(10, s.y / 10), 4, 0, 0, Math.PI * 2); ctx.fill();
      // Legs
      ctx.strokeStyle = "#f08a1c"; ctx.lineWidth = 3.2; ctx.lineCap = "round";
      const leg = (lx, ph) => {
        const a = s.air ? -0.6 : Math.sin(run + ph) * 0.7, len = s.air ? 9 : 13;
        const fx = lx + Math.sin(a) * len, fy = base - 2 - (s.air ? 6 : 0) + (1 - Math.cos(a)) * 2;
        ctx.beginPath(); ctx.moveTo(lx, base - 14); ctx.lineTo(fx, fy); ctx.lineTo(fx + 6, fy); ctx.moveTo(fx, fy); ctx.lineTo(fx + 4, fy + 2); ctx.stroke();
      };
      leg(x + 16, 0); leg(x + 26, Math.PI);
      // Tail feathers
      outline(2.2); ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.moveTo(x + 6, base - 28); ctx.quadraticCurveTo(x - 10, base - 48, x - 2, base - 52); ctx.quadraticCurveTo(x + 4, base - 44, x + 8, base - 46);
      ctx.quadraticCurveTo(x + 8, base - 38, x + 12, base - 34); ctx.closePath(); ctx.fill(); ctx.stroke();
      // Body
      const bob = s.air ? 0 : Math.abs(Math.sin(run)) * 1.5;
      ctx.beginPath(); ctx.ellipse(x + 22, base - 26 - bob, 21, 16, -0.1, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill(); ctx.stroke();
      // Wing (flaps in the air)
      ctx.save(); ctx.translate(x + 18, base - 28 - bob); ctx.rotate(s.air ? -0.6 + Math.sin(s.t * 40) * 0.6 : 0.15);
      ctx.beginPath(); ctx.ellipse(0, 0, 11, 7, 0, 0, Math.PI * 2); ctx.fillStyle = "#eef0f2"; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-6, 2); ctx.lineTo(4, 3); ctx.moveTo(-4, -2); ctx.lineTo(6, -1); ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
      // Neck + head
      const hx = x + 37, hy = base - 44 - bob + (scream ? -3 : 0);
      outline(2.2);
      ctx.beginPath(); ctx.moveTo(x + 30, base - 34 - bob); ctx.quadraticCurveTo(hx - 6, hy + 8, hx - 4, hy); ctx.lineTo(hx + 8, hy + 2); ctx.quadraticCurveTo(hx + 4, base - 32 - bob, x + 38, base - 28 - bob);
      ctx.fillStyle = "#fff"; ctx.fill();
      blob(hx, hy, 11, "#fff");
      // Comb
      outline(1.8);
      blob(hx - 6, hy - 10, 4.5, "#e8384f"); blob(hx - 1, hy - 13, 5, "#e8384f"); blob(hx + 5, hy - 11, 4.5, "#e8384f");
      // Beak: closed when running, wide open (screaming) in the air or when hit
      outline(1.8);
      if (scream) {
        ctx.fillStyle = "#ffcc33";
        ctx.beginPath(); ctx.moveTo(hx + 8, hy - 3); ctx.lineTo(hx + 22, hy - 9); ctx.lineTo(hx + 10, hy + 1); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(hx + 8, hy + 4); ctx.lineTo(hx + 20, hy + 11); ctx.lineTo(hx + 10, hy + 1); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#8c1c2a";
        ctx.beginPath(); ctx.moveTo(hx + 10, hy + 1); ctx.lineTo(hx + 19, hy - 6); ctx.lineTo(hx + 18, hy + 8); ctx.closePath(); ctx.fill();
      } else {
        ctx.fillStyle = "#ffcc33";
        ctx.beginPath(); ctx.moveTo(hx + 8, hy - 3); ctx.lineTo(hx + 18, hy + 1); ctx.lineTo(hx + 8, hy + 4); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      // Wattle
      blob(hx + 7, hy + 8, 3.5, "#e8384f");
      // Eye: big, startled when screaming
      outline(1.6);
      blob(hx + 2, hy - 3, scream ? 5.5 : 4.2, "#fff");
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(hx + (scream ? 2 : 3), hy - 3, scream ? 1.8 : 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    function particles() {
      for (const p of s.parts) {
        ctx.globalAlpha = Math.min(1, p.life * 2);
        if (p.kind === "feather") {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = "#fff"; outline(1.2);
          ctx.beginPath(); ctx.ellipse(0, 0, 6, 2.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
        } else if (p.kind === "spark") { ctx.fillStyle = "#ffd34d"; ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.fillStyle = "#e7d2a8"; ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
      ctx.font = "bold 18px Oxanium, sans-serif"; ctx.textAlign = "center";
      for (const p of s.pops) {
        ctx.globalAlpha = Math.min(1, p.life * 2);
        ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = "#ffd34d"; ctx.fillText(p.text, p.x, p.y);
      }
      ctx.globalAlpha = 1;
    }

    function draw() {
      if (!s) return;
      const k = canvas.height / VH;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Wider canvases see more of the world on the right; the scale follows the height.
      const shake = s.shake > 0 ? rnd(-4, 4) * s.shake * 3 : 0;
      ctx.setTransform(k, 0, 0, k, shake * k, shake * k * 0.5);
      const visW = canvas.width / k;
      ctx.save(); ctx.scale(Math.max(1, visW / VW), 1); sky(); hills("#9bd77a", 168, 34, 70, 0.15); hills("#74c05a", 196, 26, 48, 0.35); ctx.restore();
      fence(); ground();
      for (const o of s.obstacles) tree(o);
      for (const g of s.grains) grain(g);
      chicken();
      particles();
    }

    return { start, jump, step, draw, state: () => s };
  }

  NT.Chicken = Chicken;
})();
