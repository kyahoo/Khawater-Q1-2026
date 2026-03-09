self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  const data = event.data.json();

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/favicon.ico",
      data: {
        url: data.data?.url ?? data.url ?? data.link_url ?? null,
      },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/notifications";
  const absoluteTargetUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        if (client.url === absoluteTargetUrl && "focus" in client) {
          await client.focus();
          return;
        }
      }

      const firstClient = windowClients[0];

      if (firstClient && "navigate" in firstClient && "focus" in firstClient) {
        await firstClient.navigate(absoluteTargetUrl);
        await firstClient.focus();
        return;
      }

      await self.clients.openWindow(absoluteTargetUrl);
    })()
  );
});
