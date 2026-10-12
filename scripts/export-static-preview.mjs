/**
 * 导出单个原型入口为自包含静态演示页（GitHub Pages 部署用）。
 *
 * 用法：node scripts/export-static-preview.mjs [entryKey]
 * 默认 entryKey = ug-lms-special-list
 *
 * 输出目录：static-preview/
 *  - index.html：自包含入口（相对路径，任意子路径部署均可用）
 *  - <entryKey>-<version>.js：Vite IIFE 构建产物（文件名携带 git 短提交号，保证每次部署资源 URL 唯一，绕过 CDN 忽略 query 的缓存问题）
 *  - vendor/react.production.min.js / react-dom.production.min.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entryKey = process.argv[2] || 'ug-lms-special-list';
const jsFile = path.join(root, 'dist', 'prototypes', `${entryKey}.js`);

if (!fs.existsSync(jsFile)) {
    console.error(`未找到构建产物：${jsFile}\n请先执行 npm run build`);
    process.exit(1);
}

const reactUmd = path.join(root, 'node_modules', 'react', 'umd', 'react.production.min.js');
const reactDomUmd = path.join(root, 'node_modules', 'react-dom', 'umd', 'react-dom.production.min.js');
if (!fs.existsSync(reactUmd) || !fs.existsSync(reactDomUmd)) {
    console.error('未找到 React / ReactDOM UMD 文件，请确认依赖已安装');
    process.exit(1);
}

// 部署版本号：取当前 git 短提交号，作为静态资源缓存失效标识；取不到时回退为时间戳。
function getDeployVersion() {
    try {
        const sha = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
        if (sha) return sha;
    } catch {
        // ignore
    }
    return String(Date.now());
}
const version = getDeployVersion();
const entryJsName = `${entryKey}-${version}.js`;

const outDir = path.resolve(root, 'static-preview');
if (path.dirname(outDir) !== root || path.basename(outDir) !== 'static-preview') {
    console.error('输出目录校验失败，终止导出');
    process.exit(1);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'vendor'), { recursive: true });
fs.copyFileSync(jsFile, path.join(outDir, entryJsName));
fs.copyFileSync(reactUmd, path.join(outDir, 'vendor', 'react.production.min.js'));
fs.copyFileSync(reactDomUmd, path.join(outDir, 'vendor', 'react-dom.production.min.js'));

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Cache-Control" content="no-store" />
  <meta http-equiv="Pragma" content="no-cache" />
  <meta http-equiv="Expires" content="0" />
  <title>UG-LMS 特殊执行名单 - 原型演示</title>
</head>
<body>
  <div id="root"></div>
  <script src="./vendor/react.production.min.js"></script>
  <script src="./vendor/react-dom.production.min.js"></script>
  <script>
    window.__AXHUB_DEFINE_COMPONENT__ = function (component) {
      var root = document.getElementById('root');
      ReactDOM.createRoot(root).render(React.createElement(component));
    };
  </script>
  <script src="./${entryJsName}"></script>
</body>
</html>
`;

fs.writeFileSync(path.join(outDir, 'index.html'), html);
console.log(`静态演示页已导出：${outDir}（${entryJsName}）`);
