// functions/mirror/index.js
export function onRequest(context) {
    const { request } = context;
    
    // Get the path after /mirror/
    const url = new URL(request.url);
    const path = url.pathname.replace('/mirror', '') || '/';
    
    // Target site
    const targetUrl = `https://eliminator101.github.io/nexus${path}${url.search}`;
    
    console.log(`Proxying: ${targetUrl}`);
    
    // Fetch from the target
    return fetch(targetUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br'
        }
    }).then(response => {
        // Create a new response with CORS headers
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Access-Control-Allow-Origin', '*');
        
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
        });
    }).catch(err => {
        return new Response(`
            <!DOCTYPE html>
            <html>
            <head><title>Mirror Error</title></head>
            <body>
                <h1>🔴 Mirror Error</h1>
                <p>Could not fetch the target site.</p>
                <p>Error: ${err.message}</p>
            </body>
            </html>
        `, {
            status: 500,
            headers: { 'Content-Type': 'text/html' }
        });
    });
}