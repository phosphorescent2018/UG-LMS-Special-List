---
name: screenshot-to-prototype
description: Use only when 用户明确要求把本地截图、设计稿或高保真界面图还原成 Axhub Make client 可运行原型；或显式调用 $screenshot-to-prototype。仅提供图片作为素材、参考图、需求图或风格上下文时不要使用。
---

# Screenshot To Prototype

用本地截图还原可运行原型。先在 HTML 主规格中完成固定 viewport 下的 1:1 绝对定位视觉稿，提交用户评审并等待明确确认；确认后才能转换为 React。效果优先，评审信息集中在主规格，正文使用中文并保持简洁。

## 适用范围

- 只处理用户明确要求还原的本地截图或设计稿。普通图片素材、风格参考、URL 克隆和主题提取不触发本技能。
- 获取源图本地路径；聊天附件先落到本地。源图本身就是视觉依据，不再额外要求选择主题或创建设计规范。
- 需要生成、编辑或派生位图素材时，使用 `ui-image-generation`；工具选择、配置读取和回退规则全部遵循该技能。截图还原只补充本地源图、bbox、裁切、修复和素材分流约束。
- 所有素材提取、修复、高清化、设计分析都必须把用户本地图片路径作为参考图传入，不能只用文字描述生成素材。
- 截图优先使用 Axhub Preview MCP 的 `preview_capture`；不可用时使用现有浏览器截图能力。

## 目录

- 主规格：`src/prototypes/<slug>/.spec/spec.html`
- 还原映射：`src/prototypes/<slug>/.spec/reconstruction/reconstruction-manifest.json`
- 规格样式：`src/prototypes/<slug>/.spec/reconstruction/tailwind.css`
- 成果截图：`src/prototypes/<slug>/.spec/reconstruction/visual-check/`
- 最终素材：`src/prototypes/<slug>/assets/`
- 临时数据：`.local/screenshot-to-prototype/<slug>/`
- 生成历史：实际二次生图时复用 `src/prototypes/<slug>/.spec/generation-artifacts.json`

源图摘要、候选清单、候选切图、审计报告和中间指标都放在 `.local/`。

## 使用主规格

- 遵循 `rules/requirements-alignment-guide.md`。已有 `.spec/spec.html` 时直接扩展；没有时从通用 HTML 模板创建。不要修改通用规格模板。
- 第一阶段在规格中展示源图信息、绝对定位视觉稿、拟采用素材及用途；主评审区左侧展示完整视觉稿，右侧展示素材与说明，成果对比把原图与 HTML 视觉稿截图左右并排；React 完成后再补充真实运行截图。
- 素材评审区逐项使用相同预览框，左侧展示源图 bbox 裁切，右侧依次展示所有实际候选并标记最终采用结果，禁止两侧引用同一结果；CLI 与图片生成两种方案成功产出的图片都必须进入主规格。透明素材使用棋盘格背景，并标注名称或 ID、用途和输出尺寸；图片和 SVG 必须实际显示，HTML/CSS 表示方式应在视觉稿中呈现。
- 视觉稿舞台使用 `position: relative` 和 `overflow: hidden`，元素绝对定位并保留稳定的 `data-reconstruction-id`。仅捕获模式保持源图 viewport 的 1:1 尺寸；评审模式按可用高度等比缩放完整视觉稿，使其完整落在窗口内。
- HTML 主规格是第一阶段独立交付物。完成或实质更新后，提供完整 Make 服务规格评审链接并结束当前回合。
- 用户提出意见时，只更新同一份主规格、重新截图并再次发送链接。只有用户明确确认当前 HTML 主规格后，才能创建或修改 React 原型文件，例如 `index.tsx`、原型组件和运行时样式，并进入 React 实现。

## 工作步骤

1. 读取源图、现有规格、相关原型与素材。预处理结果写入本地临时目录：

```bash
node .agents/skills/screenshot-to-prototype/scripts/prepare-reconstruction-source.mjs \
  --input <source.png> \
  --output .local/screenshot-to-prototype/<slug>/source-summary.json
```

2. 先让图片 AI 基于源图返回完整素材矩阵和清单，覆盖所有独立非文本视觉元素，包括图标、Logo、照片、插画、纹理和装饰图形，并逐项给出 ID 与源图 bbox；再按 UI 职责和视觉复杂度选择表示方式：信息与交互结构用 HTML/CSS，界面图形用 SVG，内容媒体和 HTML/CSS 难快速稳定还原的视觉用位图，并为位图标记 `preserve`、`existing-alpha`、`known-key` 或 `complex-remove`。
3. 按清单使用 `slice-asset-sheet.mjs` 或 `slice-alpha-components.mjs` 切分素材矩阵，候选和 `candidate-manifest.json` 放在 `.local/`；源图 bbox 裁切仅作为评审基准，不替代最终素材。
4. 按背景标记处理裁图，再使用 `audit-assets.mjs` 审计透明候选：
   - `preserve` 保留背景并使用 `clean-crop`；`existing-alpha` 直接审计，不重复移除背景。
   - `known-key` 表示背景连续、纯净且键色可确定。键色透明化只在该场景使用，先运行 `probe-key-color.mjs`，再运行 `key-transparent-image.mjs`。
   - `complex-remove` 表示需要透明背景但背景自然、渐变或复杂。无论 CLI 是否可用，都运行 `ui-image-generation` 创建 `generated-refined` 或 `generated-chroma`；CLI 可用时还运行 `rembg-cutout`（默认模型 `birefnet-general`），分别审计并选择质量最优结果：

```bash
node .agents/skills/screenshot-to-prototype/scripts/remove-background-rembg.mjs \
  --input .local/screenshot-to-prototype/<slug>/candidate.png \
  --output .local/screenshot-to-prototype/<slug>/candidate-rembg.png
```

找不到 `rembg` 时包装器返回 `skipped`；技能不安装、不配置 CLI 或模型。CLI 执行失败、没有输出或审计不通过时只淘汰该候选，不影响图片生成候选。
5. 素材矩阵中的每一项都必须单独对应一个 `elements.json` ID，记录 bbox、候选和最终表示方式，再构建并验证还原映射：

```bash
node .agents/skills/screenshot-to-prototype/scripts/build-reconstruction-manifest.mjs \
  --source-summary .local/screenshot-to-prototype/<slug>/source-summary.json \
  --elements .local/screenshot-to-prototype/<slug>/elements.json \
  --output src/prototypes/<slug>/.spec/reconstruction/reconstruction-manifest.json

node .agents/skills/screenshot-to-prototype/scripts/validate-reconstruction-manifest.mjs \
  --manifest src/prototypes/<slug>/.spec/reconstruction/reconstruction-manifest.json \
  --project-root src/prototypes/<slug> \
  --source <source.png>
```

存在生成候选时追加 `--generation-artifacts src/prototypes/<slug>/.spec/generation-artifacts.json`。

6. 在 `spec.html` 实现绝对定位视觉稿。需要 Tailwind 时运行 `compile-reconstruction-tailwind.mjs`，使用独立前缀；不使用 Tailwind CDN，不加载 Tailwind preflight。
7. 调用 `preview_capture`，按源图 viewport、DPR 1 截取规格视觉页，输出到 `.spec/reconstruction/visual-check/render.png`。截图为空、尺寸错误或诊断异常时先修复捕获问题。
8. 在当前 `spec.html` 增加成果快速对比区域，引用稳定原图和 `render.png`；两张图使用相同 viewport 与比例左右并排。
9. 提供完整 Make 服务规格评审链接并结束当前回合。用户提出意见时返回步骤 6-9；只有用户明确确认当前 HTML 主规格后才继续步骤 10。
10. 转换为真实文本、React 组件、Grid/Flex、CSS variables、响应式约束和交互状态。React 不引用 `.local/`，也不把可编辑 UI 保留为整块截图。
11. 完成 React 后按相同 viewport 再截图，更新规格中的成果对比并同步实际实现事实，然后进入原型验收。

## 素材策略

- 文本、按钮、输入框、导航、卡片、列表和表格使用 HTML/CSS；图标、Logo、进度和简单图表优先使用现有图标库或 SVG，并按素材矩阵和源图匹配视觉细节。
- 照片、头像、商品图、插画、纹理和页面内嵌截图使用位图，默认保留 `clean-crop`；需要修复时增加 `generated-refined`。
- `complex-remove` 始终增加图片生成候选，本机 `rembg` 可用时再增加 `rembg-cutout`；已知纯键色继续使用本地键色脚本。
- 二次生图始终传入本地源图，不生成 UI 文案、控件或数据内容；输出比例和清晰度按目标 bbox 和 DPR 确定。
- 纯色生成背景需要透明化时使用 `generated-chroma`；连续复杂背景在其他方式效果不足时才使用 `clean-plate`。
- `flatten-in-page` 只用于第一阶段视觉稿；最终 React 恢复文本、控件、重复结构和需要交互的数据图形。
- 最终文件型素材直接放入原型 `assets/`，其使用位置和取舍写入主规格。

## 映射

`reconstruction-manifest.json` 记录源图 hash/viewport、元素 bbox、表示方式、候选选择、规格元素 ID 和 React 目标。`rembg-cutout` 候选记录模型与本地素材路径，不需要生成 artifact id；构建后运行验证器检查边界、资源、候选审计和源图一致性。

## 交付

第一阶段回复提供 HTML 主规格评审链接和待确认事项，并明确当前尚未进入 React。用户确认并完成第二阶段后，最终回复再提供规格链接、原图与真实运行截图，以及轻量偏差说明。按 P0-P3 说明仍可见的问题。
