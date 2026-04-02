import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { readFile, stat, readdir } from 'node:fs/promises';
import { join, extname, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Console } from 'node:console';
import process from 'node:process';
import { setTimeout, clearTimeout } from 'node:timers';
import { gzipSync, brotliCompressSync, constants as zlibConstants } from 'node:zlib';

const console = new Console({ stdout: process.stdout, stderr: process.stderr });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const requestedBaseDir = process.argv[2] ? String(process.argv[2]).trim() : '';
const baseDir = requestedBaseDir ? join(__dirname, requestedBaseDir) : __dirname;
const isDevMode = requestedBaseDir === 'src';
const isTestsMode = requestedBaseDir === 'tests';

const PORT = Number(process.env.PORT || 3000);

const devClients = new Set();
const devWatchers = [];
const watchedDirectories = new Set();
let reloadDebounceTimer = null;
let lastChangedFile = '';
let galleryIndexDebounceTimer = null;
let galleryIndexBuildInProgress = false;
let galleryIndexBuildPending = false;

function normalizeDevRelativePath(filePath) {
    const absolutePath = resolve(String(filePath || ''));
    const relativePath = relative(baseDir, absolutePath).replace(/\\/g, '/');
    if (!relativePath || relativePath.startsWith('..')) return '';
    return relativePath;
}

function shouldRefreshGalleryIndexForChange(filePath) {
    if (!isDevMode || !filePath) return false;
    const relativePath = normalizeDevRelativePath(filePath);
    if (!relativePath) return false;

    if (/^[a-z0-9-]+\.json$/i.test(relativePath) && relativePath !== 'config.json') return false;
    if (relativePath === 'data.md' || relativePath === 'config.json') return true;
    if (!relativePath.startsWith('assets/')) return false;

    return /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(relativePath);
}

function runGalleryIndexBuild(reason = 'change') {
    if (!isDevMode) return;
    if (galleryIndexBuildInProgress) {
        galleryIndexBuildPending = true;
        return;
    }

    galleryIndexBuildInProgress = true;
    const scriptPath = join(__dirname, 'scripts', 'build-gallery-index.mjs');
    const child = spawn(process.execPath, [scriptPath], {
        cwd: __dirname,
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
    });

    child.on('close', (code) => {
        galleryIndexBuildInProgress = false;
        if (code === 0) {
            const summary = (stdout || '').trim();
            if (summary) {
                console.log(`🖼️ [gallery-index:${reason}] ${summary}`);
            }
        } else {
            const errorOutput = (stderr || stdout || '').trim();
            console.error(`⚠️ [gallery-index:${reason}] generation failed (exit ${code})`);
            if (errorOutput) {
                console.error(errorOutput);
            }
        }

        if (galleryIndexBuildPending) {
            galleryIndexBuildPending = false;
            runGalleryIndexBuild('pending');
        }
    });
}

function scheduleGalleryIndexBuild(changedFile = '') {
    if (!shouldRefreshGalleryIndexForChange(changedFile)) return;

    clearTimeout(galleryIndexDebounceTimer);
    galleryIndexDebounceTimer = setTimeout(() => {
        runGalleryIndexBuild('watch');
    }, 200);
}

function broadcastDevReload() {
    for (const client of devClients) {
        try {
            client.write('event: reload\n');
            client.write('data: {"reason":"src-change"}\n\n');
        } catch {
            devClients.delete(client);
        }
    }
}

function scheduleDevReloadBroadcast(changedFile = '') {
    if (!isDevMode) return;
    if (changedFile) {
        lastChangedFile = String(changedFile);
        scheduleGalleryIndexBuild(lastChangedFile);
    }
    clearTimeout(reloadDebounceTimer);
    reloadDebounceTimer = setTimeout(() => {
        const fileLabel = lastChangedFile ? ` ${lastChangedFile}` : ' unknown-file';
        console.log(`🔄 [dev-reload] source changed:${fileLabel}`);
        console.log(`📡 [dev-reload] broadcasting reload to ${devClients.size} client(s)`);
        broadcastDevReload();
    }, 120);
}

function addDevWatcher(directoryPath) {
    if (watchedDirectories.has(directoryPath)) return;

    const watcher = watch(directoryPath, (_eventType, filename) => {
        if (!filename) return;
        scheduleDevReloadBroadcast(join(directoryPath, String(filename)));
        if (_eventType === 'rename') {
            const nextPath = join(directoryPath, String(filename));
            stat(nextPath)
                .then((stats) => {
                    if (stats.isDirectory()) {
                        addDevWatcher(nextPath);
                    }
                })
                .catch(() => {
                    
                });
        }
    });

    watchedDirectories.add(directoryPath);
    devWatchers.push(watcher);
}

async function watchDirectoryTree(rootDirectoryPath) {
    addDevWatcher(rootDirectoryPath);
    const entries = await readdir(rootDirectoryPath, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        await watchDirectoryTree(join(rootDirectoryPath, entry.name));
    }
}

if (isDevMode) {
    runGalleryIndexBuild('startup');
    try {
        watch(baseDir, { recursive: true }, (_eventType, filename) => {
            if (!filename) return;
            scheduleDevReloadBroadcast(join(baseDir, String(filename)));
        });
        console.log('Dev auto-reload watcher: recursive mode enabled');
    } catch (error) {
        console.log('Dev auto-reload watcher: recursive mode unavailable, using directory-tree fallback');
        watchDirectoryTree(baseDir).catch((treeError) => {
            console.error(`⚠️ Dev file watcher unavailable: ${treeError?.message || treeError}`);
        });
    }
}

const compressibleExtensions = new Set(['.html', '.css', '.js', '.mjs', '.json', '.xml', '.md', '.svg']);

function compressResponse(content, acceptEncoding) {
    const enc = String(acceptEncoding || '');
    if (enc.includes('br')) {
        return {
            data: brotliCompressSync(content, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 } }),
            encoding: 'br',
        };
    }
    if (enc.includes('gzip')) {
        return { data: gzipSync(content, { level: 6 }), encoding: 'gzip' };
    }
    return { data: content, encoding: null };
}

const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.json': 'application/json',
    '.xml': 'application/rss+xml; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const vendorAssetMap = new Map([
    ['/vendor/bootstrap/bootstrap.min.css', 'node_modules/bootstrap/dist/css/bootstrap.min.css'],
    ['/vendor/bootstrap/bootstrap.bundle.min.js', 'node_modules/bootstrap/dist/js/bootstrap.bundle.min.js'],
    ['/vendor/datatables/dataTables.js', 'node_modules/datatables.net/js/dataTables.js'],
    ['/vendor/datatables/dataTables.bootstrap5.css', 'node_modules/datatables.net-bs5/css/dataTables.bootstrap5.css'],
    ['/vendor/datatables/dataTables.bootstrap5.js', 'node_modules/datatables.net-bs5/js/dataTables.bootstrap5.js'],
    ['/vendor/jquery/jquery.min.js', 'node_modules/jquery/dist/jquery.min.js'],
    ['/vendor/moment/moment.min.js', 'node_modules/moment/min/moment.min.js'],
]);

function buildCspHeaderValue(requestPath) {
    const isTestsRoute = isTestsMode || requestPath.startsWith('/tests/');
    const osmImgSrc = "https://*.tile.openstreetmap.org";

    if (isDevMode) {
        return `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'; style-src-attr 'unsafe-inline'; font-src 'self'; img-src 'self' data: ${osmImgSrc}; frame-src 'self'; report-uri /csp-report`;
    }

    if (isTestsRoute) {
        return `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; style-src-attr 'unsafe-inline'; font-src 'self'; img-src 'self' data: ${osmImgSrc}; frame-src 'self'; report-uri /csp-report`;
    }

    // Production: strict CSP — no 'unsafe-inline' for styles/scripts
    // Scripts allowed by specific hash (build-time bundle). Images allow data: and OSM tiles.
    return `default-src 'self'; script-src 'self' 'sha256-BPfo8AlqKcpHrHgw86iS+3zmeiEyidPBzCRVDfmCeaM='; style-src 'self'; font-src 'self'; img-src 'self' data: ${osmImgSrc}; frame-src 'self'; report-uri /csp-report`;
}

function resolveFilePathForRequest(filePath) {
    if (
        isTestsMode
        && (
            filePath.startsWith('/scripts/')
            || filePath.startsWith('/docs/')
            || filePath === '/README.md'
        )
    ) {
        return join(__dirname, filePath);
    }

    return join(baseDir, filePath);
}

function buildCacheControlHeader(ext, requestPath) {
    if (isDevMode || isTestsMode) {
        return 'no-cache';
    }

    if (requestPath.endsWith('.html') || ext === '.json' || ext === '.xml' || ext === '.md') {
        return 'public, max-age=300, stale-while-revalidate=300';
    }

    return 'public, max-age=31536000, immutable';
}

const server = createServer(async (req, res) => {
    const requestPath = String(req.url || '/').split('?')[0];

    if (req.method === 'GET' && requestPath === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (isDevMode && req.method === 'GET' && requestPath === '/__dev_events') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        });
        res.write('\n');
        devClients.add(res);

        req.on('close', () => {
            devClients.delete(res);
            console.log(`🔌 [dev-reload] client disconnected (${devClients.size} active)`);
        });
        console.log(`🔌 [dev-reload] client connected (${devClients.size} active)`);
        return;
    }

    if (isDevMode && req.method === 'GET' && requestPath === '/__dev_reload.js') {
        const script = `(() => {
  if (!window.EventSource) return;
  const events = new EventSource('/__dev_events');
  events.addEventListener('reload', () => {
    window.location.reload();
  });
})();\n`;
        res.writeHead(200, {
            'Content-Type': 'text/javascript; charset=utf-8',
            'Cache-Control': 'no-cache',
        });
        res.end(script);
        return;
    }

    
    if (req.method === 'POST' && requestPath === '/csp-report') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                
                const data = JSON.parse(body);
                const report = data['csp-report'] || data;
                
                
                const sourceFile = report['source-file'] || '';
                const blockedUri = report['blocked-uri'] || '';
                
                
                if (sourceFile.includes('moz-extension') || 
                    sourceFile.includes('chrome-extension') ||
                    sourceFile.includes('sandbox eval code') ||
                    sourceFile.includes('extension:') ||
                    blockedUri.includes('extension:')) {
                    
                    res.writeHead(204);
                    res.end();
                    return;
                }
                
                
                if (report['document-uri'] || report['violated-directive']) {
                    console.error('\n❌ CSP Violation Detected:');
                    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    if (report['document-uri']) {
                        console.error(`📋 Document URI: ${report['document-uri']}`);
                    }
                    if (report['blocked-uri']) {
                        console.error(`🚫 Blocked URI: ${report['blocked-uri']}`);
                    }
                    if (report['violated-directive']) {
                        console.error(`⚠️  Violation Type: ${report['violated-directive']}`);
                    }
                    if (report['original-policy']) {
                        console.error(`📊 Original Policy: ${report['original-policy']}`);
                    }
                    if (report['source-file']) {
                        console.error(`📄 Source File: ${report['source-file']}:${report['line-number']}`);
                    }
                    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
                }
            } catch { /* empty */ }
        });
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === 'GET' && requestPath.startsWith('/leaflet/')) {
        try {
            const leafletSubPath = requestPath.slice('/leaflet/'.length);
            const normalizedSubPath = leafletSubPath.replace(/\.\.\//g, '');
            const leafletDistDir = resolve(join(__dirname, 'node_modules/leaflet/dist'));
            const leafletFile = resolve(join(leafletDistDir, normalizedSubPath));
            
            if (!leafletFile.startsWith(leafletDistDir)) {
                throw new Error('Path traversal not allowed');
            }
            
            const leafletContent = await readFile(leafletFile);
            const ext = extname(leafletFile);
            const contentType = mimeTypes[ext] || 'application/octet-stream';
            
            res.writeHead(200, {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=31536000, immutable',
            });
            res.end(leafletContent);
            return;
        } catch (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
    }

    if (req.method === 'GET' && requestPath.startsWith('/vendor/')) {
        const vendorAssetRelativePath = vendorAssetMap.get(requestPath);

        if (!vendorAssetRelativePath) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }

        try {
            const fullVendorPath = resolve(join(__dirname, vendorAssetRelativePath));
            const stats = await stat(fullVendorPath);
            const content = await readFile(fullVendorPath);
            const ext = extname(fullVendorPath);

            res.writeHead(200, {
                'Content-Type': mimeTypes[ext] || 'application/octet-stream',
                ETag: `W/"${stats.size}-${Math.trunc(stats.mtimeMs).toString(16)}"`,
                'Last-Modified': stats.mtime.toUTCString(),
                'Cache-Control': buildCacheControlHeader(ext, requestPath),
            });
            res.end(content);
            return;
        } catch {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }
    }

    // Security headers (mimic production): CSP + Permissions-Policy + common security headers
    res.setHeader('Content-Security-Policy', buildCspHeaderValue(requestPath));
    res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    // HSTS only when not in dev/tests (assume production uses HTTPS)
    if (!isDevMode && !isTestsMode) {
        res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    }
    try {
        let filePath = requestPath === '/' ? '/index.html' : requestPath;
        
        
        filePath = filePath.split('?')[0];
        
        const fullPath = resolveFilePathForRequest(filePath);
        
        
        const stats = await stat(fullPath);
        
        if (stats.isDirectory()) {
            
            const files = await readdir(fullPath);
            
            let html = `<!DOCTYPE html>
<html>
<head><title>Index of ${filePath}</title></head>
<body>
<h1>Index of ${filePath}</h1>
<ul>`;
            
            for (const file of files) {
                const fileStats = await stat(join(fullPath, file));
                const mtime = fileStats.mtime.toISOString();
                html += `<li><a href="${filePath === '/' ? '' : filePath}/${file}">${file}</a> - ${mtime}</li>`;
            }
            
            html += `</ul></body></html>`;
            
            res.writeHead(200, {
                'Content-Type': 'text/html',
                'Cache-Control': 'no-cache'
            });
            res.end(html);
            return;
        }
        
        
        const content = await readFile(fullPath);
        const ext = extname(fullPath);
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        const cacheControl = buildCacheControlHeader(ext, requestPath);
        const eTag = `W/"${stats.size}-${Math.trunc(stats.mtimeMs).toString(16)}"`;
        const ifNoneMatch = req.headers['if-none-match'];
        const ifModifiedSince = req.headers['if-modified-since'];

        if (ifNoneMatch === eTag) {
            res.writeHead(304, {
                ETag: eTag,
                'Cache-Control': cacheControl,
                'Last-Modified': stats.mtime.toUTCString(),
            });
            res.end();
            return;
        }

        if (ifModifiedSince) {
            const sinceTs = Date.parse(String(ifModifiedSince));
            if (Number.isFinite(sinceTs) && Math.trunc(stats.mtimeMs) <= Math.trunc(sinceTs)) {
                res.writeHead(304, {
                    ETag: eTag,
                    'Cache-Control': cacheControl,
                    'Last-Modified': stats.mtime.toUTCString(),
                });
                res.end();
                return;
            }
        }

        let responseContent = content;
        if (isDevMode && ext === '.html') {
            const html = content.toString('utf8');
            const clientScriptTag = '<script src="/__dev_reload.js"></script>';
            const injected = html.includes('</body>')
                ? html.replace('</body>', `${clientScriptTag}\n</body>`)
                : `${html}\n${clientScriptTag}\n`;
            responseContent = Buffer.from(injected, 'utf8');
        }
        
        
        const responseHeaders = {
            'Content-Type': contentType,
            ETag: eTag,
            'Last-Modified': stats.mtime.toUTCString(),
            'Cache-Control': cacheControl,
        };

        if (compressibleExtensions.has(ext)) {
            const compressed = compressResponse(responseContent, req.headers['accept-encoding']);
            if (compressed.encoding) {
                responseContent = compressed.data;
                responseHeaders['Content-Encoding'] = compressed.encoding;
                responseHeaders['Vary'] = 'Accept-Encoding';
            }
        }

        res.writeHead(200, responseHeaders);
        res.end(responseContent);
        
    } catch (error) {
        if (error.code === 'ENOENT') {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
        } else {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('500 Internal Server Error');
        }
    }
});

server.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT} (base: ${baseDir})`);
    if (isDevMode) {
        console.log('Live reload is active for src/ changes (including json/md).');
    }
});
