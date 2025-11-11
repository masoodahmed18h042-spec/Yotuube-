
// server.js
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { spawn } from 'child_process';
import process from 'process';

const app = express();
app.use(helmet());
app.use(express.json());

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';
app.use(cors({ origin: FRONTEND_ORIGIN }));

const API_KEY = process.env.API_KEY || '';

function requireApiKey(req, res, next) {
  if (!API_KEY) return next();
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (key === API_KEY) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

app.post('/api/convert', requireApiKey, (req, res) => {
  const { videoUrl, format } = req.body || {};
  if (!videoUrl) return res.status(400).json({ error: 'Missing videoUrl' });
  try { new URL(videoUrl); } catch (e) { return res.status(400).json({ error: 'Invalid URL' }); }

  const proc = spawn('yt-dlp', ['-J', videoUrl], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', d => out += d);
  proc.stderr.on('data', d => err += d);

  proc.on('close', code => {
    if (code !== 0) return res.status(500).json({ error: 'yt-dlp error', details: err.slice(0,300) });
    let info;
    try { info = JSON.parse(out); } catch (e) { return res.status(500).json({ error: 'parse error' }); }

    const formats = (info.formats || []).filter(f => {
      if (format === 'mp3') return f.acodec && !f.vcodec;
      return f.vcodec && f.ext;
    }).map(f => ({
      itag: f.format_id,
      ext: f.ext,
      resolution: f.format_note || (f.height ? `${f.height}p` : f.quality || ''),
      filesize: f.filesize ?? null,
      download_endpoint: `/api/download?videoUrl=${encodeURIComponent(videoUrl)}&formatId=${encodeURIComponent(f.format_id)}`
    }));

    res.json({
      title: info.title,
      thumbnail: (info.thumbnails && info.thumbnails[0] && info.thumbnails[0].url) || null,
      duration: info.duration,
      formats
    });
  });
});

app.get('/api/download', requireApiKey, (req, res) => {
  const videoUrl = req.query.videoUrl;
  const formatId = req.query.formatId;
  if (!videoUrl || !formatId) return res.status(400).json({ error: 'Missing params' });

  try { new URL(videoUrl); } catch (e) { return res.status(400).json({ error: 'Invalid videoUrl' }); }

  res.setHeader('Content-Disposition', `attachment; filename="video.${formatId}.${Date.now()}"`);
  const args = ['-f', formatId, '-o', '-', videoUrl];
  const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });

  proc.stdout.on('data', chunk => res.write(chunk));
  proc.stderr.on('data', d => {/* optional server-side logging */});
  proc.on('close', () => res.end());

  req.on('close', () => { if (!proc.killed) proc.kill('SIGKILL'); });
});

app.get('/health', (req,res)=> res.json({ ok:true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log(`listening ${PORT}`));
