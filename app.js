(() => {
  const MIN_PHOTOS = 5;
  const views = [
    { name: 'Front left', hint: 'Start at one side of the slope' },
    { name: 'Front center', hint: 'Keep the same features in frame' },
    { name: 'Front right', hint: 'Overlap the previous view' },
    { name: 'Left oblique', hint: 'Angle toward the slope' },
    { name: 'Right oblique', hint: 'Close the coverage arc' },
  ];
  const video = document.querySelector('#camera-video');
  const canvas = document.querySelector('#capture-canvas');
  const cameraFrame = document.querySelector('#camera-frame');
  const placeholder = document.querySelector('#camera-placeholder');
  const startButton = document.querySelector('#start-camera');
  const captureButton = document.querySelector('#take-photo');
  const flipButton = document.querySelector('#flip-camera');
  const errorBox = document.querySelector('#camera-error');
  const photos = [];
  let stream = null;
  let facingMode = 'environment';

  function render() {
    const count = photos.length;
    const routeIndex = Math.min(count, views.length - 1);
    const current = views[routeIndex];
    document.querySelector('#progress-text').textContent = `${count} of ${MIN_PHOTOS} views`;
    document.querySelector('#progress-status').textContent = count >= MIN_PHOTOS ? 'SET COMPLETE' : count === 0 ? 'NOT STARTED' : 'IN PROGRESS';
    document.querySelector('#progress-bar').style.width = `${Math.min((count / MIN_PHOTOS) * 100, 100)}%`;
    document.querySelector('#photo-count').textContent = `${count} / ${MIN_PHOTOS}${count > MIN_PHOTOS ? '+' : ''}`;
    document.querySelector('#view-step').textContent = String(Math.min(count + 1, MIN_PHOTOS)).padStart(2, '0');
    document.querySelector('#view-name').textContent = current.name;
    document.querySelector('#view-hint').textContent = count >= MIN_PHOTOS ? 'Add another angle if the scene needs it' : current.hint;
    document.querySelector('#set-footer-text').textContent = count >= MIN_PHOTOS ? 'Starter set captured. Add more views for complex terrain.' : `Capture at least ${MIN_PHOTOS} views to complete the set.`;
    document.querySelector('#clear-photos').hidden = count === 0;
    document.querySelector('#download-set').disabled = count === 0;
    document.querySelectorAll('[data-route-item]').forEach((item, index) => {
      item.classList.toggle('done', index < count);
      item.classList.toggle('active', index === routeIndex && count < MIN_PHOTOS);
      item.querySelector('.route-state').textContent = index < count ? 'DONE' : index === routeIndex && count < MIN_PHOTOS ? 'NEXT' : '';
    });
    document.querySelectorAll('.route-pin').forEach((pin, index) => {
      pin.classList.toggle('done', index < count);
      pin.classList.toggle('active', index === routeIndex && count < MIN_PHOTOS);
    });
    const grid = document.querySelector('#thumbnail-grid');
    grid.replaceChildren();
    const shown = Math.max(MIN_PHOTOS, count);
    for (let index = 0; index < shown; index += 1) {
      const photo = photos[index];
      if (!photo) {
        const slot = document.createElement('div');
        slot.className = 'empty-slot';
        slot.innerHTML = '<span>+</span><small>YOUR PHOTOS<br />APPEAR HERE</small>';
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
  }

  function stopCamera() {
    if (stream) stream.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
    cameraFrame.classList.remove('active');
    placeholder.hidden = false;
    captureButton.disabled = true;
    flipButton.disabled = true;
    startButton.classList.remove('button-light');
    startButton.querySelector('span:last-child').textContent = 'Start camera';
    document.querySelector('#live-text').textContent = 'CAMERA OFF';
  }

  async function startCamera() {
    errorBox.hidden = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      errorBox.textContent = 'Camera access needs a secure page (HTTPS or localhost) and a browser that supports getUserMedia.';
      errorBox.hidden = false;
      return;
    }
    try {
      if (stream) stopCamera();
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      video.srcObject = stream;
      await video.play();
      cameraFrame.classList.add('active');
      placeholder.hidden = true;
      captureButton.disabled = false;
      flipButton.disabled = false;
      startButton.classList.add('button-light');
      startButton.querySelector('span:last-child').textContent = 'Stop camera';
      document.querySelector('#live-text').textContent = 'LIVE PREVIEW';
      document.querySelector('.lens-label').textContent = facingMode === 'environment' ? 'REAR CAMERA' : 'FRONT CAMERA';
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
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d', { alpha: false });
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      photos.push({ blob, url: URL.createObjectURL(blob) });
      render();
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
      const name = encoder.encode(`terra-sight-view-${String(index + 1).padStart(2, '0')}.jpg`);
      const data = new Uint8Array(await photos[index].blob.arrayBuffer());
      const checksum = crc32(data);
      const local = new Uint8Array(30 + name.length);
      const localView = new DataView(local.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(10, 0, true);
      localView.setUint16(12, 33, true);
      localView.setUint32(14, checksum, true);
      localView.setUint32(18, data.length, true);
      localView.setUint32(22, data.length, true);
      localView.setUint16(26, name.length, true);
      local.set(name, 30);
      chunks.push(local, data);

      const central = new Uint8Array(46 + name.length);
      const centralView = new DataView(central.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(12, 33, true);
      centralView.setUint32(16, checksum, true);
      centralView.setUint32(20, data.length, true);
      centralView.setUint32(24, data.length, true);
      centralView.setUint16(28, name.length, true);
      centralView.setUint32(42, offset, true);
      central.set(name, 46);
      centralDirectory.push(central);
      offset += local.length + data.length;
    }

    const directoryLength = centralDirectory.reduce((sum, entry) => sum + entry.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, centralDirectory.length, true);
    endView.setUint16(10, centralDirectory.length, true);
    endView.setUint32(12, directoryLength, true);
    endView.setUint32(16, offset, true);
    const zip = new Blob([...chunks, ...centralDirectory, end], { type: 'application/zip' });
    const objectUrl = URL.createObjectURL(zip);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = 'terra-sight-photo-set.zip';
    document.body.append(link);
    link.click();
    link.remove();
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

