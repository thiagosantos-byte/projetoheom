import app from '../apps/api/dist/demo-server.js';

// Single catch-all Function: all /api/* requests reach the same Express app.
// The app keeps the original /api prefix expected by its existing route table.
export default function handler(req: any, res: any) {
  if (req.url && !req.url.startsWith('/api/')) {
    const queryIndex = req.url.indexOf('?');
    const pathname = queryIndex >= 0 ? req.url.slice(0, queryIndex) : req.url;
    const query = queryIndex >= 0 ? req.url.slice(queryIndex) : '';
    req.url = `/api${pathname.startsWith('/') ? pathname : `/${pathname}`}${query}`;
  }
  return app(req, res);
}
