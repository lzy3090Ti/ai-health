# Ai·健康

> 一套代码，两端同形 —— 电脑网页与安卓 APK 共用同一份构建产物，横向三栏版式完全一致。

**在线体验**：https://lzy3090ti.github.io/ai-health/
**安卓安装包**：[`Ai健康-2.0-release.apk`](./Ai健康-2.0-release.apk)（6.5 MB，v2.0，minSdk 24）

---

## 这是什么

一个个人健康档案与评分的单页应用。核心不是「又一个记步 App」，而是三件事：

1. **0–100 的 AI 综合健康率**：由八项指标按权重量化扣分，纯本地确定性计算，离线可用、结果可解释、同一个档案每次算出来一样。
2. **拍病历单即录入**：照片或文字交给视觉模型解析成结构化指标，进可编辑核对表，确认后才落库。
3. **档案归用户自己**：所有数据存成一份 `Vault`，可导出 JSON 与 Obsidian 风格 Markdown，随时带走。

## 功能

| 模块 | 说明 |
|---|---|
| 总览 | 健康率圆环 + 关键发现 + 改善建议（会参考身高/体重/年龄/身体限制） |
| 八项指标 | 体重、腰围、体脂率、静息心率、血氧、步数、睡眠、训练时长；各带个人最优区间与趋势折线 |
| 报告解析 | 拍照 / 选图 / 粘贴文字 → AI 提取指标 → 核对表 → 入库 |
| 心率采集 | 桌面走 Web Bluetooth，安卓走原生 BLE，读取标准心率广播（0x180D / 0x2A37） |
| 记录 | 全量时间线，可删除单条 |
| 设置 | 账户与体验期、用户基础信息、AI 配置、档案导入导出、WebDAV 同步、演示模式 |

## 技术栈

- **前端**：React 19 + TypeScript 5.9 + Vite 8，无 UI 框架、无路由库（页面切换是内部状态机）
- **安卓**：Capacitor 8（WebView 壳 + 原生相机/BLE/文件系统），横屏锁定、隐藏状态栏
- **后端**：Supabase（Auth、Postgres + RLS、RPC、Edge Function）
- **模型**：Kimi `kimi-k2.6` 视觉模型，仅在服务端调用
- **动效**：GSAP（圆环数字递增、卡片错峰进场）

## 目录

```
.
├── web/                    前端与安卓工程
│   ├── src/                21 个源文件，约 2 300 行
│   │   ├── components/     10 个 UI 模块
│   │   ├── lib/            store / supabase / ai / heart-rate 四个适配器
│   │   ├── data.ts         指标定义、评分、建议、导出
│   │   └── styles.css      设计令牌 + 三栏 Grid + 断点
│   ├── supabase/           schema.sql、migrations、analyze-report 边缘函数
│   └── android/            Capacitor 安卓工程（签名材料不入库）
├── .github/workflows/      GitHub Pages 自动构建部署
├── Ai健康-实现规格书.md      逐模块实现细节与源码拆解
└── Ai健康-架构与平台适配说明.md  分层架构、五端适配点、兼容性矩阵
```

## 本地运行

```bash
cd web
npm ci
npm run dev          # http://localhost:5173
npm run build        # 产物 dist/
npm run preview      # 预览构建结果
```

本机访问时，前端会把 Supabase 请求转发到同源 `/sb`（由 Vite 代理），因为部分网络环境直连 `supabase.co` 会被重置；线上域名与 APK 则直连。

## 配置

前端只需要两个值，位于 `web/.env`（`VITE_*` 在构建时内联进 JS，改完需重新构建）：

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable key>
```

> 这两个值本就是公开信息，安全性由 RLS 与边缘函数把关。**模型密钥与服务端密钥永远不进前端**，只放在 Supabase Secrets：
> `supabase secrets set KIMI_API_KEY=xxx SUPABASE_SERVICE_ROLE_KEY=xxx`

数据库初始化：依次执行 `web/supabase/schema.sql` 与 `web/supabase/migrations/*.sql`。

## 部署

**网页**：推送 `main` 即触发 GitHub Actions 构建并发布到 Pages（见 `.github/workflows/deploy.yml`）。也可自行把 `web/dist/` 丢给任意静态托管——`base: './'` 是相对路径，根目录或子目录都能跑。

**安卓**：

```bash
cd web && npm run build && npx cap copy android
cd android && JAVA_HOME=<jdk21+> ./gradlew assembleRelease
```

产物 `android/app/build/outputs/apk/release/app-release.apk`，需自行配置 `keystore.properties` 签名。

## 已知限制

- 版式为固定三栏，视口小于 740px 会出现横向滚动；安卓端锁定横屏，定位是「横屏看板」而非竖屏信息流。
- 网页端蓝牙仅 Chrome / Edge 可用（Safari、Firefox 不支持 Web Bluetooth）。
- 数据存于 `localStorage`，按 origin 隔离：换域名或清缓存前请先导出档案。
- 华为运动健康 API 仅预留字段（`source: 'huawei'`），未接入真实同步。
- 缴费为演示流程，不产生真实交易。

## 说明

健康建议不替代医生诊断或治疗。演示模式下的数据为内置样例，与真实档案隔离。
