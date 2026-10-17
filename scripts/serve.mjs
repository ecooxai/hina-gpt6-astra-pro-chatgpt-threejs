import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(),port=Number(process.env.PORT||4177);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.glb':'model/gltf-binary','.csv':'text/csv','.zip':'application/zip'};
http.createServer((req,res)=>{try{let pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);if(pathname.endsWith('/'))pathname+='index.html';const p=path.resolve(root,'.'+pathname);if(!p.startsWith(root+path.sep)||pathname.includes('/.git')||pathname.includes('node_modules')){res.writeHead(403).end();return;}fs.stat(p,(err,stat)=>{if(err||!stat.isFile()){res.writeHead(404).end('Not found');return;}res.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});fs.createReadStream(p).pipe(res);});}catch{res.writeHead(400).end();}}).listen(port,'0.0.0.0',()=>console.log(`Hina studio listening on http://0.0.0.0:${port}`));

