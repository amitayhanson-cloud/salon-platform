# Firebase Storage CORS (localhost uploads)

Uploads from the browser use the **Firebase Storage Web SDK** (`uploadBytes` + `getDownloadURL`). The bucket must allow your dev origin in CORS or the browser will block the request.

## When this is needed

- You see a CORS error when uploading from **http://localhost:3000** (or similar).
- Error text may mention `firebasestorage.googleapis.com` and "preflight" or "access control".

## One-time setup (dev)

1. Get your bucket name from Firebase: **Project settings → Storage → bucket** (e.g. `your-project.appspot.com`), or from `.env.local`: `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`.

2. Apply the CORS config (from the project root):

   **Using gcloud (recommended):**
   ```bash
   gcloud storage buckets update gs://YOUR_BUCKET_NAME --cors-file=storage.cors.json
   ```

   **Using gsutil:**
   ```bash
   gsutil cors set storage.cors.json gs://YOUR_BUCKET_NAME
   ```

3. Replace `YOUR_BUCKET_NAME` with your actual bucket (e.g. `salon-platform-34cec.appspot.com`).

## Production

Add your production origin(s) to `storage.cors.json` in the `origin` array, then re-run the same command. Example:

```json
"origin": ["http://localhost:3000", "https://yourdomain.com", "https://www.yourdomain.com"]
```

## Notes

- Uploads use the **Firebase JS SDK** only (no direct POST to `/o?name=...`). CORS is still required for browser requests to the bucket.
- Storage **security rules** are in `storage.rules` and are deployed with `firebase deploy` (only authenticated users can write; app enforces site ownership).
