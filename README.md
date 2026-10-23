# Terra Sight Camera Guide

A standalone, phone-first capture guide for collecting overlapping landslide and terrain photographs. It is the capture-guidance slice of Terra Sight; it does not reconstruct or analyze the terrain.

## What it does

- Requests the phone's rear camera (with a switch-camera control where the device supports it).
- Shows a live framing overlay with a horizon guide and overlap bands.
- Guides the user around five starter viewpoints: front left, front center, front right, left oblique, and right oblique.
- Keeps captured photos in the browser session, shows thumbnails, supports removing shots, and downloads the set as a ZIP of JPEG files.
- Gives field-safety guidance and explains that five views are a minimum starting point, not a guarantee of reconstruction quality.

The isometric route diagram is a visual plan for viewpoint order. It is not world-anchored augmented reality and does not measure the slope. The current version uses simple camera and framing feedback; it does not estimate overlap from the image, track user position, or decide whether a scene will reconstruct successfully.

## Run locally

Requires Node.js 20 or later. No package installation is needed.

```bash
npm start
```

Open [http://localhost:4173](http://localhost:4173). Camera access requires a secure context: use `localhost` for local development or HTTPS when hosted. On a phone, the deployed website must use HTTPS.

## Privacy

There is no backend, analytics, or upload path in this prototype. Photos are held in memory in the open browser page until it is closed or refreshed. Use **Save photos** to download them to the device. Hosting this static page publicly does not transmit the camera feed or captures to the host.

## Current limits and next steps

- The five-view route is a practical starter pattern; complex, obstructed, texture-poor, or large scenes may need more photos and varied elevations.
- The overlay is a framing aid. True AR guidance would need device pose tracking (for example, WebXR where supported) and a calibrated scene model.
- Add blur, exposure, and image-size checks before capture acceptance.
- Later, connect the exported photos to Terra Sight's reconstruction readiness pipeline.

## License

MIT. See [LICENSE](LICENSE).

