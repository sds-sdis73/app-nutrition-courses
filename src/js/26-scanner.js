// ---------------------------------------------------------------------------
// Scanner de codes-barres
// ---------------------------------------------------------------------------
const Scanner = {
  el: null, stream: null, controls: null, raf: 0, done: false,
  async open(onCode) {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      toast('Caméra indisponible : ouvrez l\'app en https');
      return manualEntry(onCode);
    }
    if (!store.get('camExplained', false)) {
      const ok = await new Promise((resolve) => {
        let done = false;
        const el = openSheet(`<div style="text-align:center;padding:8px 4px 4px">
          <div style="width:72px;height:72px;margin:0 auto 12px;border-radius:50%;background:var(--primary-soft);color:var(--primary);display:grid;place-items:center">${ICON.camera.replace('<svg', '<svg width="36" height="36"')}</div>
          <h2 style="margin:0 0 8px">Autoriser l'appareil photo</h2>
          <p class="muted" style="margin:0 0 18px">Pour scanner le code-barres d'un produit, l'application a besoin d'accéder à votre appareil photo. Aucune image n'est enregistrée.</p>
          <button class="btn primary block" data-x="yes">Autoriser l'accès</button>
          <button class="btn block" data-x="no" style="margin-top:8px;border:0">Saisir le code à la main</button></div>`,
          { onClose: () => { if (!done) resolve(null); } });
        el.addEventListener('click', (e) => {
          const b = e.target.closest('[data-x]');
          if (!b) return;
          done = true;
          resolve(b.dataset.x === 'yes');
          closeSheet();
        });
      });
      if (ok === null) return;
      if (!ok) return manualEntry(onCode);
      store.set('camExplained', true);
    }
    this.done = false;
    this.el = document.createElement('div');
    this.el.className = 'scanner';
    this.el.innerHTML = `<video playsinline muted autoplay></video><div class="frame"></div>
      <div class="top"><button class="icon-btn" data-sc="close" aria-label="Fermer">${ICON.close}</button>
      <button class="icon-btn" data-sc="torch" aria-label="Lampe" hidden>${ICON.sparkle}</button></div>
      <div class="hint">Placez le code-barres dans le cadre</div>
      <div class="bottom"><button class="btn" data-sc="manual">Saisir le code</button></div>`;
    document.body.append(this.el);
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sc]');
      if (!b) return;
      if (b.dataset.sc === 'close') this.close();
      if (b.dataset.sc === 'manual') { this.close(); manualEntry(onCode); }
      if (b.dataset.sc === 'torch') this.toggleTorch();
    });
    const video = $('video', this.el);
    const found = (code) => {
      if (this.done || !/^\d{8,14}$/.test(code)) return;
      this.done = true;
      navigator.vibrate?.(80);
      this.close();
      onCode(code);
    };
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      video.srcObject = this.stream;
      await video.play();
      const track = this.stream.getVideoTracks()[0];
      if (track?.getCapabilities?.().torch) $('[data-sc="torch"]', this.el).hidden = false;

      const formats = 'BarcodeDetector' in window ? await Promise.resolve(BarcodeDetector.getSupportedFormats?.()).catch(() => []) : [];
      const native = Array.isArray(formats) && formats.includes('ean_13');
      if (native) {
        const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
        const loop = async () => {
          if (!this.el || this.done) return;
          try {
            const codes = await detector.detect(video);
            if (codes[0]) return found(codes[0].rawValue);
          } catch { /* image non prête */ }
          this.raf = requestAnimationFrame(loop);
        };
        loop();
      } else {
        await waitFor(() => window.ZXingBrowser);
        const reader = new ZXingBrowser.BrowserMultiFormatReader();
        this.controls = await reader.decodeFromVideoElement(video, (res) => { if (res) found(res.getText()); });
      }
    } catch (e) {
      this.close();
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
        openSheet(`${sheetHead('Accès à la caméra refusé')}<p>Pour scanner, autorisez l'appareil photo :</p>
          <ul class="muted"><li><b>iPhone</b> : Réglages › Safari › Appareil photo › Autoriser</li><li><b>Android</b> : icône à gauche de l'adresse › Autorisations › Caméra</li></ul>
          <button class="btn primary block" data-act="close-sheet">Compris</button>`);
      } else {
        fail(e, 'Impossible de démarrer la caméra');
      }
    }
  },
  async toggleTorch() {
    const track = this.stream?.getVideoTracks()[0];
    if (!track) return;
    this.torch = !this.torch;
    try { await track.applyConstraints({ advanced: [{ torch: this.torch }] }); } catch { /* non supporté */ }
  },
  close() {
    cancelAnimationFrame(this.raf);
    try { this.controls?.stop(); } catch { /* déjà arrêté */ }
    this.controls = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.torch = false;
    this.el?.remove();
    this.el = null;
  },
};
async function waitFor(fn, ms = 8000) {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('Lecteur de code-barres non chargé');
    await sleep(100);
  }
}
function manualEntry(onCode) {
  const el = openSheet(`${sheetHead('Saisir un code-barres')}
    <form class="row" data-form="ean"><input class="input grow" name="ean" inputmode="numeric" pattern="\\d{8,14}" placeholder="Ex. 3017620422003" required autofocus>
    <button class="btn primary">OK</button></form>`);
  $('form', el).addEventListener('submit', (e) => {
    e.preventDefault();
    const code = e.target.ean.value.trim();
    closeSheet();
    onCode(code);
  });
  setTimeout(() => $('input', el)?.focus(), 300);
}

