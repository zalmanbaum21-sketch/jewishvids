

## Jewish Videos access and storage behavior

The site has two separate signed, HTTP-only code sessions. Viewers must enter an active six-digit code before the library query or protected media path can be accessed. The administrator entry uses the exact code `112034` and unlocks the management panel separately.

Video bytes are uploaded in retryable 16 MB chunks through same-origin endpoints, stored as temporary chunk objects, and assembled server-side into the final object. The app database stores only the title, original filename, MIME type, byte count, storage key, and playback reference. The byte-count column is BIGINT-backed so a file at the 3 GB boundary is representable.

The platform's current storage helper exposes upload and signed reads but does not expose an object-delete API. Deleting a video therefore removes the database row and all app references, making the object unreachable through the application; a future platform delete API can be connected without changing the database model.


## Playback-only behavior

Video players hide the browser download control, disable remote playback and Picture-in-Picture, and suppress common context-menu and drag-save interactions. This is a deterrent for ordinary viewers, not cryptographic DRM: any browser that can play a video receives media data and a determined user may still capture it through developer tools, screen recording, or other software.


## Video thumbnails

Admins may optionally upload an image thumbnail alongside a video. Thumbnail images are limited to 10 MB, stored in object storage, and referenced by nullable metadata fields on the video record. Thumbnail URLs pass through the same access-checked storage proxy as video playback.


## Artist attribution

Admins may optionally enter an artist name when uploading a video. The value is stored as nullable video metadata, limited to 255 characters, and displayed beneath the title for authorized viewers.


## Editing existing videos

After unlocking the viewer library, an administrator can open the Admin Panel and use the pencil action on any video to edit its title, artist attribution, or thumbnail. Thumbnail replacement remains limited to 10 MB, and the existing thumbnail can be cleared. The Admin Panel and upload/update endpoints require both a valid viewer session and the separate admin code.


## Large upload behavior

The admin uploader now reports live transfer speed, estimated remaining time, retries failed chunks up to two times, and shows a separate storage-assembly stage. Raw upload time still depends on the uploader’s connection and the storage service, but a dropped chunk no longer requires restarting the entire video. Abandoned temporary chunk objects are not referenced by the app and remain inaccessible through the protected media path.


## Deployment

This project is configured for a Node.js web service on Render. The database uses a MySQL-compatible TiDB Cloud Starter instance and video/object storage uses a private Cloudflare R2 bucket. Set the variables in `.env.example` in Render before deploying. Do not commit real secrets.
