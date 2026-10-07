/* Klander push notifications (loaded into the main service worker) */
self.addEventListener('push', event => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { d = { title: 'Klander', body: event.data && event.data.text() } }
  const title = d.title || 'Klander'
  const opts = {
    body: d.body || '',
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    tag: d.tag || undefined,
    data: { url: d.url || '/', id: d.id }
  }
  event.waitUntil((async () => {
    await self.registration.showNotification(title, opts)
    if (d.badge && self.navigator && 'setAppBadge' in self.navigator) { try { await self.navigator.setAppBadge(d.badge) } catch (e) { /* ignore */ } }
  })())
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) {
        w.postMessage({ type: 'klander-open', url })
        return w.focus()
      }
    }
    return self.clients.openWindow(url)
  })())
})
