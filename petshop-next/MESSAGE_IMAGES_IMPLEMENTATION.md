# Image messages

Customer and Admin Messages share the same image attachment control. An image button opens the file picker; a preview shows the selected photo and lets the sender remove it before sending. Images can be sent alone or with an optional text caption. Received images appear in the conversation and open at a larger size in a separate tab.

## Implementation

- `src/components/MessagesPanel.tsx`: file picker, preview, cleanup, image-only/caption sending, safe retry state, received image links, and existing text behavior.
- `src/components/AdminIcon.tsx`: image icon.
- `src/app/globals.css`: attachment button, preview, image bubbles and mobile layout.
- `src/app/api/messages/route.ts`: bounded multipart requests alongside existing JSON; atomic message/image insertion; retry fingerprint checks; photo previews and existing message notifications/unread state.
- `src/app/api/messages/[id]/image/route.ts`: authenticated, private image responses. Only the conversation's customer or authorized shop support can read them.
- `src/lib/message-image.ts`: validates and decodes uploaded images with Sharp, enforces size/pixel limits, rotates/resizes them and stores a metadata-free WebP copy. Original product/pet image handling is unchanged.
- `scripts/ensure-messaging.mjs`: additive `support_message_images` table linked by message ID to the existing messages. `npm run db:messaging` applies it; the standard database upgrade already calls this migration. No conversations or messages are deleted or rewritten.
- `package.json` / `package-lock.json`: Sharp, already installed through Next, is now a direct app dependency.
- `scripts/test-message-images.mjs` / `scripts/test-system.mjs`: two-way image, privacy, validation, notification, retry and browser checks.

JPG, PNG and WebP are accepted up to 1,500,000 bytes per file. The server fully decodes and rewrites the image, rejects unsupported/corrupt images and limits input pixels to 20 million. Stored images are scaled to fit within 1600×1600 without upscaling. Image bytes are kept in the database rather than a public directory; message history JSON includes only the authorized image URL, not the blob.

Existing user/session checks, conversation ownership, shared support inbox, 20 messages/minute rate limit, read counters, notifications, pagination, and text messages remain in use. Images and message rows commit together. A repeated request key with the same caption/image returns the original message; conflicting content returns 409.

## Verification

Final verification: production build/TypeScript passed; 77 system/browser tests passed with 0 failures. Isolated audit database: `petshop_audit_1e126d613a86`. Mobile screenshot inspected: `CHAT_IMAGES_320.png`. Existing source conversations/messages were preserved; no live chat messages were sent by the tests.

The additive migration and production build were run. Tests use isolated audit databases and do not send messages to real customer/admin conversations. Backend tests cover customer-to-admin and admin-to-customer images, captions, persistence, private downloads, unread/notification behavior, duplicate prevention, changed-image conflicts, corrupt/oversized uploads, and other-customer denial. Chrome tests cover native file input, preview/removal, both sending directions, reloading history, image rendering, and desktop/mobile overflow. Final results are reported in chat and `SYSTEM_TEST_RESULTS.json`.

The first browser file-picker check used a stale frontend DOM node ID; the test now waits for hydration and uses the current backend node reference. This was a test-harness correction. Only completed passing checks are included in final results.
