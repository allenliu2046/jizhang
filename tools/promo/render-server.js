// 宣传视频渲染服务器：静态服务仓库根目录 + 接收 promo.html 逐帧上传
// node tools/promo/render-server.js [port] [outDir]
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.resolve(__dirname, '..', '..');
const port = Number(process.argv[2]) || 8301;
const outDir = process.argv[3] || path.join(os.tmpdir(), 'jz-promo-out');
const framesDir = path.join(outDir, 'frames');
fs.mkdirSync(framesDir, { recursive: true });
let done = false;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    if (req.method === 'POST' && p.startsWith('/frame/')) {
      const i = p.slice(7).replace(/[^0-9]/g, '');
      fs.writeFileSync(path.join(framesDir, 'f' + i + '.png'), await readBody(req));
      res.writeHead(200).end('ok');
      return;
    }
    if (req.method === 'POST' && p === '/audio') {
      fs.writeFileSync(path.join(outDir, 'sfx.wav'), await readBody(req));
      res.writeHead(200).end('ok');
      return;
    }
    if (req.method === 'POST' && p === '/reset') {
      for (const f of fs.readdirSync(framesDir)) fs.unlinkSync(path.join(framesDir, f));
      fs.rmSync(path.join(outDir, 'sfx.wav'), { force: true });
      done = false;
      res.writeHead(200).end('ok');
      return;
    }
    if (req.method === 'POST' && p === '/done') {
      done = true;
      res.writeHead(200).end('ok');
      return;
    }
    if (p === '/progress') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        outDir,
        frames: fs.readdirSync(framesDir).length,
        audio: fs.existsSync(path.join(outDir, 'sfx.wav')),
        done
      }));
      return;
    }
  } catch (e) {
    res.writeHead(500).end(String(e));
    return;
  }
  // 静态文件（同 tools/serve.js）
  let fp = p;
  if (fp.endsWith('/')) fp += 'index.html';
  const file = path.join(root, path.normalize(fp));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(buf);
  });
}).listen(port, '127.0.0.1', () => console.log('promo render server at http://127.0.0.1:' + port + '  out=' + outDir));
