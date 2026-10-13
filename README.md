# UG-LMS 特殊执行名单 · 原型

## 演示站（GitHub Pages）

**UG-LMS 特殊执行名单（Credit Application 页面高保真还原）：**

https://phosphorescent2018.github.io/UG-LMS-Special-List/

> 链接固定不变；每次提交 `main` 分支后由 GitHub Actions 自动重新构建部署，刷新即可看到最新版本。

Axhub Make 项目，用来承载 **UG-LMS 特殊执行名单** 需求的原型页面。当前包含一个原型：

| 原型 | 入口 | 说明 |
| --- | --- | --- |
| UG-LMS 特殊执行名单 | `?p=ug-lms-special-list` | UG LMS 运营后台 `Credit Application` 页面的高保真还原（1209×824 基准，与原始截图逐像素比对差异 1.00%） |

## 本地运行

```bash
npm install          # 或 pnpm install
npm run dev          # 启动 vite(51720) + Axhub Make 管理端(53817)
```

- Make 管理端：`http://localhost:53817/?projectId=<项目目录名>&p=ug-lms-special-list`
- 运行时页面：`http://localhost:51720/prototypes/ug-lms-special-list`
- 单文件预览：直接打开 `src/prototypes/ug-lms-special-list/` 还原产物（`page.html` + `static-style.css`）

## 原型说明

`src/prototypes/ug-lms-special-list/` 由 Axhub 导出包（`AI-Credit-Application-complete.zip`，
精确 DOM + computedStyle）重建：`page.html` 为页面结构，`static-style.css` 为精确样式，
`interaction.js` 负责侧边菜单展开/收起与页面切换，`lang.js` 负责中英文切换（中文取自 LMS 官方多语言字典）。

> **原型新增**：在「额度管理」下增加了二级菜单 **特殊执行名单**（`Special Execution List`），排在「额度 & 状态调整」之后。
> 点击进入后可维护名单：文件上传（覆盖，校验不通过整批拦截并给出失败明细；支持模板下载）/ 单条新增（含「一人一标签」与账户级必填校验）/ 关键词查询 / 移除与批次恢复（均二次确认）/ 分页。页内数据为前端内存模拟。
>
> 打开原型时**默认是中文 + 特殊执行名单页**（`entry-defaults.js`），进入后可自由切换语言与页面。

需求文档见 [`src/resources/UG-LMS-特殊执行名单-需求文档-v1.0.md`](src/resources/UG-LMS-特殊执行名单-需求文档-v1.0.md)。

> 字典里缺失的 5 条文案（`Credit Management` / `Loan Management` / `Application ID` /
> `Account holder Identity` / `Account FRI`），线上切中文同样显示英文；原型为可读性补了中文，
> 属于原型补充，详见 `.spec/spec.html` 的「中文词条来源说明」。

主规格见 `.spec/spec.html`（含还原方法、交互说明、已知限制）。

已知限制：

- 导出包只采集了单一视口，平板/手机断点未还原；
- 导出与路由未接入；名单查询、分页、增删改均为前端内存模拟；
- 菜单 hover 态未还原（导出包不含交互态样式）。

## 构建与部署

`.github/workflows/deploy-pages.yml`：push `main` 后安装依赖 → `vite build`（`ENTRY_KEY=prototypes/ug-lms-special-list`）
→ `scripts/export-static-preview.mjs` 导出 `static-preview/` → 发布到 GitHub Pages。

本地复现同一流程：

```bash
ENTRY_KEY=prototypes/ug-lms-special-list npx vite build
node scripts/export-static-preview.mjs ug-lms-special-list
```

## 目录

```text
src/prototypes/   原型页面
src/themes/       主题与设计规范
src/resources/    项目资料、文档和素材
rules/            项目工作规则
scripts/          构建与导出脚本
vite-plugins/     构建期插件
.axhub/make/      Axhub Make 管理端配置
```

## Git 自动推送（提交即发布）

仓库内置 post-commit 钩子：本地 `git commit` 成功后会自动推送到 `origin` 当前分支，并触发 GitHub Actions 重新构建部署演示站。

新克隆本仓库后执行一次启用：

```bash
git config core.hooksPath scripts/git-hooks
```

如果自动推送失败，提交仍保留在本地，按提示手动执行 `git push` 即可。
