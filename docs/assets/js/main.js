(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var lang = function () { return root.getAttribute("data-lang") === "en" ? "en" : "zh"; };
  var langListeners = [];

  /* ---------- language ---------- */
  $("#langToggle").addEventListener("click", function () {
    var next = lang() === "zh" ? "en" : "zh";
    root.setAttribute("data-lang", next);
    root.lang = next === "zh" ? "zh-CN" : "en";
    try { localStorage.setItem("cutcut-lang", next); } catch (e) {}
    langListeners.forEach(function (fn) { fn(); });
  });

  /* ---------- nav ---------- */
  var nav = $("#nav");
  function onNav() { nav.classList.toggle("scrolled", window.scrollY > 20); }

  /* ---------- scroll progress helper ---------- */
  function progressOf(el) {
    var r = el.getBoundingClientRect();
    var total = r.height - window.innerHeight;
    if (total <= 0) return 0;
    return clamp(-r.top / total, 0, 1);
  }

  /* ---------- HERO: scroll-scrubbed swing ---------- */
  var hero = $("#top");
  var canvas = $("#heroCanvas");
  var ctx = canvas.getContext("2d");
  var FRAMES = 48, IMPACT = 16; // zero-based frame index of impact
  var SWING_END = 0.62;         // portion of hero scroll used by the swing
  var frames = [], loaded = 0, curFrame = -1, off = null, offCtx = null;
  var mobile = window.matchMedia("(max-width: 760px)").matches;
  var base = mobile ? "assets/frames/m/s" : "assets/frames/s";

  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function loadFrames() {
    for (var i = 0; i < FRAMES; i++) {
      (function (i) {
        var img = new Image();
        img.decoding = "async";
        img.onload = function () {
          loaded++;
          if (i === 0 || loaded === FRAMES) { hero.classList.add("ready"); draw(true); }
        };
        img.src = base + pad(i + 1) + ".jpg";
        frames[i] = img;
      })(i);
    }
  }
  function sizeCanvas() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    draw(true);
  }
  function nearestLoaded(i) {
    for (var d = 0; d < FRAMES; d++) {
      if (frames[i - d] && frames[i - d].complete && frames[i - d].naturalWidth) return frames[i - d];
      if (frames[i + d] && frames[i + d].complete && frames[i + d].naturalWidth) return frames[i + d];
    }
    return null;
  }
  function draw(force) {
    var p = reduceMotion ? 0.3 : progressOf(hero);
    var f = Math.round(clamp(p / SWING_END, 0, 1) * (FRAMES - 1));
    if (f !== curFrame || force) {
      var img = nearestLoaded(f);
      if (img) {
        curFrame = f;
        var cw = canvas.width, ch = canvas.height, iw = img.naturalWidth, ih = img.naturalHeight;
        var wide = cw / ch > 0.9;
        ctx.fillStyle = "#1b1d1a";
        ctx.fillRect(0, 0, cw, ch);
        if (!wide) {
          var s = Math.max(cw / iw, ch / ih), dw = iw * s, dh = ih * s;
          ctx.drawImage(img, (cw - dw) / 2, (ch - dh) * 0.3, dw, dh);
        } else {
          // portrait footage on a landscape screen: blurred backdrop + feathered sharp frame on the right
          var bs = Math.max(cw / iw, ch / ih);
          ctx.save();
          ctx.filter = "blur(" + Math.round(cw / 40) + "px) brightness(.6) saturate(1.1)";
          ctx.drawImage(img, (cw - iw * bs) / 2, (ch - ih * bs) * 0.5, iw * bs, ih * bs);
          ctx.restore();
          var s2 = (ch / ih) * 1.12, w2 = iw * s2, h2 = ih * s2;
          var cx = Math.min(cw * 0.7, cw - w2 * 0.42);
          var x2 = cx - w2 / 2, y2 = ch - h2 + h2 * 0.04;
          if (!off) { off = document.createElement("canvas"); offCtx = off.getContext("2d"); }
          off.width = Math.ceil(w2); off.height = Math.ceil(h2);
          offCtx.globalCompositeOperation = "source-over";
          offCtx.drawImage(img, 0, 0, w2, h2);
          offCtx.globalCompositeOperation = "destination-in";
          var g = offCtx.createLinearGradient(0, 0, w2, 0);
          g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.22, "#000");
          g.addColorStop(0.78, "#000"); g.addColorStop(1, "rgba(0,0,0,0)");
          offCtx.fillStyle = g; offCtx.fillRect(0, 0, w2, h2);
          ctx.drawImage(off, x2, y2);
        }
      }
    }
    var impactP = (IMPACT / (FRAMES - 1)) * SWING_END;
    var t = (p - impactP + 0.02) / 0.07;
    hero.style.setProperty("--slash", clamp(t, 0, 1).toFixed(3));
    hero.style.setProperty("--slash-o", (t <= 0 ? 0 : t < 1 ? 1 : clamp(1 - (t - 1) * 0.8, 0, 1)).toFixed(3));
    $("#heroLine2").classList.toggle("lit", reduceMotion || f >= IMPACT);
    var out = clamp((p - 0.72) / 0.26, 0, 1);
    hero.style.setProperty("--copy-o", (1 - out).toFixed(3));
    hero.style.setProperty("--copy-y", (-out * 60).toFixed(1) + "px");
    hero.style.setProperty("--cue-o", clamp(1 - p * 12, 0, 1).toFixed(3));
  }

  /* ---------- STORY: long recording timeline ---------- */
  var story = $("#problem");
  var bars = $("#tlBars"), clips = $("#tlClips");
  var HITS = [9, 21, 30, 46, 57, 70, 86, 103];
  var N = 116, seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
  (function buildTimeline() {
    var html = "";
    for (var i = 0; i < N; i++) {
      var hit = HITS.indexOf(i) >= 0;
      var h = hit ? 92 + rnd() * 8 : 10 + rnd() * 26 + (rnd() > 0.93 ? 22 : 0);
      html += '<i class="' + (hit ? "hit" : "") + '" style="--h:' + h.toFixed(0) + '%"></i>';
    }
    bars.innerHTML = html;
    var c = "";
    HITS.forEach(function (idx, k) {
      var sec = Math.round((idx / N) * 2712);
      c += '<span style="--i:' + k + '">' + Math.floor(sec / 60) + ":" + pad(sec % 60) + "</span>";
    });
    clips.innerHTML = c;
  })();
  var stage = -1;
  function onStory() {
    var p = progressOf(story);
    var s = reduceMotion ? 2 : p < 0.3 ? 0 : p < 0.62 ? 1 : 2;
    if (s !== stage) { stage = s; story.setAttribute("data-stage", s); }
  }

  /* ---------- scroll loop ---------- */
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      onNav(); draw(false); onStory(); onBall();
    });
  }

  /* ---------- reveal ---------- */
  var revealSel = ".sec-head, .card, .who-grid article, .plan, .not, .priv-list li, .tips li, .faq details, .sim, .honest-notes p, .cta-inner";
  if ("IntersectionObserver" in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    $$(revealSel).forEach(function (el) {
      var sib = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
      el.classList.add("reveal");
      el.style.setProperty("--d", Math.min(sib, 6) * 70 + "ms");
      io.observe(el);
    });
  } else {
    $$(revealSel).forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------- HOW: sticky phone ---------- */
  var shots = $$("#howScreen img");
  var steps = $$(".step");
  if ("IntersectionObserver" in window) {
    var so = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        steps.forEach(function (s) { s.classList.toggle("active", s === e.target); });
        var k = e.target.getAttribute("data-shot");
        shots.forEach(function (img) { img.classList.toggle("on", img.getAttribute("data-k") === k); });
      });
    }, { rootMargin: "-45% 0px -45% 0px" });
    steps.forEach(function (s) { so.observe(s); });
  }
  if (steps[0]) steps[0].classList.add("active");

  /* ---------- BENTO ---------- */
  $$(".card").forEach(function (card) {
    card.addEventListener("pointermove", function (e) {
      var r = card.getBoundingClientRect();
      card.style.setProperty("--mx", e.clientX - r.left + "px");
      card.style.setProperty("--my", e.clientY - r.top + "px");
    });
  });
  (function waveViz() {
    var el = $(".wave-viz");
    if (!el) return;
    var h = "", s2 = 3;
    for (var i = 0; i < 64; i++) {
      s2 = (s2 * 16807) % 2147483647;
      var r = s2 / 2147483647, hit = i === 14 || i === 37 || i === 52;
      h += '<i class="' + (hit ? "hit" : "") + '" style="--i:' + i + ";--h:" + (hit ? 100 : 8 + r * 30).toFixed(0) + '%"></i>';
    }
    el.innerHTML = h;
  })();
  var outCard = $(".c-out");
  if (outCard && !reduceMotion) setInterval(function () {
    var r = outCard.getBoundingClientRect();
    if (r.bottom > 0 && r.top < window.innerHeight) outCard.classList.toggle("flip");
  }, 2400);

  /* ---------- CTA ball parallax ---------- */
  var cta = $("#download");
  function onBall() {
    if (reduceMotion) return;
    var r = cta.getBoundingClientRect();
    if (r.top > window.innerHeight || r.bottom < 0) return;
    var p = (window.innerHeight - r.top) / (window.innerHeight + r.height);
    cta.style.setProperty("--ball-y", ((0.5 - p) * 120).toFixed(1) + "px");
    cta.style.setProperty("--ball-r", ((p - 0.5) * 24).toFixed(1) + "deg");
  }

  /* =========================================================
     SIMULATOR — mirrors the app's review rules:
     · candidates start Pending; trimming keeps them Pending
     · Next / Prev / Replay never change a decision
     · only Kept clips go into the output
     · Finalize → Ready to Save (not saved yet) → Save
     ========================================================= */
  var T = {
    zh: {
      stage3: "步骤 3/6 · 逐段审片", stage4: "步骤 4/6 · 预览与输出", stage6: "步骤 6/6 · 保存到相册",
      pending: "待定", kept: "已保留", discarded: "已舍弃",
      cont: function (n) { return "用已保留片段继续（" + n + "）→"; },
      sec: "秒",
      hTrim: "裁剪只改了起止，这一段仍是「待定」。点「保留」它才会进入成片。",
      hNext: "切换只是查看下一段，不会替你保留。",
      hReplay: "重播只是再看一遍，你的选择不变。",
      hKeep: "已保留，自动跳到下一段待定的候选。",
      hDiscard: "已舍弃（不会删除原视频），自动跳到下一段。",
      hDone: "三段都审完了，点下方按钮继续。",
      hNone: "还没有保留任何片段，先点「保留」至少一段。",
      hCont: function (k, p) { return "只有 " + k + " 段保留的片段会进入成片" + (p ? "，" + p + " 段待定的不会加入。" : "。"); },
      hFinal: "生成完成，但还没进相册。点「保存到相册」才算真正交付。",
      hSave: "网页演示不会保存文件。在 App 里，这一步会写入你的照片图库。",
      hLocked: "这一段已经决定过了，也可以改主意：点另一个按钮即可。",
      descMerge: function (n, s) { return n + " 段合并成一条视频，共 " + s + " 秒。"; },
      descSep: function (n) { return "每段单独生成，共 " + n + " 个视频。"; },
      working: "本地生成中…",
      ready: "准备保存", readySubM: function (n) { return n + " 段已合并为一条视频，尚未保存到相册"; },
      readySubS: function (n) { return n + " 个独立视频，尚未保存到相册"; },
      save: "保存到相册", saved: "✓ 已保存（演示）", savedTitle: "已保存（演示）", savedSub: "演示中没有写入任何文件",
      mediaLoading: "正在加载演示视频…", mediaError: "演示视频未能加载，请检查网络后重试。",
      mediaBlocked: "演示视频已就绪，请点「播放视频」开始。", mediaRetry: "重试加载", mediaPlay: "播放视频"
    },
    en: {
      stage3: "Step 3 of 6 · Review Clips", stage4: "Step 4 of 6 · Preview Edit", stage6: "Step 6 of 6 · Save to Photos",
      pending: "Pending", kept: "Kept", discarded: "Discarded",
      cont: function (n) { return "Continue with Kept Clips (" + n + ") →"; },
      sec: "sec",
      hTrim: "Trimming only moved the edges — this clip is still Pending. Tap Keep to include it.",
      hNext: "Next only moves on. It doesn’t keep anything for you.",
      hReplay: "Replay just plays it again. Your decision stays the same.",
      hKeep: "Kept. Jumping to the next pending candidate.",
      hDiscard: "Discarded (your original is untouched). Moving on.",
      hDone: "All three reviewed. Continue below.",
      hNone: "Nothing kept yet — tap Keep on at least one clip.",
      hCont: function (k, p) { return "Only the " + k + " kept clip" + (k > 1 ? "s" : "") + " will be exported" + (p ? "; " + p + " pending won’t be added." : "."); },
      hFinal: "Finalized — but not in Photos yet. Saving is a separate step.",
      hSave: "The web demo doesn’t save files. In the app, this writes to your Photos library.",
      hLocked: "Already decided — you can still change your mind with the other button.",
      descMerge: function (n, s) { return n + " clip" + (n > 1 ? "s" : "") + " merged into one video, " + s + " s total."; },
      descSep: function (n) { return "Each clip exported on its own: " + n + " video" + (n > 1 ? "s" : "") + "."; },
      working: "Exporting on-device…",
      ready: "Ready to Save", readySubM: function (n) { return n + " clip" + (n === 1 ? "" : "s") + " merged into one video. Not yet saved to Photos."; },
      readySubS: function (n) { return n + " separate video" + (n === 1 ? "" : "s") + ". Not yet saved to Photos."; },
      save: "Save to Photos", saved: "✓ Saved (demo)", savedTitle: "Saved (demo)", savedSub: "Nothing was actually written in this demo",
      mediaLoading: "Loading the demo video…", mediaError: "The demo video could not load. Check your connection and retry.",
      mediaBlocked: "The demo video is ready. Tap Play video to start.", mediaRetry: "Retry loading", mediaPlay: "Play video"
    }
  };
  var t = function (k) { return T[lang()][k]; };

  var video = $("#simVideo");
  var DUR = 24, MIN_LEN = 0.5;
  var IMPACTS = [4.0, 12.0, 20.0];
  var S;
  function reset() {
    S = {
      cur: 0, phase: "review", mode: "merge", saved: false,
      c: IMPACTS.map(function (x) { return { t: x, start: x - 3, end: x + 3, w0: Math.max(0, x - 6), w1: Math.min(DUR, x + 6), s: "pending" }; }),
      playlist: null, pi: 0
    };
  }
  reset();

  var fmt = function (x) {
    x = Math.max(0, x);
    var m = Math.floor(x / 60), s = x - m * 60;
    return pad(m) + ":" + (s < 10 ? "0" : "") + s.toFixed(1);
  };
  var round1 = function (x) { return Math.round(x * 10) / 10; };

  var el = {
    stage: $("#simStageLabel"), steps: $$("#simSteps i"), clock: $("#simClock"),
    review: $("#panelReview"), output: $("#panelOutput"), ready: $("#panelReady"),
    impact: $("#rvImpact"), count: $("#rvCount"), status: $("#rvStatus"),
    trim: $("#trim"), sel: $("#trimSel"), play: $("#trimPlay"), imp: $("#trimImpact"),
    hs: $("#hStart"), he: $("#hEnd"), rs: $("#rvStart"), rd: $("#rvDur"), re: $("#rvEnd"),
    chips: $("#rvChips"), cont: $("#bContinue"), desc: $("#outDesc"), prog: $("#progress"),
    fin: $("#bFinalize"), ring: $("#readyRing"), rt: $("#readyTitle"), rsub: $("#readySub"),
    files: $("#readyFiles"), save: $("#bSave"), toast: $("#toast")
  };

  var decisionTimer = null, generationTimer = null, generationToken = 0;
  function cancelReviewTimers() {
    clearTimeout(decisionTimer);
    decisionTimer = null;
    clearTimeout(el.hs._k);
    clearTimeout(el.he._k);
  }
  function cancelGeneration() {
    clearTimeout(generationTimer);
    generationTimer = null;
    generationToken++;
    el.fin.disabled = false;
    el.prog.hidden = true;
    el.prog.classList.remove("run");
    $$(".seg-b").forEach(function (b) { b.disabled = false; });
  }

  var toastTimer;
  function hint(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove("show"); }, 5200);
  }
  function rule(name) {
    var li = $('#rules li[data-rule="' + name + '"]');
    if (li) li.classList.add("done");
  }
  function kept() { return S.c.filter(function (c) { return c.s === "kept"; }); }
  function pendingCount() { return S.c.filter(function (c) { return c.s === "pending"; }).length; }

  function render() {
    var c = S.c[S.cur];
    var stepOn = S.phase === "review" ? 3 : S.phase === "output" ? 4 : 6;
    el.steps.forEach(function (s, i) { s.classList.toggle("on", i < stepOn); });
    el.stage.textContent = t(S.phase === "review" ? "stage3" : S.phase === "output" ? "stage4" : "stage6");
    el.review.hidden = S.phase !== "review";
    el.output.hidden = S.phase !== "output";
    el.ready.hidden = S.phase !== "ready";

    if (S.phase === "review") {
      $("#bPrev").disabled = S.cur === 0;
      $("#bNext").disabled = S.cur === S.c.length - 1;
      el.impact.textContent = fmt(c.t);
      el.count.textContent = S.cur + 1 + " / " + S.c.length;
      el.status.setAttribute("data-s", c.s);
      el.status.textContent = t(c.s);
      layoutTrim();
      el.chips.innerHTML = S.c.map(function (x, i) {
        return '<button type="button" class="chip' + (i === S.cur ? " cur" : "") + '" data-i="' + i + '" data-s="' + x.s + '">' + fmt(x.t).slice(1) + "</button>";
      }).join("");
      var n = kept().length;
      el.cont.textContent = t("cont")(n);
      el.cont.classList.toggle("ok", n > 0);
      el.cont.setAttribute("aria-disabled", n > 0 ? "false" : "true");
    }
    if (S.phase === "output") {
      var k = kept();
      var total = k.reduce(function (a, x) { return a + (x.end - x.start); }, 0);
      $$(".seg-b").forEach(function (b) { b.setAttribute("aria-checked", b.getAttribute("data-mode") === S.mode ? "true" : "false"); });
      el.desc.textContent = generationTimer !== null ? t("working") : (S.mode === "merge" ? t("descMerge")(k.length, round1(total).toFixed(1)) : t("descSep")(k.length));
    }
    if (S.phase === "ready") {
      var kk = kept();
      el.rt.textContent = t(S.saved ? "savedTitle" : "ready");
      el.rsub.textContent = S.saved ? t("savedSub") : (S.mode === "merge" ? t("readySubM") : t("readySubS"))(kk.length);
      el.ring.classList.toggle("full", S.saved);
      el.save.textContent = S.saved ? t("saved") : t("save");
      el.save.disabled = S.saved;
      if (S.mode === "merge") {
        var tt = kk.reduce(function (a, x) { return a + (x.end - x.start); }, 0);
        el.files.innerHTML = "<span>CutCut-merged.mp4 · " + round1(tt).toFixed(1) + "s</span>";
      } else {
        el.files.innerHTML = kk.map(function (x, i) { return "<span>Clip-0" + (i + 1) + ".mp4 · " + round1(x.end - x.start).toFixed(1) + "s</span>"; }).join("");
      }
    }
  }

  function pct(c, x) { return ((x - c.w0) / (c.w1 - c.w0)) * 100; }
  function layoutTrim() {
    var c = S.c[S.cur];
    el.sel.style.left = pct(c, c.start) + "%";
    el.sel.style.width = pct(c, c.end) - pct(c, c.start) + "%";
    el.hs.style.left = pct(c, c.start) + "%";
    el.he.style.left = pct(c, c.end) + "%";
    el.imp.style.left = pct(c, c.t) + "%";
    el.rs.textContent = fmt(c.start);
    el.re.textContent = fmt(c.end);
    el.rd.textContent = (c.end - c.start).toFixed(1) + " " + t("sec");
    [[el.hs, c.start, c.w0, c.end - MIN_LEN], [el.he, c.end, c.start + MIN_LEN, c.w1]].forEach(function (a) {
      a[0].setAttribute("aria-valuenow", a[1].toFixed(1));
      a[0].setAttribute("aria-valuemin", a[2].toFixed(1));
      a[0].setAttribute("aria-valuemax", a[3].toFixed(1));
      a[0].setAttribute("aria-valuetext", fmt(a[1]));
    });
  }

  /* playback */
  var loopRange = null; // {start, end}
  // Load the small sample once as a Blob: static hosts may ignore HTTP Range.
  // Keep only the latest playback intent while fetch/metadata are pending.
  var mediaPromise = null, mediaReady = false, mediaURL = null, mediaStatus = "";
  var mediaIntent = null, mediaEpoch = 0, playAttempt = 0, mediaController = null;
  var mediaDisposed = false, simVisible = !("IntersectionObserver" in window);
  function renderMediaNotice() {
    $("#simMediaNotice").hidden = !mediaStatus;
    $("#simMediaMessage").textContent = mediaStatus ? t(mediaStatus) : "";
    var retry = $("#simMediaRetry");
    retry.hidden = !mediaStatus || mediaStatus === "mediaLoading";
    retry.textContent = t(mediaStatus === "mediaBlocked" ? "mediaPlay" : "mediaRetry");
  }
  function mediaNotice(status) { mediaStatus = status; renderMediaNotice(); }
  function releaseMedia() {
    mediaReady = false;
    playAttempt++;
    video.pause();
    video.removeAttribute("src");
    video.load();
    if (mediaURL) { URL.revokeObjectURL(mediaURL); mediaURL = null; }
  }
  function requestMediaPlay() {
    if (!mediaReady || !mediaIntent || !mediaIntent.play || !simVisible || dragging) return;
    var intent = mediaIntent, attempt = ++playAttempt;
    function failed(error) {
      if (attempt !== playAttempt || intent !== mediaIntent || !simVisible || mediaDisposed) return;
      if (error && error.name === "AbortError") return;
      if (error && error.name === "NotAllowedError") mediaNotice("mediaBlocked");
      else { releaseMedia(); mediaNotice("mediaError"); }
    }
    try {
      var pr = video.play();
      if (pr && pr.then) pr.then(function () {
        if (attempt === playAttempt && intent === mediaIntent) mediaNotice("");
      }, failed);
      else mediaNotice("");
    } catch (error) { failed(error); }
  }
  function applyMediaIntent() {
    if (!mediaReady || !mediaIntent || mediaDisposed) return;
    try { video.currentTime = mediaIntent.time; }
    catch (error) { releaseMedia(); mediaNotice("mediaError"); return; }
    if (mediaIntent.play && simVisible && !dragging) requestMediaPlay();
    else video.pause();
  }
  function ensureMedia(retry) {
    if (mediaReady || mediaPromise || mediaDisposed || (mediaStatus === "mediaError" && !retry)) return;
    var epoch = ++mediaEpoch, controller = new AbortController();
    mediaController = controller;
    mediaNotice("mediaLoading");
    var fetchTimer = setTimeout(function () { controller.abort(); }, 30000);
    mediaPromise = fetch(video.getAttribute("data-src"), { signal: controller.signal }).then(function (response) {
      if (!response.ok) throw new Error("Demo video HTTP " + response.status);
      return response.blob();
    }).then(function (blob) {
      clearTimeout(fetchTimer);
      if (epoch !== mediaEpoch || mediaDisposed) return;
      if (!blob.size) throw new Error("Empty demo video");
      mediaURL = URL.createObjectURL(blob);
      return new Promise(function (resolve, reject) {
        var metadataTimer;
        function cleanup() {
          clearTimeout(metadataTimer);
          video.removeEventListener("loadedmetadata", ready);
          video.removeEventListener("error", failed);
        }
        function ready() { cleanup(); resolve(); }
        function failed() { cleanup(); reject(new Error("Demo video metadata unavailable")); }
        video.addEventListener("loadedmetadata", ready);
        video.addEventListener("error", failed);
        metadataTimer = setTimeout(failed, 15000);
        video.src = mediaURL;
        video.load();
        if (video.readyState >= 1) ready();
      });
    }).then(function () {
      if (epoch !== mediaEpoch || mediaDisposed) return;
      mediaPromise = null; mediaController = null; mediaReady = true;
      mediaNotice("");
      applyMediaIntent();
    }).catch(function () {
      clearTimeout(fetchTimer);
      if (epoch !== mediaEpoch || mediaDisposed) return;
      mediaPromise = null; mediaController = null;
      releaseMedia(); mediaNotice("mediaError");
    });
  }
  function seekMedia(time, play) {
    mediaIntent = { time: time, play: play };
    playAttempt++;
    video.pause();
    if (mediaReady) applyMediaIntent();
    else ensureMedia();
  }
  function pauseMedia() {
    if (mediaIntent) mediaIntent.play = false;
    playAttempt++; video.pause();
  }
  $("#simMediaRetry").addEventListener("click", function () {
    if (!mediaIntent) { playCurrent(); return; }
    mediaIntent.play = true;
    // Run play synchronously here to preserve Safari's user activation.
    if (mediaReady) requestMediaPlay();
    else ensureMedia(true);
  });
  video.addEventListener("error", function () {
    if (mediaReady) { releaseMedia(); mediaNotice("mediaError"); }
  });
  window.addEventListener("pagehide", function (event) {
    if (event.persisted) return;
    mediaDisposed = true; mediaEpoch++;
    if (mediaController) mediaController.abort();
    releaseMedia();
  });
  langListeners.push(renderMediaNotice);
  function playRange(a, b) {
    loopRange = { start: a, end: b };
    seekMedia(a, true);
  }
  function playCurrent() { var c = S.c[S.cur]; S.playlist = null; playRange(c.start, c.end); }
  function tick() {
    var ct = video.currentTime || 0;
    el.clock.textContent = fmt(ct);
    if (S.phase === "review" && !dragging) {
      var c = S.c[S.cur];
      el.play.style.left = clamp(pct(c, ct), 0, 100) + "%";
      el.play.style.opacity = ct >= c.start && ct <= c.end ? 0.6 : 0;
    }
    if (loopRange && !video.paused && ct >= loopRange.end - 0.03) {
      if (S.playlist) {
        S.pi++;
        if (S.pi < S.playlist.length) {
          loopRange = { start: S.playlist[S.pi].start, end: S.playlist[S.pi].end };
          seekMedia(loopRange.start, true);
        } else { S.playlist = null; loopRange = null; pauseMedia(); }
      } else {
        seekMedia(loopRange.start, true);
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  /* trim dragging, incl. "hold at an edge to keep extending" */
  var dragging = null, edgeTimer = null, lastX = 0;
  function valueAt(c, clientX) {
    var r = el.trim.getBoundingClientRect();
    return c.w0 + ((clientX - r.left) / r.width) * (c.w1 - c.w0);
  }
  function applyDrag(clientX) {
    var c = S.c[S.cur];
    var v = round1(valueAt(c, clientX));
    if (dragging === "start") c.start = clamp(v, c.w0, round1(c.end - MIN_LEN));
    else c.end = clamp(v, round1(c.start + MIN_LEN), c.w1);
    layoutTrim();
    seekMedia(dragging === "start" ? c.start : Math.max(c.start, c.end - 0.05), false);
  }
  function edgeExtend() {
    if (!dragging) return;
    var c = S.c[S.cur], r = el.trim.getBoundingClientRect();
    var grew = false;
    if (dragging === "start" && lastX < r.left + 4 && c.w0 > 0) { c.w0 = round1(Math.max(0, c.w0 - 0.2)); grew = true; }
    if (dragging === "end" && lastX > r.right - 4 && c.w1 < DUR) { c.w1 = round1(Math.min(DUR, c.w1 + 0.2)); grew = true; }
    if (grew) applyDrag(lastX);
    edgeTimer = setTimeout(edgeExtend, 40);
  }
  function startDrag(which, e) {
    if (S.phase !== "review") return;
    e.preventDefault();
    cancelReviewTimers();
    dragging = which;
    lastX = e.clientX;
    pauseMedia();
    (which === "start" ? el.hs : el.he).classList.add("drag");
    try { e.target.setPointerCapture(e.pointerId); } catch (er) {}
    clearTimeout(edgeTimer);
    edgeTimer = setTimeout(edgeExtend, 380);
  }
  function moveDrag(e) { if (!dragging) return; lastX = e.clientX; applyDrag(e.clientX); }
  function endDrag() {
    if (!dragging) return;
    el.hs.classList.remove("drag"); el.he.classList.remove("drag");
    dragging = null;
    clearTimeout(edgeTimer);
    afterTrim();
  }
  function afterTrim() {
    if (S.phase !== "review") return;
    var c = S.c[S.cur];
    if (c.s === "pending") { hint(t("hTrim")); rule("trim"); bumpStatus(); }
    playCurrent();
  }
  function bumpStatus() { el.status.classList.remove("bump"); void el.status.offsetWidth; el.status.classList.add("bump"); }
  [["start", el.hs], ["end", el.he]].forEach(function (p) {
    p[1].addEventListener("pointerdown", function (e) { startDrag(p[0], e); });
    p[1].addEventListener("pointermove", moveDrag);
    p[1].addEventListener("pointerup", endDrag);
    p[1].addEventListener("pointercancel", endDrag);
    p[1].addEventListener("keydown", function (e) {
      if (S.phase !== "review") return;
      var c = S.c[S.cur], step = e.shiftKey ? 1 : 0.1, d = 0;
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") d = -step;
      else if (e.key === "ArrowRight" || e.key === "ArrowUp") d = step;
      else return;
      e.preventDefault();
      cancelReviewTimers();
      if (p[0] === "start") { c.w0 = Math.min(c.w0, Math.max(0, c.start + d)); c.start = clamp(round1(c.start + d), Math.max(0, c.w0), round1(c.end - MIN_LEN)); }
      else { c.w1 = Math.max(c.w1, Math.min(DUR, c.end + d)); c.end = clamp(round1(c.end + d), round1(c.start + MIN_LEN), Math.min(DUR, c.w1)); }
      layoutTrim();
      seekMedia(p[0] === "start" ? c.start : Math.max(c.start, c.end - 0.05), false);
      clearTimeout(p[1]._k);
      p[1]._k = setTimeout(afterTrim, 450);
    });
  });

  function goto(i) {
    cancelReviewTimers();
    if (S.phase !== "review" || i < 0 || i >= S.c.length) return;
    S.cur = i; render(); playCurrent();
  }
  function nextPending(from) {
    for (var d = 1; d <= S.c.length; d++) {
      var j = (from + d) % S.c.length;
      if (S.c[j].s === "pending") return j;
    }
    return -1;
  }
  function decide(s) {
    if (S.phase !== "review") return;
    cancelReviewTimers();
    var state = S, from = S.cur;
    var c = S.c[S.cur];
    c.s = s;
    var nxt = nextPending(S.cur);
    hint(nxt >= 0 ? t(s === "kept" ? "hKeep" : "hDiscard") : t("hDone"));
    render(); bumpStatus();
    if (nxt >= 0) {
      decisionTimer = setTimeout(function () {
        decisionTimer = null;
        if (S === state && S.phase === "review" && S.cur === from && S.c[nxt].s === "pending") goto(nxt);
      }, 450);
    }
  }

  $("#bKeep").addEventListener("click", function () { decide("kept"); });
  $("#bDiscard").addEventListener("click", function () { decide("discarded"); });
  $("#bReplay").addEventListener("click", function () {
    if (S.phase !== "review") return;
    cancelReviewTimers(); hint(t("hReplay")); playCurrent();
  });
  function nav2(d) {
    if (S.phase !== "review") return;
    cancelReviewTimers();
    var target = S.cur + d;
    if (target < 0 || target >= S.c.length) return;
    if (S.c[S.cur].s === "pending") { hint(t("hNext")); rule("next"); }
    goto(target);
  }
  $("#bNext").addEventListener("click", function () { nav2(1); });
  $("#bPrev").addEventListener("click", function () { nav2(-1); });
  el.chips.addEventListener("click", function (e) {
    if (S.phase !== "review") return;
    var b = e.target.closest(".chip");
    if (!b) return;
    var i = +b.getAttribute("data-i");
    if (i !== S.cur && S.c[S.cur].s === "pending") { hint(t("hNext")); rule("next"); }
    goto(i);
  });
  el.cont.addEventListener("click", function () {
    if (S.phase !== "review") return;
    cancelReviewTimers();
    var k = kept().length;
    if (!k) { hint(t("hNone")); return; }
    hint(t("hCont")(k, pendingCount()));
    rule("kept");
    S.phase = "output";
    render();
    playResult();
  });
  $$(".seg-b").forEach(function (b) {
    b.addEventListener("click", function () {
      if (S.phase !== "output" || generationTimer !== null) return;
      S.mode = b.getAttribute("data-mode"); render();
    });
  });
  $("#bEdit").addEventListener("click", function () {
    if (S.phase !== "output") return;
    cancelGeneration(); cancelReviewTimers();
    S.phase = "review"; render(); playCurrent();
  });
  el.fin.addEventListener("click", function () {
    if (S.phase !== "output" || generationTimer !== null) return;
    if (!kept().length) { S.phase = "review"; render(); hint(t("hNone")); return; }
    cancelReviewTimers();
    var state = S, token = ++generationToken;
    el.fin.disabled = true;
    $$(".seg-b").forEach(function (b) { b.disabled = true; });
    el.prog.hidden = false;
    el.prog.classList.remove("run");
    void el.prog.offsetWidth;
    el.prog.classList.add("run");
    el.desc.textContent = t("working");
    generationTimer = setTimeout(function () {
      if (token !== generationToken || S !== state || S.phase !== "output") return;
      cancelGeneration();
      if (!kept().length) { S.phase = "review"; render(); hint(t("hNone")); return; }
      S.phase = "ready"; S.saved = false;
      render();
      hint(t("hFinal"));
    }, reduceMotion ? 200 : 1500);
  });
  el.save.addEventListener("click", function () {
    if (S.phase !== "ready" || S.saved || !kept().length) return;
    S.saved = true;
    rule("save");
    render();
    hint(t("hSave"));
  });
  function playResult() {
    var k = kept();
    if (!k.length) return;
    S.playlist = k.map(function (x) { return { start: x.start, end: x.end }; });
    S.pi = 0;
    loopRange = { start: S.playlist[0].start, end: S.playlist[0].end };
    seekMedia(loopRange.start, true);
  }
  $("#bPlayResult").addEventListener("click", playResult);
  $("#bRestart").addEventListener("click", function () {
    cancelGeneration(); cancelReviewTimers();
    reset(); render(); playCurrent();
    $$("#rules li").forEach(function (li) { li.classList.remove("done"); });
  });
  $("#simSound").addEventListener("click", function () {
    video.muted = !video.muted;
    this.setAttribute("aria-pressed", video.muted ? "false" : "true");
    if (!mediaIntent || !loopRange) playCurrent();
    else {
      mediaIntent.play = true;
      if (mediaReady) requestMediaPlay();
      else ensureMedia();
    }
  });

  // start playing only while the simulator is on screen
  var simStarted = false;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        simVisible = e.isIntersecting;
        if (e.isIntersecting) {
          if (!simStarted) { simStarted = true; playCurrent(); }
          else if (mediaIntent && mediaIntent.play) {
            if (mediaReady) requestMediaPlay();
            else ensureMedia();
          }
        } else { playAttempt++; video.pause(); }
      });
    }, { threshold: 0.01 }).observe($(".sim-device"));
  }

  render();
  langListeners.push(render);

  /* ---------- init ---------- */
  loadFrames();
  sizeCanvas();
  onNav(); onStory();
  window.addEventListener("scroll", onScroll, { passive: true });
  var rz;
  window.addEventListener("resize", function () {
    clearTimeout(rz);
    rz = setTimeout(function () { sizeCanvas(); onScroll(); }, 120);
  });
})();
