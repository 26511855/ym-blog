// test-friend-check-ssrf.mjs — 友链探活 SSRF 守卫定向测试
// 覆盖 Chief 审计 #8：checkOneLink 改走 safeFetch 后——
//   公网 200 → ok；直连内网/回环/元数据地址 → fail 且根本不发请求；
//   公网 302 跳内网 → fail 且第二跳不发；跳转超过上限 → fail。
// 用法：node scripts/test-friend-check-ssrf.mjs；任一失败即 exit 1。
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE friend_links (
  id INTEGER PRIMARY KEY, name TEXT, url TEXT, enabled INTEGER DEFAULT 1,
  health TEXT, fail_streak INTEGER DEFAULT 0, last_checked_at INTEGER
);`);
const env = {
  DB: {
    prepare(sql) {
      const stmt = db.prepare(sql);
      let params = [];
      const bound = {
        bind(...p) { params = p; return bound; },
        async run() { const r = stmt.run(...params); return { success: true, meta: { changes: r.changes } }; },
        async first() { return stmt.get(...params) ?? null; },
        async all() { return { results: stmt.all(...params) }; },
      };
      return bound;
    },
  },
};

const fetched = [];
globalThis.fetch = async (url) => {
  const u = String(url);
  fetched.push(u);
  if (u.startsWith('https://good.example.test/')) return new Response('ok', { status: 200 });
  if (u.startsWith('https://redir.example.test/')) {
    return new Response('', { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } });
  }
  if (u.startsWith('https://loop.example.test/')) {
    const n = Number(new URL(u).searchParams.get('n') || 0);
    return new Response('', { status: 302, headers: { location: `https://loop.example.test/?n=${n + 1}` } });
  }
  throw new Error('test: unexpected fetch ' + u);
};

const { checkOneLink } = await import('../functions/_handlers/tasks-api.js');

let pass = 0, failN = 0;
const chk = (name, cond, extra = '') => { if (cond) { pass++; console.log('PASS', name); } else { failN++; console.log('FAIL', name, extra); } };

let seq = 0;
async function probe(url) {
  const id = ++seq;
  db.prepare('INSERT INTO friend_links (id, name, url, fail_streak) VALUES (?, ?, ?, 0)').run(id, 't' + id, url);
  fetched.length = 0;
  const r = await checkOneLink(env, { id, url, fail_streak: 0 });
  const row = db.prepare('SELECT health, fail_streak FROM friend_links WHERE id = ?').get(id);
  return { r, row, fetched: [...fetched] };
}

{
  const { r, row } = await probe('https://good.example.test/');
  chk('公网 200 → ok 且 health 回写 ok', r === 'ok' && row.health === 'ok' && row.fail_streak === 0, `r=${r} ${JSON.stringify(row)}`);
}
{
  const { r, row, fetched } = await probe('http://127.0.0.1:8080/admin');
  chk('直连 127.0.0.1 → fail', r === 'fail' && row.health === 'fail');
  chk('直连 127.0.0.1 → 根本不发请求', fetched.length === 0, JSON.stringify(fetched));
}
{
  const { r, fetched } = await probe('http://[::1]/');
  chk('直连 [::1] → fail 且不发请求', r === 'fail' && fetched.length === 0, JSON.stringify(fetched));
}
{
  const { r, fetched } = await probe('https://redir.example.test/');
  chk('302 跳 169.254.169.254 → fail', r === 'fail');
  chk('第二跳元数据地址从未被请求', fetched.length === 1 && !fetched.some(u => u.includes('169.254')), JSON.stringify(fetched));
}
{
  const { r, fetched } = await probe('https://loop.example.test/?n=0');
  chk('无限跳转 → fail（超上限）', r === 'fail');
  chk('跳转次数被上限截断（≤6 次请求）', fetched.length > 0 && fetched.length <= 6, `fetched=${fetched.length}`);
}

console.log(`\nTOTAL pass=${pass} fail=${failN}`);
process.exit(failN ? 1 : 0);
