# Project TODO

- [x] Create the Jewish Videos private entry page with a clean, spacious Scandinavian aesthetic.
- [x] Keep all video-library content hidden until a valid six-digit viewer access code is entered.
- [x] Validate viewer access codes server-side and maintain a separate authenticated viewer session.
- [x] Show the authenticated video library with playable uploaded videos and a clear Admin Panel link at the top.
- [x] Require the separate admin code `112034` before exposing admin controls.
- [x] Validate the admin code server-side and maintain a separate authenticated admin session.
- [x] Add database tables for viewer access codes and video metadata/storage references.
- [x] Store uploaded video bytes in scalable object storage and keep only metadata plus storage references in the database.
- [x] Support website video uploads up to 3 GB with progress and clear error handling.
- [x] Allow admins to upload videos and assign titles.
- [x] Allow admins to delete videos and remove their stored objects.
- [x] Allow admins to add and delete six-digit viewer access codes.
- [x] Apply pale cool-gray, bold black sans-serif, delicate subtitle typography, and restrained pastel blue/blush geometric accents.
- [x] Ensure responsive layout, accessible focus states, and usable empty/loading/error states.
- [x] Add automated tests covering code validation, admin separation, video/code management authorization, and size validation.
- [x] Run type checks, tests, and visual verification before delivery.

- [x] Change video size metadata to BIGINT so a true 3 GB upload is representable safely.
- [x] Add explicit admin loading and error states and visible focus styles for custom controls.
- [x] Expand authorization tests for every admin mutation.
- [x] Document the storage-layer limitation that the current platform does not expose object deletion; database/video references are removed and the storage proxy blocks deleted references.

- [x] Update the viewer access code to `970394`.
- [x] Make `970394` the only active viewer access code and verify the final access-code table contents.

- [x] Fix the browser upload failure that reports “Upload could not reach storage” for an 113 MB video.
- [x] Add regression coverage for the upload target and browser upload error path.
- [x] Replace the unreliable browser-to-presigned-storage PUT step with a resilient upload route for large videos.
- [x] Verify the new streaming upload route with an actual 113 MB file and confirm a successful storage response.
- [x] Clean up the temporary verification record/reference after the end-to-end upload check.

- [x] Remove visible download controls and block common save/context-menu paths on authorized video players.
- [x] Document the limitation that browser playback cannot guarantee absolute prevention of copying or capture.

- [x] Add optional thumbnail metadata and storage references to videos.
- [x] Let admins upload a thumbnail with a video and show upload validation/progress.
- [x] Render thumbnails in the private library while keeping video playback protected.
- [x] Add tests for thumbnail validation and admin-only thumbnail upload metadata.

- [x] Add optional artist metadata to video records.
- [x] Add an Artist input to the admin upload form and persist it with each video.
- [x] Display artist attribution in the private video library and cover it with tests.
- [x] Add a focused client-side regression test for artist attribution rendering in the library card.

- [x] Remove the left-side entry-page intro copy and center the access card across desktop and mobile layouts.
- [x] Verify the unauthenticated entry page at a real mobile viewport.
- [x] Confirm the unauthenticated desktop entry page after the landing-page refactor.

- [x] Add protected admin editing for an existing video’s title, artist, and thumbnail.
- [x] Add an Edit control and responsive edit form to each admin video card.
- [x] Add tests for admin-only video updates and thumbnail replacement metadata.

- [x] Hide the Admin Panel entry until the viewer code has unlocked the library.
- [x] Enforce viewer-session plus admin-code authorization server-side before opening admin controls.
- [x] Add regression coverage for blocked admin entry without a viewer session.

- [x] Improve upload behavior for 2 GB videos so progress is clear and the request is less fragile.
- [x] Add regression coverage for large-file progress and the selected upload strategy.
- [x] Document any remaining speed or hosting limits for very large uploads.
- [x] Implement retryable chunked upload sessions for large videos using the existing storage helpers.
- [x] Assemble verified chunks server-side into one final video storage object before metadata finalization.
- [x] Add chunk-session authorization and regression tests.
- [x] Send total chunk count when creating resumable upload sessions.
- [x] Add success-path tests for resumable session creation, chunk upload, and assembly.
- [x] Add authorization tests for the resumable chunk endpoint and admin requirement.
- [x] Run a real small-file resumable upload through session, chunk, and assembly endpoints.

- [x] Fix the new resumable upload error that reports the upload service cannot be reached.
- [x] Add regression coverage for the failing session/chunk request path and user-facing error message.
- [x] Add client-side regression tests for resumable session-request and chunk-request failures, including the surfaced user-facing messages.
- [x] Verify the admin upload UI/toast shows the resumable-upload failure message for failed session or chunk requests.

