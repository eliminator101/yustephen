export async function onRequest(context) {
    const { request } = context;
    const url = new URL(request.url);
    
    // Only handle /mirror/proxy/* paths
    if (url.pathname.startsWith('/mirror/proxy/')) {
        const path = url.pathname.replace('/mirror/proxy', '') || '/';
        const targetUrl = `https://eliminator101.github.io/nexus${path}`;
        
        return fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });
    }
    
    // Let static files handle everything else
    return new Response('Not Found', { status: 404 });
}