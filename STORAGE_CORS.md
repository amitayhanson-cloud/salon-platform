# Firebase Storage CORS (logo upload from localhost)

If logo upload from the admin panel fails with a CORS error when running on `http://localhost:3000`, configure CORS on your Storage bucket once:

1. Install [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) (includes `gsutil`).
2. Authenticate: `gcloud auth login`
3. Apply CORS (use your bucket name, e.g. `salon-platform-34cec.appspot.com`):

```bash
gsutil cors set storage.cors.json gs://salon-platform-34cec.appspot.com
```

After this, uploads from `http://localhost:3000` should succeed.
