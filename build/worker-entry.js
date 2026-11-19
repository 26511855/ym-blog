// build/worker-entry.js — 「_worker.js 高级模式包」的构建入口（本文件不要直接部署）
//
// 为什么需要它：Cloudflare 控制台的「上传资产 / 拖拽」部署**不会编译 functions/
// 文件夹**（官方文档明示），而本仓的全部访客页与接口都靠根目录的 catch-all
// 函数出，普通部署包直传上去连首页都是 404。官方确认根目录的单个
// `_worker.js` 在拖拽上传下受支持，所以打包时用 esbuild 把原总路由合成一个
// _worker.js，原源码一字不改，逻辑还是同一套。
//
// 构建命令（release-pack 工作流里执行，本地复现也是这一条）：
//   esbuild build/worker-entry.js --bundle --format=esm \
//     --platform=neutral --target=es2022 --external:node:* --outfile=_worker.js
// （--external:node:* 是本仓专属：密码哈希走 node:crypto / node:module，
// 由站点的 nodejs_compat 运行时提供，打包时不能内嵌。）
//
// 路由语义与 _routes.json 对齐：/assets/* 与 /admin/* 是纯静态文件，原版靠
// _routes.json 把它们排除出函数调用、由静态层直出；高级模式下 _routes.json
// 不再生效，故本入口对这两类前缀直接走 env.ASSETS.fetch，其余全部交给原
// 总路由 handleRequest（裸 /admin 的 301 跳转也在原总路由里，不用重写）。
// _headers：高级模式下平台不再应用 _headers。原版 _headers 只有一条：
// /admin/* 的 Cache-Control: no-cache（只管静态层；函数响应由总路由自己
// 补安全头，实测不带这条）。故本入口只给 /admin/* 的资产响应补这条头。

import { handleRequest } from '../functions/[[path]].js';

async function serveAsset(request, env, url) {
  const resp = await env.ASSETS.fetch(request);
  if (url.pathname.startsWith('/admin/')) {
    const headers = new Headers(resp.headers);
    headers.set('Cache-Control', 'no-cache');
    // 静态层安全头与 _headers 对齐（中11）：高级模式下 _headers 不生效，靠这里补
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
  }
  return resp;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/admin/')) {
      return serveAsset(request, env, url);
    }
    return handleRequest(request, env);
  },
};
