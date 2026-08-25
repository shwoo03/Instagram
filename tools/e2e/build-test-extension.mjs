import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const BUILD_DIR = path.join(ROOT, 'tools/e2e/.build');
const FILES = [
  'manifest.json',
  'background.js',
  'accuracy-engine.js',
  'network-payload-parser.js',
  'debugger-capture.js',
  'main.js',
  'devtools.js',
  'devtools.html',
  'devtools-panel.html',
  'devtools-panel.css',
  'devtools-panel.js',
  'popup.html',
  'popup.css',
  'popup.js',
  'page-network-bridge.js'
];

function replaceFunctionSource(text, functionName, replacement) {
  const start = text.indexOf(`async function ${functionName}`);
  if (start === -1) throw new Error(`missing ${functionName}`);
  let depth = 0;
  let end = -1;
  for (let i = text.indexOf('{', start); i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) throw new Error(`could not locate ${functionName} end`);
  return `${text.slice(0, start)}${replacement}${text.slice(end)}`;
}

async function patchBackgroundForE2e() {
  const backgroundPath = path.join(BUILD_DIR, 'background.js');
  const source = await fs.readFile(backgroundPath, 'utf8');
  const replacement = `async function injectInstagramCollector(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["page-network-bridge.js"],
      world: "MAIN"
    });
  } catch (error) {
    console.log("[IG Comparator] page network bridge injection failed:", error?.message || error);
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["accuracy-engine.js", "main.js"]
  });
}`;
  await fs.writeFile(backgroundPath, replaceFunctionSource(source, 'injectInstagramCollector', replacement));
}

export async function buildTestExtension() {
  await fs.rm(BUILD_DIR, { recursive: true, force: true });
  await fs.mkdir(BUILD_DIR, { recursive: true });

  for (const file of FILES) {
    await fs.copyFile(path.join(ROOT, file), path.join(BUILD_DIR, file));
  }

  const manifestPath = path.join(BUILD_DIR, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.description = `[E2E TEST BUILD] ${manifest.description || ''}`.trim();
  manifest.host_permissions = ['http://127.0.0.1/*'];
  manifest.e2e_note = '배포 manifest는 불변. host_permissions는 액션 클릭 제스처 없이 chrome.scripting.executeScript를 fixture 페이지에 쓰기 위한 테스트 빌드 전용 권한.';
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await patchBackgroundForE2e();

  return BUILD_DIR;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const buildDir = await buildTestExtension();
  console.log(buildDir);
}
