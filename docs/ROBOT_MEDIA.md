# Robot media

Migration `20261007000000_robot_media.sql` creates a private `robot-media` Supabase Storage bucket and event/team `robot_media` metadata. The bucket accepts JPEG files up to 2 MB. Metadata distinguishes pit uploads from cached TBA image URLs. Team pages use short-lived signed URLs for pit photos and show a validated TBA image if no pit photo exists.

The pit form accepts a phone camera or file selection. The server checks authentication, active event roster membership, MIME/content, input size (12 MB), decoded pixel count, and per-team photo count (four). Sharp rotates, resizes to a maximum 1600×1600, and converts to JPEG under 2 MB. The server chooses the path and uploads with a service client, then writes metadata; it removes the object if metadata insertion fails. Authenticated clients have read access to visible media metadata and linked objects, but no direct write policy for the bucket. Admin removal deletes pit uploads from Storage and metadata. Cached TBA images are managed by the provider sync.

Uploads are independent of pit text capture. When offline, a selected photo is marked pending in the UI and the scout can select it again later, including after the pit report is finalized. Photo bytes are not added to the text report's IndexedDB queue.

An admin TBA event sync also checks `/event/{event_key}/team_media`. Only `imgur` direct images on `i.imgur.com` with a recognized raster extension enter the fallback cache. Provider failure preserves existing images and does not fail match sync. Team pages use only the cached media table and do not make browser TBA API calls.

TBA `avatar` media is cached separately as team branding; see [team avatars](TEAM_AVATARS.md). It never replaces a pit robot photo or becomes a robot-photo fallback.
