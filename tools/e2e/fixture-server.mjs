import http from 'node:http';

export const FOLLOWERS = Array.from({ length: 36 }, (_, index) => `e2e_user_${String(index + 1).padStart(3, '0')}`);
export const FOLLOWING = Array.from({ length: 30 }, (_, index) => `e2e_user_${String(index + 13).padStart(3, '0')}`);
export const EXPECTED = {
  followers: FOLLOWERS.length,
  following: FOLLOWING.length,
  mutual: 24,
  followersOnly: 12,
  followingOnly: 6
};

function pageHtml({ displayedCountGap = 0, captureNetwork = false } = {}) {
  const displayedFollowers = FOLLOWERS.length + displayedCountGap;
  const displayedFollowing = FOLLOWING.length + displayedCountGap;
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>IG Comparator E2E Fixture</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 32px; }
    header { display: flex; gap: 20px; align-items: center; }
    a { color: #0958d9; text-decoration: none; }
    [role="dialog"] { position: fixed; inset: 40px auto auto 50%; transform: translateX(-50%); width: 420px; background: white; border: 1px solid #888; box-shadow: 0 8px 24px #0002; padding: 12px; }
    .list-box { height: 400px; overflow: auto; border: 1px solid #ccc; }
    .row { height: 36px; display: flex; align-items: center; padding: 0 12px; border-bottom: 1px solid #eee; }
    .actions { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    button { min-height: 32px; }
  </style>
</head>
<body>
  <main>
    <h1>fixtureprofile</h1>
    <header>
      <a href="/fixtureprofile/followers/" data-list="followers">팔로워 ${displayedFollowers}</a>
      <a href="/fixtureprofile/following/" data-list="following">팔로잉 ${displayedFollowing}</a>
    </header>
  </main>
  <script>
    const DATA = {
      followers: ${JSON.stringify(FOLLOWERS)},
      following: ${JSON.stringify(FOLLOWING)}
    };
    const PAGE_SIZE = 12;

    function openList(kind) {
      closeDialog(false);
      history.pushState({}, '', '/fixtureprofile/' + kind + '/');
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      dialog.dataset.kind = kind;
      dialog.innerHTML = '<div class="actions"><strong>' + (kind === 'followers' ? '팔로워' : '팔로잉') + ' 목록</strong><button aria-label="닫기" type="button">닫기</button></div><div class="list-box"></div>';
      document.body.appendChild(dialog);
      const listBox = dialog.querySelector('.list-box');
      let rendered = 0;
      function appendRows() {
        const users = DATA[kind];
        const next = users.slice(rendered, rendered + PAGE_SIZE);
        if (${captureNetwork}) {
          void fetch('/api/v1/friendships/123/' + kind + '/?offset=' + rendered).then((response) => response.text());
        }
        for (const username of next) {
          const row = document.createElement('div');
          row.className = 'row';
          row.innerHTML = '<a href="/' + username + '/">' + username + '</a>';
          listBox.appendChild(row);
        }
        rendered += next.length;
        if (new URLSearchParams(location.search).get('recycle') === '1') {
          while (listBox.children.length > PAGE_SIZE * 2) listBox.firstElementChild.remove();
        }
      }
      listBox.addEventListener('scroll', () => {
        if (listBox.scrollTop + listBox.clientHeight >= listBox.scrollHeight - 80) appendRows();
      });
      dialog.querySelector('button').addEventListener('click', () => closeDialog(true));
      appendRows();
    }

    function closeDialog(pushBack) {
      document.querySelectorAll('[role="dialog"]').forEach((dialog) => dialog.remove());
      if (pushBack) history.pushState({}, '', '/fixtureprofile/');
    }

    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[data-list]');
      if (!link) return;
      event.preventDefault();
      openList(link.dataset.list);
    });
  </script>
</body>
</html>`;
}

export async function startFixtureServer({ captureNetwork = false } = {}) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const mode = /\/api\/v1\/friendships\/123\/(followers|following)\//.exec(url.pathname)?.[1];
    if (captureNetwork && mode) {
      const users = mode === 'followers' ? FOLLOWERS : FOLLOWING;
      const offset = Number(url.searchParams.get('offset')) || 0;
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ users: users.slice(offset, offset + 12).map((username) => ({ username })), has_more: offset + 12 < users.length }));
      return;
    }
    if (url.pathname === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store'
    });
    res.end(pageHtml({
      displayedCountGap: Number(url.searchParams.get('display_gap') || 0),
      captureNetwork
    }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    server,
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}
