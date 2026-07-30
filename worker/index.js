/**
 * Cloudflare Worker entry point for the Sites production build.
 *
 * Vite emits the SPA into dist/client. The Sites runtime binds that directory
 * as ASSETS; unknown browser routes fall back to index.html for client routing.
 */
export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request)
    if (response.status !== 404 || request.method !== 'GET') return response

    const acceptsHtml = (request.headers.get('accept') ?? '').includes('text/html')
    if (!acceptsHtml) return response

    const indexUrl = new URL('/index.html', request.url)
    return env.ASSETS.fetch(new Request(indexUrl, request))
  },
}
