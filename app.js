(() => {
  const MIN_PHOTOS = 5;
  const SAMPLE_W = 48;
  const SAMPLE_H = 32;
  const views = [
    { name: 'First view', direction: 'Choose a safe starting point' },
    { name: 'Second view', direction: 'Move one short step right' },
    { name: 'Third view', direction: 'Continue right, same distance' },
    { name: 'Fourth view', direction: 'Keep the same slope features' },
    { name: 'Fifth view', direction: 'Close the capture arc' },
  ];
  const video = document.querySelector('#camera-video');
  const canvas = document.querySelector('#capture-canvas');
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = SAMPLE_W;
  sampleCanvas.height = SAMPLE_H;
  const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
  const cameraFrame = document.querySelector('#camera-frame');
  const placeholder = document.querySelector('#camera-placeholder');
  const startButton = document.querySelector('#start-camera');
  const captureButton = document.querySelector('#take-photo');
  const flipButton = document.querySelector('#flip-camera');
  const errorBox = document.querySelector('#camera-error');
  const photos = [];
  let stream = null;
  let facingMode = 'environment';
  let heading = null;
  let overlapTimer = null;
  let matching = false;
  let orientationListening = false;

  function render() {
    const count = photos.length;
    const step = Math.min(count, views.length - 1);
    const current = views[step];
    document.querySelector('#shot-count').textContent = String(count);
    document.querySelector('#progress-status').textContent = `${count} / ${MIN_PHOTOS}`;
    document.querySelector('#progress-bar').style.width = `${Math.min(count / MIN_PHOTOS * 100, 100)}%`;
    document.querySelector('#progress-text').textContent = count >= MIN_PHOTOS ? 'Minimum photo set captured' : `At least ${MIN_PHOTOS - count} more ${MIN_PHOTOS - count === 1 ? 'view' : 'views'} needed`;
    document.querySelector('#shot-instruction').textContent = count === 0 ? 'Capture the first view' : count >= MIN_PHOTOS ? 'Add another view if needed' : current.direction;
    document.querySelector('#direction-text').textContent = count === 0 ? 'Choose a starting point' : count >= MIN_PHOTOS ? 'Add another view' : count === 4 ? 'Close the arc' : 'Move right';
    document.querySelector('#angle-value').textContent = count === 0 ? 'START' : '+20°';
    document.querySelector('#direction-arrow').textContent = count === 0 ? '◎' : '↗';
    document.querySelector('#guidance-message').textContent = count === 0
      ? 'Frame the full slope from safe ground. After each photo, move sideways a short step and keep the same features in view.'
      : 'Move sideways a short step, about 20° around the scene. Keep the same slope features in view and aim for at least 70% overlap.';
    document.querySelector('#clear-photos').hidden = count === 0;
    document.querySelector('#download-set').disabled = count === 0;
    document.querySelector('#photo-note').textContent = count >= MIN_PHOTOS ? 'Minimum set captured. Add views for areas hidden by the terrain.' : count ? `${count} captured · ${MIN_PHOTOS} required` : 'Your captured frames appear here.';

    const grid = document.querySelector('#thumbnail-grid');
    grid.replaceChildren();
    for (let index = 0; index < MIN_PHOTOS; index += 1) {
      const photo = photos[index];
      if (!photo) {
        const slot = document.createElement('div');
        slot.className = 'empty-slot';
        slot.textContent = '+';
        slot.setAttribute('aria-label', `Photo slot ${index + 1}`);
        grid.append(slot);
        continue;
      }
      const tile = document.createElement('div');
      tile.className = 'photo-thumb';
      const image = document.createElement('img');
      image.src = photo.url;
      image.alt = `Captured view ${index + 1}`;
      const label = document.createElement('span');
      label.className = 'photo-index';
      label.textContent = String(index + 1).padStart(2, '0');
      const remove = document.createElement('button');
      remove.className = 'remove-photo';
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove photo ${index + 1}`);
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        URL.revokeObjectURL(photos[index].url);
        photos.splice(index, 1);
        render();
      });
      tile.append(image, label, remove);
      grid.append(tile);
    }
    updateOverlapUI(null, count === 0 ? 'FIRST FRAME' : 'ALIGN NEXT VIEW');
  }

  async function requestOrientation() {
    if (typeof DeviceOrientationEvent === 'undefined' || orientationListening) return;
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const result = await DeviceOrientationEvent.requestPermission();
        if (result !== 'granted') return;
      } catch { return; }
    }
    window.addEventListener('deviceorientation', (event) => {
      if (Number.isFinite(event.alpha)) heading = (360 - event.alpha) % 360;
      updateDirectionFromHeading();
    }, { passive: true });
    orientationListening = true;
  }

  function updateDirectionFromHeading() {
    const prior = photos.at(-1);
    if (!prior || prior.heading == null || heading == null) return;
    let delta = ((heading - prior.heading + 540) % 360) - 180;
    const target = 20;
    const remaining = target - delta;
    if (remaining > 3) {
      document.querySelector('#direction-text').textContent = 'Rotate right slightly';
      document.querySelector('#angle-value').textContent = `+${Math.round(remaining)}°`;
      document.querySelector('#direction-arrow').textContent = '↗';
    } else if (remaining < -3) {
      document.querySelector('#direction-text').textContent = 'Ease back left';
      document.querySelector('#angle-value').textContent = `${Math.round(remaining)}°`;
      document.querySelector('#direction-arrow').textContent = '↖';
    } else {
      document.querySelector('#direction-text').textContent = 'Angle on target';
      document.querySelector('#angle-value').textContent = 'READY';
      document.querySelector('#direction-arrow').textContent = '✓';
    }
  }

  function readFrame() {
    if (!video.videoWidth || video.readyState < 2) return null;
    sampleContext.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
    const rgba = sampleContext.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
    const gray = new Float32Array(SAMPLE_W * SAMPLE_H);
    for (let p = 0, i = 0; p < rgba.length; p += 4, i += 1) {
      gray[i] = rgba[p] * 0.299 + rgba[p + 1] * 0.587 + rgba[p + 2] * 0.114;
    }
    return gray;
  }

  function estimateOverlap(previous, current) {
    if (!previous || !current) return null;
    let best = { correlation: -1, dx: 0, dy: 0 };
    for (let dy = -8; dy <= 8; dy += 2) {
      for (let dx = -14; dx <= 14; dx += 2) {
        const x0 = Math.max(0, -dx);
        const x1 = Math.min(SAMPLE_W, SAMPLE_W - dx);
        const y0 = Math.max(0, -dy);
        const y1 = Math.min(SAMPLE_H, SAMPLE_H - dy);
        let n = 0, sumA = 0, sumB = 0, sumAA = 0, sumBB = 0, sumAB = 0;
        for (let y = y0; y < y1; y += 1) {
          const rowA = y * SAMPLE_W;
          const rowB = (y + dy) * SAMPLE_W;
          for (let x = x0; x < x1; x += 1) {
            const a = previous[rowA + x];
            const b = current[rowB + x + dx];
            sumA += a; sumB += b; sumAA += a * a; sumBB += b * b; sumAB += a * b; n += 1;
          }
        }
        const covariance = sumAB - sumA * sumB / n;
        const varianceA = sumAA - sumA * sumA / n;
        const varianceB = sumBB - sumB * sumB / n;
        const correlation = varianceA > 1 && varianceB > 1 ? covariance / Math.sqrt(varianceA * varianceB) : -1;
        if (correlation > best.correlation) best = { correlation, dx, dy };
      }
    }
    if (best.correlation < 0.22) return { percent: null, confidence: best.correlation };
    const overlap = Math.max(0, SAMPLE_W - Math.abs(best.dx)) * Math.max(0, SAMPLE_H - Math.abs(best.dy));
    return { percent: Math.round(overlap / (SAMPLE_W * SAMPLE_H) * 100), confidence: best.correlation, dx: best.dx, dy: best.dy };
  }

  function updateOverlapUI(result, fallback = 'ALIGN NEXT VIEW') {
    const meter = document.querySelector('#overlap-meter');
    const value = document.querySelector('#overlap-value');
    const bar = document.querySelector('#overlap-bar');
    meter.classList.remove('good', 'low');
    if (!photos.length) {
      value.textContent = fallback;
      bar.style.width = '0%';
      return;
    }
    if (!result || result.percent == null) {
      value.textContent = result ? 'Low visual match' : 'Checking view…';
      bar.style.width = '0%';
      meter.classList.add('low');
      return;
    }
    value.textContent = `${result.percent}% estimated`;
    bar.style.width = `${result.percent}%`;
    meter.classList.add(result.percent >= 70 ? 'good' : 'low');
  }

  function checkOverlap() {
    if (!stream || !photos.length || matching) return;
    matching = true;
    try {
      const result = estimateOverlap(photos.at(-1).features, readFrame());
      updateOverlapUI(result);
    } catch {
      updateOverlapUI(null);
    } finally {
      matching = false;
    }
  }

  function stopCamera() {
    if (stream) stream.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
    if (overlapTimer) window.clearInterval(overlapTimer);
    overlapTimer = null;
    cameraFrame.classList.remove('active');
    placeholder.hidden = false;
    captureButton.disabled = true;
    flipButton.disabled = true;
    startButton.classList.remove('running');
    startButton.textContent = 'Start camera';
    document.querySelector('#live-text').textContent = 'CAMERA OFF';
    document.querySelector('#live-dot').classList.remove('on');
  }

  async function startCamera() {
    errorBox.hidden = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      errorBox.textContent = 'Camera access needs HTTPS (or localhost) and a browser that supports camera capture.';
      errorBox.hidden = false;
      return;
    }
    try {
      if (stream) stopCamera();
      await requestOrientation();
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      video.srcObject = stream;
      await video.play();
      cameraFrame.classList.add('active');
      placeholder.hidden = true;
      captureButton.disabled = false;
      flipButton.disabled = false;
      startButton.classList.add('running');
      startButton.textContent = 'Stop camera';
      document.querySelector('#live-text').textContent = 'LIVE CAMERA';
      document.querySelector('#live-dot').classList.add('on');
      document.querySelector('#lens-label').textContent = facingMode === 'environment' ? 'REAR CAMERA' : 'FRONT CAMERA';
      overlapTimer = window.setInterval(checkOverlap, 1200);
    } catch (error) {
      stream = null;
      const message = error?.name === 'NotAllowedError'
        ? 'Camera permission was blocked. Allow camera access in your browser settings, then try again.'
        : error?.name === 'NotFoundError'
          ? 'No camera was found on this device.'
          : error?.name === 'NotReadableError'
            ? 'The camera may be in use by another app. Close it and try again.'
            : `Could not start the camera${error?.message ? `: ${error.message}` : '.'}`;
      errorBox.textContent = message;
      errorBox.hidden = false;
    }
  }

  function takePhoto() {
    if (!stream || !video.videoWidth) return;
    const features = readFrame();
    const comparison = photos.length ? estimateOverlap(photos.at(-1).features, features) : null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d', { alpha: false });
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      photos.push({ blob, url: URL.createObjectURL(blob), features, heading, overlap: comparison?.percent ?? null });
      render();
      if (comparison) updateOverlapUI(comparison);
    }, 'image/jpeg', 0.92);
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  async function downloadPhotos() {
    const encoder = new TextEncoder();
    const chunks = [];
    const centralDirectory = [];
    let offset = 0;
    for (let index = 0; index < photos.length; index += 1) {
      const name = encoder.encode(`camera-guide-view-${String(index + 1).padStart(2, '0')}.jpg`);
      const data = new Uint8Array(await photos[index].blob.arrayBuffer());
      const checksum = crc32(data);
      const local = new Uint8Array(30 + name.length);
      const localView = new DataView(local.buffer);
      localView.setUint32(0, 0x04034b50, true); localView.setUint16(4, 20, true); localView.setUint16(10, 0, true); localView.setUint16(12, 33, true);
      localView.setUint32(14, checksum, true); localView.setUint32(18, data.length, true); localView.setUint32(22, data.length, true); localView.setUint16(26, name.length, true); local.set(name, 30);
      chunks.push(local, data);
      const central = new Uint8Array(46 + name.length);
      const view = new DataView(central.buffer);
      view.setUint32(0, 0x02014b50, true); view.setUint16(4, 20, true); view.setUint16(6, 20, true); view.setUint16(10, 0, true); view.setUint16(12, 33, true);
      view.setUint32(16, checksum, true); view.setUint32(20, data.length, true); view.setUint32(24, data.length, true); view.setUint16(28, name.length, true); view.setUint32(42, offset, true); central.set(name, 46);
      centralDirectory.push(central);
      offset += local.length + data.length;
    }
    const directoryLength = centralDirectory.reduce((sum, entry) => sum + entry.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, centralDirectory.length, true); endView.setUint16(10, centralDirectory.length, true); endView.setUint32(12, directoryLength, true); endView.setUint32(16, offset, true);
    const zip = new Blob([...chunks, ...centralDirectory, end], { type: 'application/zip' });
    const objectUrl = URL.createObjectURL(zip);
    const link = document.createElement('a');
    link.href = objectUrl; link.download = 'camera-guide-photo-set.zip'; document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  startButton.addEventListener('click', () => stream ? stopCamera() : startCamera());
  captureButton.addEventListener('click', takePhoto);
  flipButton.addEventListener('click', async () => {
    facingMode = facingMode === 'environment' ? 'user' : 'environment';
    await startCamera();
  });
  document.querySelector('#download-set').addEventListener('click', downloadPhotos);
  document.querySelector('#clear-photos').addEventListener('click', () => {
    photos.forEach((photo) => URL.revokeObjectURL(photo.url));
    photos.splice(0, photos.length);
    render();
  });
  document.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && stream && !event.repeat && !['BUTTON', 'INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      event.preventDefault();
      takePhoto();
    }
  });
  window.addEventListener('pagehide', stopCamera);
  render();
})();
