import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { createProxyMiddleware } from 'http-proxy-middleware';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const proxy = createProxyMiddleware({
  target: 'https://whisperbox.koyeb.app',
  changeOrigin: true,
  pathRewrite: { '^/api/proxy': '' },
  secure: true,
});

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    if (parsedUrl.pathname.startsWith('/api/proxy')) {
      proxy(req, res, (err) => {
        if (err) {
          console.error('Proxy error:', err);
          res.statusCode = 502;
          res.end('Proxy error');
        }
      });
    } else {
      handle(req, res, parsedUrl);
    }
  }).listen(3000, () => {
    console.log('> Ready on http://localhost:3000');
  });
});