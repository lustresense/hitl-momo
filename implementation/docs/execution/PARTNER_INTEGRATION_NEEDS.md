# Integration needs from the partner PA (all currently UNKNOWN / not invented)

Frontend side is a *client adapter + event seam*. Nothing below exists in this repo and none of it was fabricated.

## A. Model / prediction (adapter: `src/prediction/partner-http-provider.ts`, contract `src/prediction/model-contract.ts`)
1. Endpoint URL(s), HTTPS, CORS allow-list for the frontend origin(s). Mode is baked at build time (`NEXT_PUBLIC_PREDICTION_MODE=partner`, `NEXT_PUBLIC_PREDICTION_ENDPOINT`).
2. Auth scheme. `NEXT_PUBLIC_*` values are visible in the bundle ⇒ no secrets in the client; adapter currently has **no header hook** (add once scheme is known) and does not send `X-Contract-Version` although docs say it does.
3. Request schema: is `{drawing:{strokes,hasInk,aspectRatio}}` (strokes normalized to the [0,1] unit square, letterboxed, ≤200 pts/stroke) acceptable, or raster/pixels? Need `levelId` / attempt id?
4. Response schema: exactly 3 candidates (now enforced), **descending confidence and unique labels (now enforced)**; confidence encoding (softmax vs logits), label vocabulary (the 7 prototype labels — papan, balok, batu, tangga, duri, tali, ember — are a placeholder), model version field.
5. Error taxonomy (frontend has 4: provider-unavailable, timeout, network, malformed-response), retry policy, latency SLA (8 s timeout / 1.5 s target are author drafts).

## B. Logging / DB / dashboard (seam: `src/domain/events.ts`; only a DEV console sink exists)
Events now emitted: `drawing_submitted`, `prediction_displayed`, `decision_made`, `redraw_requested`, `gameplay_result` (success **and fail**), `gameplay_retry`, `object_repositioned`, `another_object_requested`, `cycle_completed`, `provider_error`.
Partner must decide: transport (endpoint/batching/offline), identifiers (session, participant, attempt; whether student number may be stored at all), consent/PII policy, required fields (timestamp, `providerMode` MOCK|REAL, model version, confidences, stroke payload), export/dashboard fields. Until then logs cannot distinguish MOCK from REAL.

## C. Deployment contract (Ujang)
Static host must serve extensionless `/level1…/level3`, `/levels`, `/onboarding/*` (the "Lanjut ke Level" button does a full page load); deploy at domain root (MediaPipe + model paths are absolute `/mediapipe`, `/models`) or add `basePath`.
