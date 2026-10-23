// Website-only, public write-only beacon token. This grants no access to reports.
// Reports require the owner's Cloudflare login; no report API is exposed here.
// Keep previews, mirrors and the npm desktop/runtime entirely outside collection.
if (
  location.protocol === 'https:' &&
  location.hostname === 'bitefoundry.github.io' &&
  (location.pathname === '/retrieviewer' || location.pathname.startsWith('/retrieviewer/')) &&
  !document.querySelector('script[data-cf-beacon]')
) {
  const beacon = document.createElement('script');
  beacon.type = 'module';
  beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  beacon.dataset.cfBeacon = JSON.stringify({
    token: 'b3ba18f1e499415a9168b4231310b275',
    spa: false,
  });
  document.body.append(beacon);
}
