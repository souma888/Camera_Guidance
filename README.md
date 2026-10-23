# Camera Guide

A phone-first web camera guide for capturing overlapping photos of a landslide from a safe viewpoint.

## Capture guidance

- Opens the device camera over HTTPS and prefers the rear camera.
- Places a framing guide, horizon line, perspective footprint, and next-position/angle cue directly over the live view.
- Estimates the visible overlap with the previous photo using low-resolution visual matching between frames. The estimate is approximate and is not a 3D measurement.
- Requires a minimum set of five photos, displays the captured frames, and downloads them together as a ZIP file.
- Keeps captures in browser memory; no server, upload, or analytics path is included.
- Includes a reminder to capture from safe, stable ground.

On supported phones, the angle cue uses device orientation to help estimate a turn relative to the previous capture. When orientation is unavailable, it shows the suggested movement direction and step.

## Run locally

Requires Node.js 20 or later. No package installation is needed.

```bash
npm start
```

Open [http://localhost:4173](http://localhost:4173). Camera access requires HTTPS or localhost.

## Limits

The overlap percentage is a visual estimate based on image similarity and apparent frame shift. Repeated texture, lighting changes, low-texture terrain, blur, and large camera rotations can reduce its accuracy. The overlay does not map the terrain in 3D, verify reconstruction quality, or replace field-safety judgment.

## License

MIT. See [LICENSE](LICENSE).
