# Sandy Hook Marine Dashboard

Live marine conditions dashboard for Sandy Hook and the New Jersey coast.

## Current features
- **Observed conditions:** Four NOAA marine criteria (sustained wind, significant wave height, dominant period, and wind-wave chop) with enlarged pass/fail indicators.
- **Seven-day marine forecast:** Daily text summaries from the NWS ANZ450 forecast, covering wind, seas, wave period, and wind-wave chop when reported. Unavailable forecast metrics are explicitly marked rather than estimated.
- **Rotating fish photo:** A randomly selected Atlantic fish image on each page load, requested from the server's `/api/fish-photo` endpoint.
- **Buffett on the Water:** An optional YouTube player for Jimmy Buffett nautical songs. The user must click Play when browser autoplay restrictions apply.

## Deployment
Deploy the latest commit from the `main` branch on Render. The web service runs `server.js` and serves `index.html`. This README commit bundles documentation for all three recent UI changes; their implementations are already included in the same branch history.
