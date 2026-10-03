# ADR-0019: Process images client-side before uploading to PocketBase

Date: 2026-06-12 (records the pipeline built for project photos and avatars;
written down during the 2026-06 ADR backfill)

## Status

Accepted

## Context

Users upload progress photos and avatars, usually straight from a phone
camera: large HEIC/JPEG files that would be slow to upload, expensive to
store, and wasteful to serve at original size. There is no server-side image
processing tier (ADR-0001, ADR-0010), and adding one just for resizing would be
a new always-on cost.

## Decision

Images are processed in the browser before upload:

- **Compression and resizing** via `browser-image-compression`
  (`src/utils/image/imageCompression.ts`), bounding dimensions and file size
  before any bytes leave the device.
- **Cropping** via `react-easy-crop` in app-owned dialogs
  (`src/components/image/ImageCropDialog.tsx`, profile avatar variants).
- The processed file uploads to PocketBase file storage; display URLs come
  from the file-access helpers (see `docs/FILE_ACCESS_CONTRACT.md`), with
  PocketBase thumb parameters for smaller renditions.

## Rejected Alternatives

### Server-side processing (PocketBase hook or dedicated service)

JSVM hooks are the wrong tool for image work, and a dedicated image service
adds infrastructure for something the uploading device can do. Upload
bandwidth is also saved only if processing happens before upload.

### Uploading originals and serving via thumbs only

PocketBase thumbs help display, but storing multi-megabyte originals on a
PikaPods volume (ADR-0009) grows storage permanently for quality nobody views.

## Consequences

- Storage and bandwidth stay bounded at hobby-scale cost; originals never
  reach the server.
- Original full-resolution photos are not retained; users keep their camera
  roll as the archive. This is a deliberate product position.
- Compression runs on the user's device, so memory behavior on mobile Safari
  (large camera images) is a standing test concern.
- A future need for originals (printing, re-cropping later) would require
  revisiting this ADR, not a quiet settings change.
