/**
 * @name UG-LMS 特殊执行名单
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { AnnotationViewer, type AnnotationSourceDocument } from '@axhub/annotation';
import annotationSourceDocument from './annotation-source.json';
import pageMarkup from './page.html?raw';
import interactionScript from './interaction.js?raw';
import langScript from './lang.js?raw';
import specialListScript from './special-list.js?raw';
import entryDefaultsScript from './entry-defaults.js?raw';
import logoUrl from './assets/logo-0.png';
import avatarUrl from './assets/image-1.png';
import noDataUrl from './assets/No-data-2.png';
import './static-style.css';

/**
 * UG-LMS 特殊执行名单 —— Credit Application 页面高保真还原。
 *
 * 页面 DOM 来自 Axhub 导出包（domlist + stylePool）重建的静态还原结果，
 * 见 `page.html`（结构与内容）与 `static-style.css`（精确计算样式）。
 * 数据来源页面：https://mtn-uganda-lms-web-test.mindigitaltech.com/credit-application
 */

type PrototypeProps = {
    config?: {
        projectPath?: string | null;
    };
};

const PAGE_ID = 'ug-lms-credit-application';

export default function UgLmsSpecialList({ config }: PrototypeProps) {
    const hostRef = useRef<HTMLDivElement | null>(null);

    const source = useMemo(
        () => annotationSourceDocument as unknown as AnnotationSourceDocument,
        [],
    );

    // 侧边菜单展开/收起 + 中英切换：dangerouslySetInnerHTML 不会执行 <script>，这里手动注入
    useEffect(() => {
        const scripts = [interactionScript, langScript, specialListScript, entryDefaultsScript].map((code) => {
            const script = document.createElement('script');
            script.textContent = code;
            document.body.appendChild(script);
            return script;
        });
        return () => {
            scripts.forEach((script) => script.remove());
        };
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const projectPath = config?.projectPath ?? window.location.pathname;
        (window as unknown as Record<string, unknown>).__AXHUB_COMMENTARY_CONTEXT__ = {
            projectPath,
            filePath: 'src/prototypes/ug-lms-special-list/index.tsx',
            annotationSourcePath: './annotation-source.json',
        };
    }, [config]);

    // 图片走 Vite 资源导入：构建后会被内联/重写为带 base 的地址，
    // 避免静态部署（GitHub Pages 子路径）下相对路径 assets/ 404。
    const pageHtml = useMemo(
        () => pageMarkup
            .split('assets/logo-0.png').join(logoUrl)
            .split('assets/image-1.png').join(avatarUrl)
            .split('assets/No-data-2.png').join(noDataUrl),
        [],
    );

    return (
        <>
            <div
                ref={hostRef}
                className="ug-lms-special-list-host"
                dangerouslySetInnerHTML={{ __html: pageHtml }}
            />
            <AnnotationViewer
                source={source}
                options={{
                    currentPageId: PAGE_ID,
                    toolbarEdge: 'right',
                    showToolbar: true,
                    showThemeToggle: true,
                    showColorFilter: true,
                    emptyWhenNoData: true,
                }}
            />
        </>
    );
}
