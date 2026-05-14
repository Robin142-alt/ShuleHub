# Provider Hardening

This guide captures the Implementation 7 production provider contract for SMS support delivery, upload malware scanning, and tenant-scoped object storage. Do not commit provider secrets or real phone numbers.

## Support SMS Relay

Deploy `apps/sms-relay` as its own Railway service using [deploy/railway/sms-relay.railway.json](/C:/Users/user/Desktop/PROJECTS/Shule%20hub/deploy/railway/sms-relay.railway.json).

Required relay variables:

- `SMS_RELAY_AUTH_TOKEN`
- `SMS_PROVIDER=africastalking`
- `SMS_PROVIDER_API_URL`
- `SMS_PROVIDER_API_KEY`
- `SMS_PROVIDER_USERNAME`
- `SMS_PROVIDER_SENDER_ID`
- `SMS_DRY_RUN=false`

Required API variables after the relay domain exists:

- `SUPPORT_NOTIFICATION_SMS_WEBHOOK_URL=https://<sms-relay-domain>/send`
- `SUPPORT_NOTIFICATION_SMS_WEBHOOK_HEALTH_URL=https://<sms-relay-domain>/health`
- `SUPPORT_NOTIFICATION_SMS_WEBHOOK_TOKEN`
- `SUPPORT_NOTIFICATION_SMS_RECIPIENTS`
- `SUPPORT_PROVIDER_SMOKE_REQUIRE_SMS=true`
- `SUPPORT_PROVIDER_SMOKE_LIVE=true`

The relay redacts phone numbers in logs and returns non-2xx on provider failure so the API retry worker can retry.

## Upload Malware Scanner

Deploy `apps/malware-scanner` as its own Railway service using [deploy/railway/malware-scanner.railway.json](/C:/Users/user/Desktop/PROJECTS/Shule%20hub/deploy/railway/malware-scanner.railway.json).

Required scanner variables:

- `MALWARE_SCANNER_AUTH_TOKEN`
- `MALWARE_SCANNER_MAX_BYTES=10485760`
- `MALWARE_SCANNER_EICAR_TEST_ENABLED=true`

Required API variables after the scanner domain exists:

- `UPLOAD_MALWARE_SCAN_PROVIDER=clamav`
- `UPLOAD_MALWARE_SCAN_API_URL=https://<scanner-domain>/scan`
- `UPLOAD_MALWARE_SCAN_HEALTH_URL=https://<scanner-domain>/health`
- `UPLOAD_MALWARE_SCAN_API_TOKEN`
- `UPLOAD_MALWARE_SCAN_REQUIRED=true`

The scanner rejects over-limit payloads, verifies SHA-256 when supplied, detects EICAR, and uses ClamAV in the deployment container.

## External Object Storage

Use a private Cloudflare R2 or S3 bucket dedicated to ShuleHub production uploads.

Required API variables:

- `UPLOAD_OBJECT_STORAGE_ENABLED=true`
- `UPLOAD_OBJECT_STORAGE_PROVIDER=r2`
- `UPLOAD_OBJECT_STORAGE_ENDPOINT`
- `UPLOAD_OBJECT_STORAGE_BUCKET`
- `UPLOAD_OBJECT_STORAGE_REGION=auto`
- `UPLOAD_OBJECT_STORAGE_ACCESS_KEY_ID`
- `UPLOAD_OBJECT_STORAGE_SECRET_ACCESS_KEY`

Provider smoke writes, reads, verifies SHA-256, and deletes a smoke object under:

```text
tenant/provider-smoke/support/provider-smoke.txt
```

Runtime uploads must stay tenant-scoped:

```text
tenant/{tenant_id}/support/{ticket_id}/...
tenant/{tenant_id}/admissions/{application_id}/...
```

## Verification

Run locally with production-safe environment variables loaded:

```bash
npm run smoke:providers
```

Expected required checks:

- `support-sms` passes.
- `live-support-sms-provider` passes.
- `upload-malware-scan` passes.
- `live-upload-malware-scan-provider` passes.
- `upload-object-storage` passes.
- `live-upload-object-storage` passes.

Provider smoke output must not include tokens, object-storage keys, scanner URLs with credentials, or full recipient phone numbers.
