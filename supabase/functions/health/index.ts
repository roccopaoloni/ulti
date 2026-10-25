// Public health check (ADR 0006). An uptime monitor calls it every 5 minutes, which keeps
// the Free project from pausing and emails the owner when the backend is down.
Deno.serve(() => new Response('ok'));
