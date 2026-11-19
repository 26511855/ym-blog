// embed.js — 视频外链识别：只接受从 URL 解析出的视频 id，再拼官方嵌入代码
// 铁律：用户提交的任何 <iframe>/<script> 都不会被透传，嵌入代码永远由这里生成。
import { esc } from './http.js';

// 支持：bilibili.com/video/BVxxx、b23.tv 短链不在此解析（需请求外站，发布时不做）、
// youtube.com/watch?v=、youtu.be/、youtube.com/shorts/
export function parseVideoUrl(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^BV[0-9A-Za-z]{10}$/.test(s)) return { platform: 'bilibili', id: s };
  // hostname 锚定（低9）：先解析 URL、域名必须精确命中白名单，再从路径/参数里提 ID；
  // 旧版子串匹配会把 evilbilibili.com 这类仿冒域名也当 B 站处理。
  let u;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); } catch { return null; }
  const host = u.hostname.toLowerCase();
  if (['www.bilibili.com', 'bilibili.com', 'm.bilibili.com', 'b23.tv'].includes(host)) {
    const m = (u.pathname + u.search).match(/BV[0-9A-Za-z]{10}/);
    if (m) return { platform: 'bilibili', id: m[0] };
    return null;
  }
  if (['www.youtube.com', 'youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(host)) {
    const v = u.searchParams.get('v');
    if (v && /^[0-9A-Za-z_-]{6,}$/.test(v)) return { platform: 'youtube', id: v };
    const m = u.pathname.match(/\/(?:embed|shorts)\/([0-9A-Za-z_-]{6,})/);
    if (m) return { platform: 'youtube', id: m[1] };
    return null;
  }
  if (host === 'youtu.be') {
    const m = u.pathname.match(/\/([0-9A-Za-z_-]{6,})/);
    if (m) return { platform: 'youtube', id: m[1] };
  }
  return null;
}

export function embedHtml({ platform, id }, title = '') {
  if (platform === 'bilibili') {
    const src = `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(id)}&page=1&high_quality=1`;
    const watch = `https://www.bilibili.com/video/${encodeURIComponent(id)}`;
    return `<div class="video-embed"><iframe src="${src}" title="${esc(title || 'Bilibili 视频（哔哩哔哩）')}" loading="lazy" allowfullscreen></iframe></div>`
      + `<p class="video-fallback"><a href="${watch}" rel="nofollow noopener" target="_blank">在 B 站打开原视频 ↗</a></p>`;
  }
  if (platform === 'youtube') {
    const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
    const watch = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
    return `<div class="video-embed"><iframe src="${src}" title="${esc(title || 'YouTube 视频')}" loading="lazy" allowfullscreen></iframe></div>`
      + `<p class="video-fallback"><a href="${watch}" rel="nofollow noopener" target="_blank">在 YouTube 打开原视频 ↗</a></p>`;
  }
  return '';
}

export function videoPageUrl({ platform, id }) {
  return platform === 'bilibili'
    ? `https://www.bilibili.com/video/${encodeURIComponent(id)}`
    : `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
}
