/* gallery1script.js — unified, fixed, and robust version
   - Single-file viewer with Panzoom fallback
   - Proper lifecycle for panzoom instance
   - Keyboard, pointer, touch, wheel, fullscreen handling
   - Accessible focus handling for overview panel
*/
(function () {
  "use strict";

  // Helper: DOM ready
  function onReady(fn) {
    if (document.readyState === "interactive" || document.readyState === "complete") return setTimeout(fn, 0);
    document.addEventListener("DOMContentLoaded", fn);
  }

  // Contact form validation: Name letters+spaces only, Phone digits only (<=10)
  (function contactValidation() {
    const form = document.getElementById("contactForm");
    if (!form) return;

    const nameInput = document.getElementById("name");
    const contactInput = document.getElementById("contact");
    const nameError = document.getElementById("nameError");
    const contactError = document.getElementById("contactError");

    // Unicode-aware letters + spaces (no digits or punctuation). Use 'u' flag to support international letters.
    const nameRegex = /^[\p{L}\s]+$/u;
    const phoneRegex = /^\d{1,10}$/; // 1 to 10 digits

    function setInvalid(inputEl, errEl, message) {
      inputEl.classList.add("is-invalid");
      inputEl.classList.remove("is-valid");
      if (errEl) errEl.textContent = message;
    }
    function setValid(inputEl, errEl) {
      inputEl.classList.remove("is-invalid");
      inputEl.classList.add("is-valid");
      if (errEl) errEl.textContent = "";
    }

    function validateName() {
      const v = (nameInput.value || "").trim();
      if (v.length === 0) {
        setInvalid(nameInput, nameError, "Name is required.");
        return false;
      }
      if (!nameRegex.test(v)) {
        setInvalid(nameInput, nameError, "Name may contain letters and spaces only. No numbers or symbols.");
        return false;
      }
      setValid(nameInput, nameError);
      return true;
    }

    function validateContact() {
      const v = (contactInput.value || "").trim();
      if (v.length === 0) {
        setInvalid(contactInput, contactError, "Contact number is required.");
        return false;
      }
      if (phoneRegex.test(v)) {
        setInvalid(contactInput, contactError, "Phone number must contain digits only (0–9).");
        return false;
      }
      if (v.length > 10) {
        setInvalid(contactInput, contactError, "Phone number must be at most 10 digits.");
        return false;
      }

      document.getElementById("contact").addEventListener("input", function () {
        this.value = this.value.replace(/\D/g, "").slice(0, 10);
      });


      if (!phoneRegex.test(v)) {
        setInvalid(contactInput, contactError, "Phone number must be 1–10 digits.");
        return false;
      }
      setValid(contactInput, contactError);
      return true;
    }

    // Live validation while typing (helps users)
    nameInput && nameInput.addEventListener("input", validateName);
    contactInput && contactInput.addEventListener("input", function (ev) {
      // strip any non-digit characters as the user types (optional — keeps input clean)
      const cleaned = (this.value || "").replace(/\D+/g, "");
      if (cleaned !== this.value) {
        const pos = this.selectionStart - 1;
        this.value = cleaned;
        try { this.setSelectionRange(pos, pos); } catch (_) { }
      }
      // enforce maxlength at runtime (defensive)
      if (this.value.length > 10) this.value = this.value.slice(0, 10);
      validateContact();
    });

    // On submit: run validations; if valid, proceed (you can replace alert() with real submission)
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      const okName = validateName();
      const okContact = validateContact();
      if (!okName || !okContact) {
        // focus first invalid field
        const firstInvalid = form.querySelector(".is-invalid");
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      // Success path (adjust as you need: Ajax, show a toast, or call backend)
      // Replace the line below with actual submission if required.
      // For now we show a friendly in-page confirmation using Bootstrap alert markup:
      const existingAlert = document.getElementById("contactSuccessAlert");
      if (existingAlert) existingAlert.remove();

      const alertBox = document.createElement("div");
      alertBox.id = "contactSuccessAlert";
      alertBox.className = "alert alert-success mt-3";
      alertBox.setAttribute("role", "status");
      alertBox.textContent = "Your response has been submitted.";
      form.parentElement.insertBefore(alertBox, form.nextSibling);

      // Reset form and validation state
      form.reset();
      nameInput.classList.remove("is-valid", "is-invalid");
      contactInput.classList.remove("is-valid", "is-invalid");
      if (nameError) nameError.textContent = "";
      if (contactError) contactError.textContent = "";

      // optional: remove the alert after 4s
      setTimeout(() => { alertBox.remove(); }, 4000);
    }, { passive: false });

  })();


  onReady(function () {
    // ---------- DOM references ----------
    const ovwToggle = document.getElementById("ovwToggle");
    const ovwPanel = document.getElementById("ovw-panel");
    const ovwBackdrop = document.getElementById("ovwBackdrop");
    const openHelpBtn = document.getElementById("openHelpBtn");
    const openHelpFromOverview = document.getElementById("openHelpFromOverview");
    const helpFloat = document.getElementById("helpFloat");
    const helpModalEl = document.getElementById("helpModal");
    const themeToggle = document.getElementById("pageThemeToggle");
    const themeIcon = document.getElementById("themeIcon");

    const modalEl = document.getElementById("imageModal");
    const modalDialog = modalEl ? modalEl.querySelector(".modal-dialog") : null;
    const modalImage = modalEl ? modalEl.querySelector("#modalImage") : null;
    const modalImageTitle = modalEl ? modalEl.querySelector("#modal-image-title") : null; // optional
    const viewerTitle = document.getElementById("viewerTitle");
    const zoomInBtn = document.getElementById("zoomIn");
    const zoomOutBtn = document.getElementById("zoomOut");
    const resetZoomBtn = document.getElementById("resetZoom");
    const maximizeBtn = document.getElementById("maximizeBtn");
    const minimizeBtn = document.getElementById("minimizeBtn");
    const closeBtn = document.getElementById("closeBtn");
    const btnPrev = modalEl ? modalEl.querySelector(".img-prev-btn") : null;
    const btnNext = modalEl ? modalEl.querySelector(".img-next-btn") : null;

    // Bootstrap Modal instances (safe-get)
    const openHelpModalBootstrap = helpModalEl && window.bootstrap ? bootstrap.Modal.getOrCreateInstance(helpModalEl) : null;
    const bsModal = modalEl && window.bootstrap ? bootstrap.Modal.getOrCreateInstance(modalEl) : null;

    // ---------- Panzoom + fallback ----------
    let panzoomInstance = null;
    const PAN_MIN = 1;
    const PAN_MAX = 5;
    const PAN_STEP = 0.2;

    // Manual fallback transform state
    const manual = { scale: 1, tx: 0, ty: 0 };

    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

    function getPanzoomConstructor() {
      if (typeof Panzoom !== "undefined") return Panzoom;
      if (typeof panzoom !== "undefined") return panzoom;
      if (window && window.Panzoom) return window.Panzoom;
      return null;
    }

    function destroyPanzoomInstance() {
      if (panzoomInstance && typeof panzoomInstance.destroy === "function") {
        try { panzoomInstance.destroy(); } catch (_) { }
      }
      panzoomInstance = null;
    }

    function applyManualTransform() {
      modalImage.style.transform = `translate(${manual.tx}px, ${manual.ty}px) scale(${manual.scale})`;
    }
    function resetManual() {
      manual.scale = 1; manual.tx = 0; manual.ty = 0;
      modalImage.style.transition = "transform .12s ease";
      applyManualTransform();
      setTimeout(() => { modalImage.style.transition = ""; }, 140);
    }

    function createOrEnsurePanzoom() {
      if (!modalImage) return;
      const P = getPanzoomConstructor();
      if (P && !panzoomInstance) {
        try {
          // Some Panzoom builds are factories, others are constructors. Call as function.
          panzoomInstance = P(modalImage, {
            maxScale: PAN_MAX,
            minScale: PAN_MIN,
            step: PAN_STEP,
            contain: "outside",
            cursor: "grab"
          });
          // Make sure element is not handled by touch defaults
          modalImage.style.touchAction = "none";
        } catch (err) {
          console.warn("Panzoom init failed, falling back to manual", err);
          destroyPanzoomInstance();
        }
      }
      // always reflect manual transform if panzoom not present
      if (!panzoomInstance) applyManualTransform();
    }

    function resetZoomState() {
      if (panzoomInstance && typeof panzoomInstance.reset === "function") {
        try { panzoomInstance.reset({ animate: true }); } catch (_) { resetManual(); }
      } else resetManual();
    }

    // get current scale reading from transform matrix
    function getCurrentScaleFromElement(el) {
      const style = window.getComputedStyle(el);
      const matrix = style.transform || style.webkitTransform || style.mozTransform;
      if (!matrix || matrix === "none") return 1;
      const m = matrix.match(/matrix.*\((.+)\)/);
      if (!m) return 1;
      const values = m[1].split(",").map(s => s.trim());
      const a = parseFloat(values[0]), b = parseFloat(values[1]);
      return Math.sqrt(a * a + b * b) || 1;
    }

    function centerFocal() {
      const r = modalEl.querySelector(".viewer-stage").getBoundingClientRect();
      return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    }

    function zoomByFactor(factor, focal) {
      createOrEnsurePanzoom();
      if (panzoomInstance && typeof panzoomInstance.getScale === "function") {
        const cur = panzoomInstance.getScale ? panzoomInstance.getScale() : 1;
        const newScale = clamp(cur * factor, PAN_MIN, PAN_MAX);
        try { panzoomInstance.zoomTo(newScale, { animate: true, focal: focal || centerFocal() }); }
        catch (_) { manual.scale = clamp(manual.scale * factor, PAN_MIN, PAN_MAX); applyManualTransform(); }
      } else {
        manual.scale = clamp(manual.scale * factor, PAN_MIN, PAN_MAX);
        applyManualTransform();
      }
    }
    function zoomIn() { zoomByFactor(1.1); }
    function zoomOut() { zoomByFactor(1 / 1.1); }
    function resetZoom() { resetZoomState(); }

    // ---------- Pointer/wheel/drag handlers ----------
    let dragging = false;
    let ptrStartX = 0, ptrStartY = 0, startTx = 0, startTy = 0;

    function pointerDown(e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      dragging = true;
      ptrStartX = e.clientX; ptrStartY = e.clientY;
      startTx = manual.tx; startTy = manual.ty;
      modalImage.classList.add("dragging");
      try { modalImage.setPointerCapture && modalImage.setPointerCapture(e.pointerId); } catch (_) { }
    }
    function pointerMove(e) {
      if (!dragging) return;
      // only allow panning when zoom > 1.01
      const currentScale = getCurrentScaleFromElement(modalImage);
      if (currentScale <= 1.01) return;
      createOrEnsurePanzoom();
      if (panzoomInstance && typeof panzoomInstance.pan === "function") {
        try {
          const dx = e.clientX - ptrStartX;
          const dy = e.clientY - ptrStartY;
          // Use panzoom's pan API if available
          const curPan = panzoomInstance.getPan ? panzoomInstance.getPan() : { x: 0, y: 0 };
          panzoomInstance.pan(curPan.x + dx, curPan.y + dy);
          ptrStartX = e.clientX; ptrStartY = e.clientY;
        } catch (err) {
          manual.tx = startTx + (e.clientX - ptrStartX);
          manual.ty = startTy + (e.clientY - ptrStartY);
          applyManualTransform();
        }
      } else {
        manual.tx = startTx + (e.clientX - ptrStartX);
        manual.ty = startTy + (e.clientY - ptrStartY);
        applyManualTransform();
      }
    }
    function pointerUp(e) {
      dragging = false;
      modalImage.classList.remove("dragging");
      try { modalImage.releasePointerCapture && modalImage.releasePointerCapture(e.pointerId); } catch (_) { }
    }

    function wheelHandler(e) {
      if (!modalEl.classList.contains("show")) return;
      e.preventDefault();
      createOrEnsurePanzoom();
      const factor = e.deltaY < 0 ? 1.12 : 0.88;
      if (panzoomInstance && typeof panzoomInstance.zoomTo === "function") {
        const cur = panzoomInstance.getScale ? panzoomInstance.getScale() : 1;
        const newScale = clamp(cur * factor, PAN_MIN, PAN_MAX);
        try { panzoomInstance.zoomTo(newScale, { animate: true, focal: { clientX: e.clientX, clientY: e.clientY } }); }
        catch (_) { manual.scale = clamp(manual.scale * factor, PAN_MIN, PAN_MAX); applyManualTransform(); }
      } else {
        manual.scale = clamp(manual.scale * factor, PAN_MIN, PAN_MAX);
        applyManualTransform();
      }
    }

    function dblClickHandler(e) {
      createOrEnsurePanzoom();
      if (panzoomInstance && typeof panzoomInstance.getScale === "function") {
        const cur = panzoomInstance.getScale();
        if (Math.abs(cur - 1) < 0.05) panzoomInstance.zoomTo(2, { animate: true, focal: { clientX: e.clientX, clientY: e.clientY } });
        else panzoomInstance.reset({ animate: true });
      } else {
        if (Math.abs(manual.scale - 1) < 0.05) manual.scale = 2;
        else { manual.scale = 1; manual.tx = 0; manual.ty = 0; }
        applyManualTransform();
      }
    }

    // ---------- Image navigation ----------
    function preloadNeighbors(src) {
      const thumbs = Array.from(document.querySelectorAll(".gallery img"));
      if (!thumbs.length || !src) return;
      let idx = thumbs.findIndex(t => { const s = t.getAttribute("data-bs-image") || t.src; try { return new URL(s, location.href).href === new URL(src, location.href).href; } catch { return s === src; } });
      if (idx === -1) return;
      [thumbs[(idx + 1) % thumbs.length], thumbs[(idx - 1 + thumbs.length) % thumbs.length]].forEach(el => { if (el) new Image().src = el.getAttribute("data-bs-image") || el.src; });
    }

    function switchImage(src, title) {
      if (!modalImage) return;
      modalImage.classList.remove("fade-in"); modalImage.classList.add("fade-out");
      setTimeout(() => {
        modalImage.src = src || "";
        modalImage.alt = title || "";
        if (viewerTitle) viewerTitle.textContent = title || "";
        if (modalImageTitle) modalImageTitle.textContent = title || "";
        if (modalImage.complete && modalImage.naturalWidth) createAfterImageLoad();
        else modalImage.onload = createAfterImageLoad;
        modalImage.classList.remove("fade-out"); modalImage.classList.add("fade-in");
        preloadNeighbors(src);
      }, 120);
    }

    function createAfterImageLoad() {
      // ensure a clean panzoom state
      destroyPanzoomInstance();
      createOrEnsurePanzoom();
      resetZoomState();
    }

    function navigateRelative(offset) {
      const thumbs = Array.from(document.querySelectorAll(".gallery img"));
      if (!thumbs.length) return;
      let idx = thumbs.findIndex(t => {
        const s = t.getAttribute("data-bs-image") || t.src;
        try { return new URL(s, location.href).href === new URL(modalImage.src, location.href).href; } catch { return s === modalImage.src; }
      });
      if (idx === -1) return;
      idx = (idx + offset + thumbs.length) % thumbs.length;
      const next = thumbs[idx];
      if (next) switchImage(next.getAttribute("data-bs-image") || next.src, next.getAttribute("data-bs-title") || next.alt || "");
    }

    // ---------- Fullscreen ----------
    async function toggleFullscreen() {
      try {
        if (!document.fullscreenElement) {
          const target = modalDialog || modalEl;
          if (target.requestFullscreen) await target.requestFullscreen();
          else if (target.webkitRequestFullscreen) await target.webkitRequestFullscreen();
          modalDialog && modalDialog.classList.add("modal-fullscreen");
          if (maximizeBtn) maximizeBtn.style.display = "none";
          if (minimizeBtn) minimizeBtn.style.display = "inline-block";
        } else {
          if (document.exitFullscreen) await document.exitFullscreen();
          else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
          modalDialog && modalDialog.classList.remove("modal-fullscreen");
          if (minimizeBtn) minimizeBtn.style.display = "none";
          if (maximizeBtn) maximizeBtn.style.display = "inline-block";
        }
        // reset zoom/pan slightly after layout changes
        setTimeout(() => resetZoomState(), 80);
      } catch (err) { console.warn("toggleFullscreen error", err); }
    }

    // ---------- Keyboard handlers ----------
    document.addEventListener("keydown", function (e) {
      // Overview toggle shortcut (handled elsewhere)
      if (!modalEl) return;
      if (!modalEl.classList.contains("show")) return;
      if (e.key === "Escape") {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
        bsModal && bsModal.hide();
      } else if (e.key === "ArrowRight") {
        navigateRelative(1);
      } else if (e.key === "ArrowLeft") {
        navigateRelative(-1);
      } else if (e.key === "+" || e.key === "=") {
        zoomIn();
      } else if (e.key === "-") {
        zoomOut();
      } else if (e.key === "0") {
        resetZoom();
      } else if (e.key.toLowerCase() === "f") {
        toggleFullscreen();
      }
    });

    // ---------- Show/hide wiring for modal ----------
    if (modalEl) {
      modalEl.addEventListener("show.bs.modal", function (event) {
        const trigger = event && event.relatedTarget ? event.relatedTarget : null;
        const src = trigger ? (trigger.getAttribute("data-bs-image") || trigger.src) : modalImage.src;
        const title = trigger ? (trigger.getAttribute("data-bs-title") || trigger.getAttribute("title") || trigger.getAttribute("alt")) : viewerTitle.textContent || "";
        if (modalImage) {
          modalImage.src = src || "";
          modalImage.alt = title || "";
          if (viewerTitle) viewerTitle.textContent = title || "";
          if (modalImageTitle) modalImageTitle.textContent = title || "";
          modalImage.style.opacity = "0";
          setTimeout(() => { modalImage.style.opacity = "1"; }, 50);
        }

        if (modalDialog && modalDialog.classList.contains("modal-fullscreen")) {
          if (maximizeBtn) maximizeBtn.style.display = "none";
          if (minimizeBtn) minimizeBtn.style.display = "inline-block";
        } else {
          if (maximizeBtn) maximizeBtn.style.display = "inline-block";
          if (minimizeBtn) minimizeBtn.style.display = "none";
        }

        // create panzoom after load
        if (modalImage && modalImage.complete && modalImage.naturalWidth) {
          destroyPanzoomInstance(); createOrEnsurePanzoom(); resetZoomState();
        } else if (modalImage) {
          modalImage.onload = function () { destroyPanzoomInstance(); createOrEnsurePanzoom(); resetZoomState(); };
        }

        // attach handlers
        const viewerStage = modalEl.querySelector(".viewer-stage");
        if (viewerStage) viewerStage.addEventListener("wheel", wheelHandler, { passive: false });
        if (modalImage) { modalImage.addEventListener("dblclick", dblClickHandler); modalImage.addEventListener("pointerdown", pointerDown); }
        window.addEventListener("pointermove", pointerMove);
        window.addEventListener("pointerup", pointerUp);
      });

      modalEl.addEventListener("hide.bs.modal", function () {
        const viewerStage = modalEl.querySelector(".viewer-stage");
        if (viewerStage) viewerStage.removeEventListener("wheel", wheelHandler);
        if (modalImage) { modalImage.removeEventListener("dblclick", dblClickHandler); modalImage.removeEventListener("pointerdown", pointerDown); }
        window.removeEventListener("pointermove", pointerMove);
        window.removeEventListener("pointerup", pointerUp);
      });

      modalEl.addEventListener("hidden.bs.modal", function () {
        if (modalImage) {
          modalImage.src = "";
          if (viewerTitle) viewerTitle.textContent = "";
          if (modalImageTitle) modalImageTitle.textContent = "";
          destroyPanzoomInstance();
          resetManual();
        }
        if (modalDialog && modalDialog.classList.contains("modal-fullscreen")) modalDialog.classList.remove("modal-fullscreen");
        if (maximizeBtn) maximizeBtn.style.display = "inline-block";
        if (minimizeBtn) minimizeBtn.style.display = "none";
      });
    }

    // ---------- Wire buttons ----------
    if (zoomInBtn) zoomInBtn.addEventListener("click", zoomIn);
    if (zoomOutBtn) zoomOutBtn.addEventListener("click", zoomOut);
    if (resetZoomBtn) resetZoomBtn.addEventListener("click", resetZoom);
    if (maximizeBtn) maximizeBtn.addEventListener("click", toggleFullscreen);
    if (minimizeBtn) minimizeBtn.addEventListener("click", toggleFullscreen);
    if (closeBtn) closeBtn.addEventListener("click", function () { if (document.fullscreenElement) document.exitFullscreen().catch(() => { }); bsModal && bsModal.hide(); });
    if (btnNext) btnNext.addEventListener("click", () => navigateRelative(1));
    if (btnPrev) btnPrev.addEventListener("click", () => navigateRelative(-1));

    // ---------- Thumbnails open modal ----------
    const thumbs = Array.from(document.querySelectorAll(".gallery img"));
    thumbs.forEach(img => {
      img.setAttribute("tabindex", "0");
      img.addEventListener("click", function () {
        const src = img.getAttribute("data-bs-image") || img.src;
        const title = img.getAttribute("data-bs-title") || img.alt || "";
        if (bsModal) bsModal.show(modalEl);
        switchImage(src, title);
      });
      img.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); img.click(); } });
    });

    // ---------- Simple thumbnails sizing ----------
    (function thumbsResize() {
      function adjustGalleryImages() {
        const imgs = Array.from(document.querySelectorAll(".gallery img"));
        imgs.forEach(img => {
          const containerWidth = img.parentElement ? img.parentElement.offsetWidth : img.offsetWidth;
          img.style.height = Math.round(containerWidth * 0.72) + "px";
        });
      }
      window.addEventListener("resize", adjustGalleryImages);
      adjustGalleryImages();
    })();

    // ---------- Overview panel (left) ----------
    (function overview() {
      if (!ovwToggle || !ovwPanel || !ovwBackdrop) return;
      ovwPanel.hidden = ovwPanel.hasAttribute("hidden");
      ovwBackdrop.hidden = ovwBackdrop.hasAttribute("hidden");
      ovwToggle.setAttribute("aria-expanded", "false");

      function trapFocus(e) {
        if (e.key !== "Tab") return;
        const nodes = ovwPanel.querySelectorAll('button, a, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!nodes.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      function openPanel() {
        ovwPanel.hidden = false; ovwBackdrop.hidden = false;
        requestAnimationFrame(() => { ovwPanel.classList.add("active"); ovwBackdrop.classList.add("active"); ovwPanel.setAttribute("aria-hidden", "false"); ovwBackdrop.setAttribute("aria-hidden", "false"); ovwToggle.setAttribute("aria-expanded", "true"); });
        const focusable = ovwPanel.querySelectorAll('button, a, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable.length) focusable[0].focus();
        document.addEventListener("keydown", trapFocus);
        document.addEventListener("keydown", handleEsc);
      }
      function closePanel() {
        ovwPanel.classList.remove("active"); ovwBackdrop.classList.remove("active");
        ovwPanel.setAttribute("aria-hidden", "true"); ovwBackdrop.setAttribute("aria-hidden", "true"); ovwToggle.setAttribute("aria-expanded", "false");
        const hideAfter = (el) => {
          if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.hidden = true; return; }
          const onEnd = () => { el.hidden = true; el.removeEventListener('transitionend', onEnd); };
          el.addEventListener('transitionend', onEnd, { once: true });
          setTimeout(() => { if (!el.hidden) el.hidden = true; }, 450);
        };
        hideAfter(ovwPanel); hideAfter(ovwBackdrop);
        document.removeEventListener("keydown", trapFocus);
        document.removeEventListener("keydown", handleEsc);
      }
      function handleEsc(e) { if (e.key === "Escape") closePanel(); }
      ovwToggle.addEventListener("click", () => { if (ovwPanel.hidden || !ovwPanel.classList.contains("active")) openPanel(); else closePanel(); });
      ovwToggle.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ovwToggle.click(); } });
      ovwBackdrop.addEventListener("click", () => { if (ovwToggle) ovwToggle.click(); });
    })();

    // ---------- Theme toggle ----------
    (function theme() {
      const THEME_KEY = "gallery-theme";
      function setIcon() { const isDark = document.body.classList.contains("dark-theme"); if (themeIcon) themeIcon.className = isDark ? "fa fa-moon" : "fa fa-sun"; if (themeToggle) themeToggle.setAttribute("aria-pressed", isDark ? "true" : "false"); }
      function applySaved() { const saved = localStorage.getItem(THEME_KEY); if (saved === "light") document.body.classList.remove("dark-theme"); else document.body.classList.add("dark-theme"); setIcon(); }
      function toggleTheme() { document.body.classList.toggle("dark-theme"); localStorage.setItem(THEME_KEY, document.body.classList.contains("dark-theme") ? "dark" : "light"); setIcon(); }
      if (themeToggle) themeToggle.addEventListener("click", toggleTheme);
      applySaved();
      document.addEventListener("keydown", e => { if (e.key === "t" || e.key === "T") toggleTheme(); });
    })();

    // ---------- Help modal wiring ----------
    (function help() {
      if (!openHelpModalBootstrap) return;
      if (openHelpBtn) openHelpBtn.addEventListener("click", () => openHelpModalBootstrap.show());
      if (openHelpFromOverview) openHelpFromOverview.addEventListener("click", (ev) => { ev.preventDefault(); openHelpModalBootstrap.show(); });
      if (helpFloat) helpFloat.addEventListener("click", () => openHelpModalBootstrap.show());
      document.addEventListener("keydown", (e) => { if (e.key === "h" || e.key === "H") openHelpModalBootstrap.show(); });
    })();

    // ---------- Extras ----------
    (function extras() {
      // O to toggle overview
      document.addEventListener("keydown", (e) => {
        const active = document.activeElement && document.activeElement.tagName;
        if (active === "INPUT" || active === "TEXTAREA") return;
        if (e.key.toLowerCase() === "o") { const t = document.getElementById("ovwToggle"); if (t) t.click(); }
      });
    })();

    // ---------- Ensure body covers viewport ----------
    (function ensureFullBg() { function setMin() { document.body.style.minHeight = window.innerHeight + "px"; } window.addEventListener("resize", setMin); setMin(); })();

    // expose debug helpers (optional)
    window.__gallery_panzoom = () => panzoomInstance;
    window.__gallery_manual = () => manual;
    window.__gallery_zoomIn = zoomIn;
    window.__gallery_zoomOut = zoomOut;
    window.__gallery_reset = resetZoom;

  }); // end onReady
})(); // end file
