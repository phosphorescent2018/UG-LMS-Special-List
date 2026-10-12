# 项目上下文（给接手 AI 的快速说明）

> 其他 AI / 协作者请先读本文件 + `AGENTS.md`（工作规则）；单一原型的主规格见
> `src/prototypes/ug-lms-special-list/.spec/spec.html`（事实真值）。

## 这是什么

**UG-LMS 特殊执行名单** 需求的原型项目（Axhub Make 项目）。当前只有一个原型：
UG LMS 运营后台 `Credit Application` 页面的高保真还原，作为该需求的原型承载页。

## 如何运行

- 根目录执行 `npm run dev`（启动 vite 51720 + Make 管理端 53817）
- 本地预览：`http://localhost:53817/?projectId=ug-lms-special-list&p=ug-lms-special-list`
- 演示站：https://phosphorescent2018.github.io/UG-LMS-Special-List/ ，每次 push main 自动部署

## 当前范围

| 模块 | 位置 | 说明 |
| --- | --- | --- |
| 页面还原 | `src/prototypes/ug-lms-special-list/page.html` + `static-style.css` | 由 Axhub 导出包逐节点重建，视口基准 1209×824 |
| 侧边菜单展开/收起 | `menu.js` | 补全了导出时处于收起状态的 4 个二级菜单 |
| 中英切换 | `lang.js` | 中文取自 LMS 官方多语言字典 `sys_mutil_language`（`system_code=lms`）的 zh_CN 词条 |

## 关键口径

- 还原产物以导出包的 `screenshot.png` 为视觉真值；同视口逐像素比对，平均绝对差 1.49/765、差异像素 1.00%
  （其中约 0.85% 来自 macOS overlay 横向滚动条，0.08% 来自新增的语言切换控件）。
- 字典里没有中文的 5 条词条（`Credit Management` / `Loan Management` / `Application ID` /
  `Account holder Identity` / `Account FRI`），线上切中文同样显示英文；原型为了可读性补了中文，
  属于**原型补充**，不是官方译文，详见 `.spec/spec.html` 的「中文词条来源说明」。
- 页面按固定宽度还原，窄屏出现横向滚动；平板/手机断点未还原（导出包只有单视口计算样式）。

## 数据来源

- 页面导出包：`AI-Credit-Application-complete.zip`（Axhub Make 导出，mode=full）
- 还原脚本：UG 工作区 `Documents/UG/credit-application-clone/work/{build.py,export_make.py}`
- 官方中文词条：`mtn-lms/sql/init/DML/tenant_backend_table_sys_mutil_language.sql`
