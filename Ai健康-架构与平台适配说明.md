# Ai·健康 · 架构与平台适配说明

> 版本 **v2.0** ｜ 文档日期 **2026-11-08** ｜ 对应产物 `dist/`（静态站点）· `Ai健康-2.0-release.apk`
>
> 本文只讲两件事：**系统是怎么搭起来的**（架构），**同一套代码怎么在电脑和手机上跑得一样**（平台适配）。
> 逐模块实现细节与完整源码见配套文档《Ai健康-实现规格书.md》。

---

## 0. 一页速览

| 项目 | 结论 |
|---|---|
| 应用形态 | 单页 Web 应用（SPA），同一份构建产物同时服务浏览器与安卓 WebView |
| 技术栈 | React 19.3 + TypeScript 5.9 + Vite 8.3；Capacitor 8.6 打包安卓；无 UI 框架、无路由库 |
| 代码规模 | 源码 21 个文件、约 2 300 行（含样式 600 余行） |
| 适配平台 | 桌面浏览器（Chrome / Edge / Safari*）、Android 7.0+ APK、平板横屏；iOS 预留未构建 |
| 布局策略 | **固定三栏 Grid**，PC 与手机共用同一套版式，只按断点缩放列宽，不换布局 |
| 数据存放 | 本地单文件档案 `Vault`（localStorage），按登录用户分键；可导出 JSON / Markdown |
| 云端职责 | 仅三件：登录注册、体验期/会员校验、报告解析代理（Kimi 密钥不下发客户端） |
| 离线能力 | 评分、图表、建议、档案浏览全部离线可用；仅「AI 解析报告」需要联网 |
| 安卓壳增强 | 横屏锁定、隐藏状态栏、原生相机、原生 BLE、文件写入文档目录 |
| 发布产物 | 网页 `dist/` 约 700 KB（4 个文件）；发行 APK 6.5 MB，已签名 |

---

## 1. 适配目标与硬约束

比赛要求「网页 + 手机双端」，且不接受小程序。由此推出四条硬约束，架构上的每个决定都源于它们：

| # | 约束 | 架构上的对应决定 |
|---|---|---|
| C1 | 双端视觉必须一致，不允许「手机一套、电脑一套」 | 只写一套 CSS，安卓锁横屏；`min-width: 740px` 保证三栏永不被压塌 |
| C2 | 手机不能只是「能打开」，要能拍照、连手表、导出文件 | 引入 Capacitor，把三类原生能力封装成与 Web 同名的调用点 |
| C3 | AI 密钥不能进客户端（APK 会被反编译） | 所有模型调用走 Supabase Edge Function，客户端只持 publishable key |
| C4 | 演示现场网络不可控，断网也要能讲 | 评分/建议/图表全部本地确定性计算；AI 只是「录入加速器」，不是运行时依赖 |

> 一句话取舍：**能本地算的绝不上云，必须上云的绝不下发密钥。**

---

## 2. 总体架构

### 2.1 五层运行时模型

```
┌──────────────────────────────────────────────────────────────────────┐
│ L1 外壳层  Shell                                                     │
│   浏览器（Chromium 内核）         Capacitor 8 Android（WebView 140+） │
│   · 地址栏/标签页                 · 横屏锁定 + 状态栏隐藏 + 返回键     │
│   · Web Bluetooth / input capture · 原生 Camera / BLE / Filesystem    │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ 同一份 dist/（HTML+JS+CSS）
┌───────────────────────────────▼──────────────────────────────────────┐
│ L2 视图层  View（src/components/*.tsx，10 个模块）                    │
│   三栏骨架：OverviewPanel │ Dashboard/MetricDetail/Scan/Records/Settings│ NavigationRail │
│   只做：渲染、交互、局部状态。不含业务算法、不直接访问云端             │
└───────────────────────────────┬──────────────────────────────────────┘
┌───────────────────────────────▼──────────────────────────────────────┐
│ L3 领域层  Domain（src/App.tsx 状态机 + src/data.ts）                 │
│   · 指标定义、最优区间、AI 健康率扣分、行动建议、Markdown 导出        │
│   · 页面状态机、登录态、Vault 归属切换、演示模式三层隔离               │
└───────────────────────────────┬──────────────────────────────────────┘
┌───────────────────────────────▼──────────────────────────────────────┐
│ L4 基础设施层  Infrastructure（src/lib/*，4 个适配器）                │
│   store.ts 档案读写/导入导出/WebDAV  │  supabase.ts 认证与体验期       │
│   ai.ts 解析调用                    │  heart-rate.ts 双通道心率        │
└───────────────────────────────┬──────────────────────────────────────┘
┌───────────────────────────────▼──────────────────────────────────────┐
│ L5 云服务层  Cloud（Supabase 项目 earnolaubmnzhzumldqq）             │
│   Auth（邮箱+密码）│ profiles 表 + RLS │ start_trial() RPC            │
│   Edge Function `analyze-report` ──► Kimi `kimi-k2.6` 视觉模型        │
└──────────────────────────────────────────────────────────────────────┘
```

依赖方向严格单向向下。**唯一的例外是"平台适配点"**：为了让原生能力按需加载，`Capacitor.isNativePlatform()` 的判断分布在 L2 与 L4 共 4 个文件里（见第 4 章），这是有意的实用性妥协，不是架构失误。

### 2.2 部署拓扑

```
                     ┌────────────────────────┐
   电脑浏览器 ───────►│ 静态托管（Nginx/CDN）  │  dist/：index.html + assets
   （HTTPS）         └───────────┬────────────┘
                                 │ 静态资源（相对路径 ./）
   ┌─────────────────────────────┼──────────────────────────────┐
   │                             │                              │
   │  Android APK                │                              │
   │  （资源内置 assets/public） │                              │
   ▼                             ▼                              ▼
┌──────────────────────────────────────────────┐    ┌──────────────────────┐
│ 客户端运行时                                  │    │ Supabase（HTTPS）    │
│ · 评分/建议/图表：纯本地                      │    │ /auth/v1  登录注册   │
│ · 档案：localStorage                          │    │ /rest/v1  profiles   │
│ · AI 调用：Bearer JWT ───────────────────────┼───►│ /functions/v1/…      │
└──────────────────────────────────────────────┘    └──────────┬───────────┘
      本机开发时：/sb ──► Vite 代理 ──► supabase.co              │
                                                    Kimi API ◄──┘
```

两种网络路径必须区分清楚，这是本项目最容易踩坑的地方：

| 运行环境 | 实际请求地址 | 原因 |
|---|---|---|
| `127.0.0.1` / `localhost` 打开网页（开发、预览） | `http://127.0.0.1:4173/sb/...` | 本机网络到 `supabase.co` 会被 TLS reset，Vite 用 `https-proxy-agent` 同源转发 |
| 线上域名打开网页 | `https://earnolaubmnzhzumldqq.supabase.co/...` | 线上无代理，直连 |
| 安卓 APK | 同上，直连 | WebView 内没有 Vite，走系统网络栈 |

### 2.3 目录职责

```
web/
├── index.html                  入口（viewport-fit=cover、theme-color #fff5f5）
├── vite.config.ts              构建配置 + /sb 同源转发（server 与 preview 双向）
├── capacitor.config.ts         appId / appName / webDir / androidScheme=https
├── public/                     仅 2 张图：app-icon.png（512）、favicon.png
├── src/
│   ├── main.tsx                React 挂载
│   ├── App.tsx                 状态机 + 登录态 + 演示隔离 + GSAP 进场（约 200 行）
│   ├── types.ts                Vault / HealthRecord / AccountProfile 类型
│   ├── data.ts                 指标定义、评分、建议、Markdown 导出（约 500 行）
│   ├── styles.css              设计令牌 + 三栏 Grid + 4 组断点（约 600 行）
│   ├── components/             10 个 UI 模块（见 2.4）
│   └── lib/                    store / supabase / ai / heart-rate
├── supabase/
│   ├── schema.sql              建表 + RLS + 触发器 + start_trial()
│   ├── migrations/             增量迁移（含表级 GRANT 修复）
│   └── functions/analyze-report/index.ts   边缘函数（168 行）
├── android/                    Capacitor 安卓工程（Manifest、MainActivity、签名）
├── scripts/generate-icons.mjs  sharp 批量生成 mipmap / favicon
└── dist/                       构建产物，静态托管只认这个目录
```

### 2.4 UI 模块与状态

`App.tsx` 用一个联合类型驱动页面切换，没有引入任何路由库（因此静态托管无需 history fallback）：

| 状态 | 入口 | 说明 |
|---|---|---|
| `dashboard` | 导航栏首页 | 8 张指标卡 + 趋势 |
| `metric` | 点某张卡 | 单指标详情：折线、区间条、录入 |
| `scan` | 导航栏扫描 | 拍照/文字 → AI 解析 → 核对表 → 落库 |
| `records` | 导航栏记录 | 全部记录时间线，可删 |
| `settings` | 导航栏设置 | 账户、体验、用户数据、AI、档案、同步、演示模式 |
| `auth` | 未登录时拦截 | 登录/注册 |

三栏骨架：`OverviewPanel`（品牌 + AI 健康率圆环 + 关键发现）／主内容区（上表五个页面）／`NavigationRail`（右侧竖排图标）。左栏可折叠为两栏，折叠状态改的是 Grid 列定义，不是 `display:none`：

```css
.app-shell { grid-template-columns: clamp(190px, 22vw, 272px) minmax(0, 1fr) 72px; }
.app-shell.overview-collapsed { grid-template-columns: minmax(0, 1fr) 72px; }
```

### 2.5 三条关键数据流

**① 启动与登录态切换**

```
localStorage["ai.health.vault.v2.<ownerId|guest>"]
   → normalize()（补默认值、逐项校验 8 类指标数组）
   → Vault 状态 → 渲染
登录成功 → ownerId 变化 → 重新 loadVault(ownerId) → 界面换档（不搬数据，各归各的）
```

**② 报告解析（唯一需要联网的业务链路）**

```
拍照/选图 ──► resizeImage(≤1600px, ≤20MB) ──► analyzeReport()
   ├─ 未登录 → 直接抛「请先在设置中登录」，不发请求
   ├─ 演示模式 → analyzeTextLocally()（本地正则，不联网，标注「演示解析」）
   └─ 正常 → functions.invoke('analyze-report', { image, transcript, profile })
            → 边缘函数：验 JWT（401）→ 查 plan_status/trial_ends_at（403）
            → Kimi kimi-k2.6 → extractJson → sanitize（数值范围/去重，失败重试 1 次）
            → 返回 { metrics[] }
   → 可编辑核对表（用户确认）→ 写 Vault → 存 localStorage
```

**③ 健康率评分（纯本地、可解释、结果稳定）**

```
Vault.metrics + profile → getHealthAssessment()
   → 100 分起扣：体重 16 / 腰围 16 / 体脂 20 / 血氧 24 …（逐项权重）
   → score + 关键发现[] → OverviewPanel
   → 圆环 dashoffset = C × (1 - score/100)，数字用 GSAP 从 0 递增
```

三条流互不依赖：断网时 ②不可用，①③照常，所以演示不会因网络卡死。

---

## 3. 适配平台清单

### 3.1 支持矩阵

| 平台 | 形态 | 最低 / 建议版本 | 布局表现 | 拍照 | 蓝牙心率 | AI 解析 |
|---|---|---|---|---|---|---|
| Windows 10 / 11 | 网页 | Chrome / Edge 120+ | 三栏完整，1440px 及以上最舒展 | 摄像头或选图 | ✅ Web Bluetooth | ✅ |
| macOS | 网页 | Chrome / Edge 120+ | 同上 | 摄像头或选图 | ✅ | ✅ |
| macOS | 网页 | Safari 17+ | 同上，`100dvh` 正常 | ✅ 选图 | ❌ 不支持 Web Bluetooth | ✅ |
| Linux | 网页 | Chromium 120+ | 同上 | 选图 | ✅（需 BlueZ） | ✅ |
| Android 手机 | **APK** | **7.0（API 24）及以上** | **强制横屏，与 PC 版式一致** | ✅ 原生相机 | ✅ 原生 BLE | ✅ |
| Android 平板 | APK | 7.0+ | 横屏三栏，列宽按 22vw 撑开 | ✅ | ✅ | ✅ |
| Android 手机 | 网页 | Chrome 120+ | 竖屏宽度不足，**会横向滚动**（见 5.1） | ✅ `<input capture>` | ⚠️ 厂商差异大 | ✅ |
| iOS / iPadOS | — | 未构建 | — | — | — | — |

\* Safari 只影响蓝牙一项，其余功能正常；实机验证记录见第 9 章。

### 3.2 屏幕基准

| 场景 | CSS 视口 | 说明 |
|---|---|---|
| 手机横屏（主流 6.1–6.8 英寸） | 约 780–930 × 360–440 | 落在 `≤1050px` 断点，左栏 190px、右栏 58px、圆环 126px |
| 手机横屏（小屏 / 带手势条） | 约 700–780 × 340–400 | 触发 `min-width:740px` 横向滚动，或触发 `max-height:620px` 纵向压缩 |
| 笔记本 | 1280–1536 × 700–860 | 默认档，左栏 `22vw` 约 280px 上限被 `clamp` 收在 272px |
| 桌面大屏 / 投影 | ≥1500 | 内容区 1180px 居中，圆环 154px，适合答辩演示 |

---

## 4. 一套代码两端的五个适配点

原则：**接口同名、实现分叉、调用方无感**。上层只写 `connectHeartRate()`、`exportVault()`、`chooseImage()`，不关心自己跑在哪。

### 4.1 平台探测

```ts
// 唯一的判定依据，基于 Capacitor 注入的全局对象
Capacitor.isNativePlatform()   // APK 内 true，浏览器 false
```

不使用 UA 判断（UA 会被改、会误杀），也不靠 `window.Android` 之类的自定义桥。已在 4 个文件使用：

| 文件 | 用途 | 分支 |
|---|---|---|
| `lib/heart-rate.ts` | 心率通道 | 原生 BLE / Web Bluetooth |
| `lib/store.ts` | 导出档案 | 写入 `Documents/AiHealth/` / 触发浏览器下载 |
| `components/ScanPage.tsx` | 拍照 | 原生相机 / `<input type=file capture>` |
| `components/SettingsPage.tsx` | 蓝牙自检 | 提示进详情页 / 调 `navigator.bluetooth` |
| `lib/supabase.ts` | 网络地址 | 直连 / 本机走 `/sb` 转发（这里读 `window.Capacitor` 而非 import，避免首屏加载原生包） |

### 4.2 相机

| | 原生（APK） | 网页 |
|---|---|---|
| 调用 | `Camera.getPhoto({ quality:85, width:1600, source: CameraSource.Prompt })` | `<input type="file" accept="image/*" capture="environment">` |
| 交互 | 系统弹「拍照 / 从相册选」 | 浏览器原生选择器，手机自动调起相机 |
| 返回 | `DataUrl`（base64） | `File` → `FileReader` |
| 压缩 | 插件层 `width:1600` 已缩 | `resizeImage()` 用 Canvas 缩到长边 1600 |
| 失败 | 取消静默返回，其他提示「无法打开相机，请检查应用权限」 | 选图后校验类型与 ≤20MB |

两端最终都收敛成同一个 base64 字符串，后续 `analyzeReport({ image })` 完全一致。

### 4.3 档案导出

| | 原生（APK） | 网页 |
|---|---|---|
| JSON | `Filesystem.writeFile` → `Documents/AiHealth/health.vault.json` | Blob + `<a download>` |
| Markdown | 同目录 `健康档案.md` | 延迟 180ms 再下一次，避免浏览器拦截连发下载 |
| 返回文案 | 「已保存到 Android 文档目录 /AiHealth」 | 「已开始下载 JSON 与 Markdown」 |

这就是「换 origin 数据丢失」时的官方迁移通道，也是评委现场拷走数据的通道。

### 4.4 蓝牙心率（差异最大，坑最多）

| | 原生（APK） | 网页 |
|---|---|---|
| 底层 | `@capacitor-community/bluetooth-le` 8.3 | `navigator.bluetooth`（Web Bluetooth） |
| 初始化 | `BleClient.initialize({ androidNeverForLocation: true })` | 无需初始化，需安全上下文 |
| 选设备 | `requestDevice({ services:[完整UUID], optionalServices:[完整UUID] })` | `requestDevice({ filters:[{ services:['heart_rate'] }] })` |
| 服务/特征 | 必须 **128 位完整 UUID** | 可用别名 `heart_rate` / `heart_rate_measurement` |
| 权限 | Android 12+：`BLUETOOTH_SCAN`(neverForLocation) + `BLUETOOTH_CONNECT`；7–11：蓝牙 + 定位 | 浏览器自动询问，Chrome 桌面需授权 |
| 断连处理 | 首次常报 GATT 133，等 800ms 重试一次 | 无此问题 |
| 可用范围 | 全 Android 7.0+ | 桌面 Chrome/Edge；Safari、Firefox 不可用 |

**UUID 必须写全**，这是本项目最典型的一次故障：插件 8.x 内部 `parseUUID` 只接受 128 位字符串，短写 `'180D'` 会直接抛
`Invalid UUID format 180d. Expected 128 bit string`。电脑端走 Web Bluetooth 别名，浏览器自己做了映射，所以「电脑好、安卓报错」。

```ts
const HEART_RATE_SERVICE     = '0000180d-0000-1000-8000-00805f9b34fb';
const HEART_RATE_MEASUREMENT = '00002a37-0000-1000-8000-00805f9b34fb';
```

心率值解析按标准 Flags 位判断位宽，两端共用同一函数：

```ts
const flags = value.getUint8(0);
const hr = (flags & 0x01) === 0 ? value.getUint8(1) : value.getUint16(1, true);
return hr >= 30 && hr <= 220 ? hr : null;   // 超范围视为噪声丢弃
```

错误文案按失败点分流，避免用户只看到一句「失败」：已取消选择 / 没搜到设备（提示开启心率广播、断开手机自带健康 App）/ 连接失败（GATT 占用）/ 设备不提供 0x2A37 广播。

### 4.5 网络地址

```ts
function resolveSupabaseUrl() {
  if (isNative) return rawUrl;                        // APK：直连
  const isLocalWeb = ['127.0.0.1','localhost','::1'].includes(hostname);
  return isLocalWeb ? `${origin}/sb` : rawUrl;        // 本机：同源转发；线上：直连
}
```

配套的 Vite 转发（`server` 与 `preview` 都配，否则 `vite preview` 下登录会失败）：

```ts
proxy: {
  '/sb': {
    target: 'https://earnolaubmnzhzumldqq.supabase.co',
    changeOrigin: true,
    rewrite: (p) => p.replace(/^\/sb/, ''),
    agent: new HttpsProxyAgent('http://127.0.0.1:7890'),   // 本机出网代理
  },
}
```

**适配结论**：线上部署不需要这层代理；如果服务器所在网络到 `supabase.co` 也不稳，在 Nginx 反代一个 `/sb` 并放开 `127.0.0.1` 判定即可，前端零改动。另外网页端 **必须 HTTPS**，否则 Web Bluetooth 直接不可用（非安全上下文）。

---

## 5. 视觉适配

### 5.1 断点（3 组媒体查询 + 1 条全局下限）

宽度轴两组（≥1500、≤1050）、高度轴一组（≤620）；另有 `min-width: 740px` 作为硬下限，不参与媒体查询。所有调整只改**尺寸**，从不改**结构**。

| 条件 | 作用 | 关键数值 |
|---|---|---|
| `min-width: 1500px` | 大屏舒展 | 内容区 `max-width 1180`、padding `40 38 56`、圆环 154px、环内 120px |
| 默认（1051–1499） | 基准 | 左栏 `clamp(190px, 22vw, 272px)`、右栏 72px、padding `26 22 20` |
| `max-width: 1050px` | 手机横屏 / 小笔记本 | 左栏 190px、右栏 58px、圆环 126px、环内 98px、卡片 padding 15、导航项 `min-height 100`、正文 9px |
| `max-height: 620px` | 矮屏（横屏 + 手势条） | 顶栏 padding 16、圆环 112px、环内 88px、登录页顶部对齐 |
| `min-width: 740px`（全局） | 三栏下限 | `html, body, #root` 与 `.app-shell` 同时设 740px |

**为什么手机横屏能直接用 PC 版式**：主流手机横屏 CSS 宽度 780–930px，正好落在 `≤1050px` 断点内；三栏不是「折叠成抽屉」，而是把 272px 压到 190px、把 72px 压到 58px。因为信息架构本来就适合宽而扁的形态，横屏三等分反而比竖屏单列信息密度更高。

**低于 740px 会横向滚动，这是设计选择而非缺陷**：竖屏手机宽度 360–430px，塞三栏会把指标卡压成两行字。项目定位是「桌上/横屏用的健康看板」，因此宁可要求横屏，也不做第二套竖屏布局（那会违背 C1 的视觉一致性）。安卓端用 `android:screenOrientation="landscape"` 从系统层面锁死。

### 5.2 三栏骨架

```css
.app {
  height: 100dvh;          /* 不用 100vh：安卓 WebView 地址栏收缩会跳 */
  overflow: hidden;        /* 滚动交给每一栏自己，避免整页滚动错位 */
}
.app-shell {
  display: grid;
  grid-template-columns: clamp(190px, 22vw, 272px) minmax(0, 1fr) 72px;
  min-width: 740px;
  height: 100%;
  transition: grid-template-columns .22s ease;   /* 折叠有过渡，不闪 */
}
```

`minmax(0, 1fr)` 不能省：默认 `1fr` 的最小尺寸是 `auto`，内部若有 `nowrap` 长文本会把中栏顶宽，导致右栏被挤出屏幕。

左栏内部 `overflow-y: auto` 独立滚动；主内容区 `.page-content` 自己滚；右栏固定。三者互不影响，横屏高度只有 400px 时仍可各自访问全部内容。

### 5.3 横屏与状态栏

| 措施 | 实现位置 | 效果 |
|---|---|---|
| 锁定横屏 | `AndroidManifest.xml` → `android:screenOrientation="landscape"` | 转屏不再重建界面 |
| 隐藏状态栏 | `MainActivity.java` → `WindowInsetsControllerCompat.hide(statusBars())` | 顶部不再被时间/电量占用约 24dp |
| 下滑临时唤出 | `BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE` | 需要看通知时仍可滑出，符合系统习惯 |
| 失焦后重新隐藏 | `onWindowFocusChanged()` 里再调一次 | 来电、切后台回来不会又冒出来 |
| 配置不变重建 | `configChanges="orientation|screenSize|…"` | 避免 WebView 重载丢状态 |
| 视口适配 | `viewport-fit=cover` | 内容延伸到刘海区域 |
| 主题色 | `theme-color: #fff5f5` | 网页端地址栏与品牌色一致 |

### 5.4 字体与离线降级

```css
font-family: 'Noto Sans SC', -apple-system, BlinkMacSystemFont,
             'PingFang SC', 'Microsoft YaHei', sans-serif;
```

字体通过 `@import` 从 Google Fonts 加载。**这是一个已知的跨端差异**：国内网络或 APK 离线时该请求会失败，静默回退到系统字体（macOS/iOS 用苹方、Windows 用雅黑、Android 用思源黑体），字重 300/500 的细微差别会让大标题略粗。布局不受影响（都是等比字宽近似），若需完全一致，把字体文件放进 `public/` 自托管即可，成本约 1–2MB。

### 5.5 触控与可访问性

| 项 | 取值 | 原因 |
|---|---|---|
| 导航项最小高度 | 100px（窄屏同） | 横屏拇指点击目标足够大 |
| 卡片内边距 | 15–26px | 兼顾信息密度与触控留白 |
| 点击高亮 | `-webkit-tap-highlight-color: transparent` | 去掉安卓 WebView 的灰色方块 |
| 焦点环 | `:focus-visible { outline: 2px solid var(--accent); offset: 3px }` | 键盘操作可见，答辩时可用 Tab 演示 |
| 禁用态 | `opacity: .48` + `cursor: not-allowed` | 忙时按钮反馈明确 |
| 输入元素 | 统一 `font: inherit` | 避免 iOS/安卓表单字号跳变 |

---

## 6. 数据适配

| 项 | 方案 | 跨端影响 |
|---|---|---|
| 存储介质 | `localStorage`（WebView 内同样是 localStorage） | 两端 API 完全一致，无需抽象 |
| 键名 | `ai.health.vault.v2.&lt;ownerId&gt;`，未登录为 `.guest` | 按登录用户隔离；未登录用 `guest`，互不污染 |
| 主题 | `ai.health.theme` | 深浅色跟随本机，不随账号 |
| 版本迁移 | `schemaVersion: 1` + `normalize()` 逐字段兜底 | 老档案缺字段自动补默认值，不会白屏 |
| 容量 | 典型档案 < 200KB；图片不进档案，只存解析结果 | 远低于 5MB 上限 |
| 跨端/跨域迁移 | 设置页导出 `health.vault.json` → 另一端导入 | 换域名、换设备、清缓存都有兜底 |
| 单一真源 | 内存中只有一个 `Vault` 对象，写操作统一回写 | 不存在「界面改了没存」的双写问题 |
| 演示隔离 | 独立 seed 档案 + 独立 key + 界面标识 | 退出演示不残留、不覆盖真实数据 |

> 注意：`localStorage` 按 **origin** 隔离。从 `127.0.0.1:4173` 换到线上域名，旧数据不会自动带过去——这是浏览器规则，不是代码问题。上线前先导出、上线后导入。

---

## 7. 构建与交付适配

### 7.1 一份源码、三种交付

| 交付形态 | 命令 | 产物 | 用途 |
|---|---|---|---|
| 静态站点 | `npm run build` | `dist/` ≈700 KB | Nginx / CDN / 对象存储 / Vercel |
| Android APK | `npx cap copy android` + `./gradlew assembleRelease` | `app-release.apk` 6.5 MB | 手机安装、评委体验 |
| 开发调试 | `npm run dev` / `npm run preview` | 本地服务 + `/sb` 转发 | 开发与截图核验 |

`vite.config.ts` 里 `base: './'`，所有资源引用都是相对路径，所以 **放根域名或 `/health/` 子目录都能直接跑**，不需要改构建、不需要配 `publicPath`。应用无路由，也不需要 history fallback。

### 7.2 安卓工程关键参数

| 参数 | 值 | 说明 |
|---|---|---|
| `appId` | `com.healthagent.vault` | 包名，升级必须一致 |
| `appName` | `Ai·健康` | 桌面图标名称 |
| `webDir` | `dist` | Cap sync 的拷贝源 |
| `androidScheme` | `https` | WebView 内 origin 为 `https://localhost`，`localStorage` 才算安全上下文 |
| `minSdkVersion` | 24（Android 7.0） | 覆盖绝大多数在用设备 |
| `compileSdk / targetSdk` | 36 | 满足 Google Play 现行要求，权限行为按 Android 12+ 适配 |
| `versionCode / versionName` | 20 / `2.0` | 每次发版必须递增，否则无法覆盖安装 |
| 构建 JDK | 21+（本机用 jdk-22） | Capacitor 8 编译要求，17 会报「无效源发行版」 |
| 签名 | `app/aihealth-release.jks`，alias `aihealth` | 密码存于 `keystore.properties`（不入库），**丢失则无法给老用户升级** |

`assembleRelease` 由 AGP 自动完成 zipalign 与 apksigner 签名，产物可用 `apksigner verify --print-certs` 校验（当前证书 `CN=Ai Health, O=AiHealth, C=CN`）。

### 7.3 静态托管建议

```nginx
location / { root /var/www/ai-health; try_files $uri $uri/ /index.html; }
location /assets/ { root /var/www/ai-health; expires 1y; add_header Cache-Control "public, immutable"; }
location = /index.html { root /var/www/ai-health; add_header Cache-Control "no-cache"; }
```

`assets/` 文件名带内容 hash，可永久缓存；`index.html` 必须 no-cache，否则发版后用户拿到旧壳、引用已删除的 js 会白屏。

---

## 8. 权限与安全适配

### 8.1 安卓权限清单（全部 `required=false` 的能力均可降级）

| 权限 | 生效范围 | 用途 | 缺失后果 |
|---|---|---|---|
| `INTERNET` | 全版本 | 登录、AI 解析 | 只能离线用本地功能 |
| `CAMERA` | 全版本 | 拍病历单 | 只能从相册选图 |
| `BLUETOOTH` / `BLUETOOTH_ADMIN` | `maxSdk=30` | Android 7–11 扫描连接 | 老系统连不上心率带 |
| `BLUETOOTH_SCAN` | 12+，`neverForLocation` | 扫描心率广播 | 搜不到设备 |
| `BLUETOOTH_CONNECT` | 12+ | 建立 GATT 连接 | 连接被拒 |
| `ACCESS_COARSE/FINE_LOCATION` | `maxSdk=30` | 兼容插件对旧系统的扫描校验 | 老系统扫描失败 |

`uses-feature` 把相机与 BLE 标为 `required="false"`，**没有摄像头或没有蓝牙的设备也能装**，只是对应功能置灰/提示，不阻断主流程。

这套组合是踩坑后定下来的：Android 12+ 会把带 `maxSdkVersion=30` 的定位权限过滤掉，但 BLE 插件初始化时把 `ACCESS_FINE_LOCATION` 当必需项校验，于是报
`Missing the following permissions in AndroidManifest.xml: ACCESS_FINE_LOCATION`。
解法是**两条腿**：补 `ACCESS_COARSE_LOCATION`（同样限 30）+ 初始化时声明 `androidNeverForLocation: true`（明确「扫描结果不用于定位」，从而在 12+ 免定位权限）。

### 8.2 密钥与访问控制

| 资产 | 存放位置 | 客户端可见性 |
|---|---|---|
| Supabase URL / publishable key | `.env` → 构建进 JS | 公开（设计如此，配合 RLS 使用） |
| Kimi API Key | Supabase Secrets | **永不下发** |
| `service_role` | 仅后台运维用 | **永不下发** |
| 档案数据 | 用户设备 localStorage | 仅本机 |

三道闸：客户端未登录就地拦截（不浪费请求）→ 边缘函数验 JWT（401）→ 查 `profiles` 的 `plan_status` / `trial_ends_at`（403）。`profiles` 表启用 RLS，用户只能读写自己那行，且 `with check` 限制不允许自行把 `plan_status` 改成 `paid`——升级只能走服务端。

---

## 9. 兼容性验证记录

| # | 验证项 | 环境 | 结果 |
|---|---|---|---|
| 1 | 注册即登录（关闭邮件确认后） | 网页 | ✅ 返回 access_token，触发器自动建 profile |
| 2 | 24h 体验申请，一人一次 | 网页 | ✅ `start_trial()` 服务端记时，重复调用不叠加 |
| 3 | 体验期内调用 AI | 体验账户 | ✅ HTTP 200 |
| 4 | 文字解析 | 实际体检摘要 | ✅ 识别 5 项指标 |
| 5 | 图片解析 | 病历单照片 | ✅ 识别 8 项指标 |
| 6 | 身体限制参与建议 | 档案填「左膝术后」 | ✅ 建议主动回避深蹲/跳跃类动作 |
| 7 | 桌面版式 | 1440×820 截图 | ✅ 三栏、圆环、卡片、右栏均正常，无资源 404 |
| 8 | 手机横屏版式 | 986×486 截图 | ✅ `Ai·健康` 单行、副标题单行、收起按钮不压字 |
| 9 | 浅/深色主题 | 网页 | ✅ CSS 变量切换，无硬编码色残留 |
| 10 | 网页蓝牙 | macOS Chrome | ✅ 可搜到并读取心率 |
| 11 | 安卓蓝牙 | 真机 | ⚠️ 权限与完整 UUID 已修复并打包，**需在真机复验**（此前报缺权限、UUID 格式两处错误） |
| 12 | APK 签名 | `apksigner verify` | ✅ 证书链有效，v1/v2 签名通过 |
| 13 | 覆盖安装 | 旧 debug 包 | ⚠️ 签名不同，**须先卸载旧版**再装 2.0 |

---

## 10. 已知限制与后续路线

| # | 限制 | 影响 | 处理建议 |
|---|---|---|---|
| 1 | 手机竖屏 <740px 横向滚动 | 竖屏不能直接用 | 设计定位为横屏看板；安卓已锁横屏 |
| 2 | 网页端蓝牙受浏览器限制 | Safari/Firefox 用不了心率 | 演示时网页用 Chrome，或改用 APK |
| 3 | 未处理 `env(safe-area-inset-*)` | 横屏刘海机型可能贴边 | 在 `.app-shell` 加左右 safe-area padding，一行改动 |
| 4 | Google Fonts 国内/离线不可达 | 字重回退，标题略粗 | 自托管 Noto Sans SC 子集 |
| 5 | 数据在 localStorage，清缓存即丢 | 换设备需手工迁移 | 已有导出/导入兜底；后续接云端同步 |
| 6 | 华为运动健康 API 仅预留 | 无法自动同步手表数据 | 已留 `source:'huawei'` 与 `huaweiClientId` 字段，接 OAuth 即可 |
| 7 | 缴费为演示按钮 | 无真实支付 | 接微信/支付宝商户号，或 Supabase 计费扩展 |
| 8 | iOS 未构建 | 只有安卓包 | 工程已兼容 `ios.contentInset: never`，`cap add ios` 后补蓝牙权限描述即可 |
| 9 | 无 Service Worker | 网页离线打不开 | APK 资源内置不受影响；网页端如需离线，加 PWA 预缓存 |
| 10 | 单一 Supabase 区域 | 跨境访问偶发延迟 | 关键路径已本地化，仅解析受限 |

**演进优先级建议**：① 真机复验 BLE → ② 云端档案同步（多设备一致）→ ③ 安全区与字体自托管（细节打磨）→ ④ 华为健康接入 → ⑤ iOS 构建。

---

## 附录 A · 版本清单

| 组件 | 版本 | 备注 |
|---|---|---|
| React / React DOM | 19.3.1 | 无 UI 框架、无状态库 |
| TypeScript | 5.9.3 | `strict`，构建前 `tsc -b` |
| Vite | 8.3.6 | `base: './'`，含 `/sb` 转发 |
| Capacitor | 8.6.0（core / cli / android） | 需 JDK 21+ |
| @capacitor/camera | 8.2.6 | 原生拍照 |
| @capacitor/filesystem | 8.1.5 | 导出到 Documents |
| @capacitor-community/bluetooth-le | 8.3.0 | 只接受 128 位 UUID |
| @supabase/supabase-js | 2.119.0 | Auth + RPC + Functions |
| gsap | 3.15.1 | 圆环与卡片进场 |
| lucide-react | 1.70.0 | 图标 |
| Android SDK | min 24 / compile 36 / target 36 | versionCode 20 |
| 模型 | `kimi-k2.6`（Moonshot 视觉） | 不接受自定义 temperature |
| 运行时 | Edge Function（Deno） | `analyze-report` |

## 附录 B · 关键文件索引

| 关注点 | 文件 |
|---|---|
| 平台判定与网络分流 | `src/lib/supabase.ts` |
| 双通道心率 | `src/lib/heart-rate.ts` |
| 双通道拍照与 AI 调用 | `src/components/ScanPage.tsx`、`src/lib/ai.ts` |
| 双通道导出 | `src/lib/store.ts` |
| 三栏与断点 | `src/styles.css` |
| 横屏与状态栏 | `android/app/src/main/AndroidManifest.xml`、`.../MainActivity.java` |
| 权限 | `android/app/src/main/AndroidManifest.xml` |
| 签名与版本 | `android/app/build.gradle`、`android/keystore.properties` |
| 服务端门禁 | `supabase/functions/analyze-report/index.ts` |
| 表结构与 RLS | `supabase/schema.sql`、`supabase/migrations/*.sql` |

---

*本文档描述的是 v2.0 的实际实现，与源代码逐项对照过；若后续改动超过 3 个适配点，建议同步更新第 3、4 章的矩阵。*
