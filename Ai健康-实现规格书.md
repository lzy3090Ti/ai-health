# Ai·健康 · 全量实现规格书 v2.0

> 用途：把现有产品逐模块拆成「可照着重建」的说明书。每一个页面、每一段算法、每一个颜色值、每一条服务端配置都在这里，附可复制的源代码。
>
> 阅读顺序建议：先看第 1 章拿全局，再按第 9 章的施工顺序动手，卡住时回查第 3～7 章。

---

## 目录

| 章节 | 内容 | 对应源码 |
|---|---|---|
| 1 | 产品定义与信息架构 | — |
| 2 | 技术栈、工程配置、目录结构 | `package.json` `vite.config.ts` `tsconfig.json` |
| 3 | 设计系统（配色、字体、间距、布局、断点） | `src/styles.css` |
| 4 | 数据模型 | `src/types.ts` |
| 5 | 业务算法（评分、区间、建议、解析、导出） | `src/data.ts` |
| 6 | 全局状态机与动画 | `src/App.tsx` |
| 7 | 十个 UI 模块逐个拆解 | `src/components/*.tsx` |
| 8 | 服务连接（Supabase / Kimi / WebDAV / BLE） | `src/lib/*` `supabase/*` |
| 9 | 从零重建的施工顺序与验收 | — |
| 10 | 十个坑位清单 | — |

---

## 1. 产品定义与信息架构

### 1.1 一句话

一个「个人健康档案 + 报告解析 + 0–100 健康率」的单页应用。**所有业务逻辑在客户端跑，云端只做身份、体验期校验和 AI 代理**。

### 1.2 页面结构（6 个页面，一个状态机切换）

```
app
├── OverviewPanel（左栏，可折叠）      ← 不是页面，是常驻侧栏
├── main-panel（中栏，页面切换区）
│   ├── dashboard  首页：健康率摘要 + 8 张指标卡 + 今日行动
│   ├── metric     二级页：单指标详情（折线 + 统计 + 录入 + 历史）
│   ├── scan       扫描：拍照/粘贴 → AI 整理 → 核对 → 归档
│   ├── records    我的数据：3 个 tab（指标 / 资料 / 建议）
│   ├── settings   设置：8 个分区
│   └── auth       登录注册
└── NavigationRail（右栏，竖排图标导航）
```

### 1.3 关键交互约束（做的时候必须守住）

1. **永远是横向三栏**，电脑和安卓都不切换成底部导航或竖排卡片。`body { min-width: 740px }` 兜底。
2. **左栏可折叠**：折叠后 `app-shell` 变成两列，中栏头部出现「Ai·健康」还原按钮。
3. **演示数据与真实数据物理隔离**：进入演示模式时把真实档案快照存进 `realVaultRef`，退出时还原；演示档案用独立的 `owner='demo'` 存储键，绝不写回用户档案。
4. **AI 只做「读报告」这一件事**。健康率、趋势判断、行动建议全部是本地规则，离线可用、结果稳定可解释。
5. **不写「数据来自手动记录与资料归档」这类说明性文案**，界面文案只保留结论与下一步动作。

---

## 2. 技术栈、工程配置、目录结构

### 2.1 依赖与版本（`package.json`）

```json
{
  "name": "health-agent",
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "tsc -b && vite build",
    "icons": "node scripts/generate-icons.mjs",
    "preview": "vite preview --host 0.0.0.0",
    "cap:sync": "npm run build && cap sync android",
    "android:build": "npm run cap:sync && cd android && ./gradlew assembleDebug"
  },
  "dependencies": {
    "@capacitor-community/bluetooth-le": "^8.3.0",
    "@capacitor/camera": "^8.2.6",
    "@capacitor/core": "^8.6.0",
    "@capacitor/filesystem": "^8.1.5",
    "@supabase/supabase-js": "^2.119.0",
    "gsap": "^3.15.1",
    "lucide-react": "^1.70.0",
    "react": "^19.3.1",
    "react-dom": "^19.3.1"
  },
  "devDependencies": {
    "@capacitor/android": "^8.6.0",
    "@capacitor/cli": "^8.6.0",
    "@vitejs/plugin-react": "^6.2.1",
    "https-proxy-agent": "^9.1.0",
    "sharp": "^0.35.5",
    "typescript": "~5.9.3",
    "vite": "^8.3.6"
  }
}
```

**为什么是这几个**：
- `lucide-react` 只用来取图标（线性、1.6–1.7 描边），不用任何 UI 框架，全部样式手写 CSS，避免被组件库的默认设计绑架。
- 图表**不引第三方库**，折线图是自绘 SVG（`TrendChart.tsx`，63 行），这样能精确控制坐标、渐变和入场动画。
- `gsap` 只做三件事：页面进场、卡片错峰、数字滚动。
- `sharp` 只在本地脚本里生成图标，不打进包。

### 2.2 Vite 配置（`vite.config.ts` 全文）

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { HttpsProxyAgent } from 'https-proxy-agent';

const SUPABASE_ORIGIN = process.env.SUPABASE_ORIGIN || 'https://earnolaubmnzhzumldqq.supabase.co';
const LOCAL_PROXY = process.env.LOCAL_PROXY === 'off' ? '' : process.env.LOCAL_PROXY || 'http://127.0.0.1:7890';

const relay = {
  target: SUPABASE_ORIGIN,
  changeOrigin: true,
  secure: true,
  rewrite: (path: string) => path.replace(/^\/sb/, ''),
  ...(LOCAL_PROXY ? { agent: new HttpsProxyAgent(LOCAL_PROXY) } : {}),
};

const proxy = { '/sb': relay } as unknown as Record<string, never>;

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: '0.0.0.0', allowedHosts: true, proxy },
  preview: { host: '127.0.0.1', proxy },
  build: { target: 'es2022' },
});
```

三处必须保留：
1. `base: './'` —— 产物用相对路径，静态托管放根目录或 `/health/` 子目录都能跑。
2. `/sb` 代理 —— 本机浏览器直连 `*.supabase.co` 会被中间网络 TLS reset，所以本地跑的时候把 `https://<project>.supabase.co` 映射成同源 `/sb`，由 Vite 用 `https-proxy-agent` 中转。线上域名自动直连，不依赖这一层。
3. `build.target: 'es2022'` —— 安卓 WebView（Chrome 内核）支持，产物更小。

### 2.3 TypeScript 配置要点（`tsconfig.json`）

```json
{
  "compilerOptions": {
    "target": "ES2022", "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext", "moduleResolution": "bundler",
    "jsx": "react-jsx", "strict": true,
    "noUnusedLocals": true, "noUnusedParameters": true,
    "noEmit": true, "verbatimModuleSyntax": true
  },
  "include": ["src", "capacitor.config.ts"]
}
```

`noUnusedLocals/Parameters` 打开意味着**不能留任何没用的 import 和变量**，否则 `tsc -b` 直接失败。这是刻意的：构建脚本 `npm run build` 先跑类型检查，类型不过就不出包。

### 2.4 目录结构（约 2 800 行）

```
web/
├── index.html                     # 挂载点 + title「Ai·健康」+ theme-color
├── vite.config.ts
├── capacitor.config.ts
├── package.json / tsconfig.json
├── .env                           # VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
├── public/
│   ├── app-icon.png               # 512×512，侧栏与登录页使用
│   └── favicon.png                # 64×64
├── scripts/generate-icons.mjs     # sharp 批量生成网页 + 安卓 mipmap 图标
├── src/
│   ├── main.tsx                   # createRoot
│   ├── App.tsx                    # 状态机、登录态、演示模式、GSAP 进场
│   ├── types.ts                   # 全部类型定义
│   ├── data.ts                    # 指标定义、评分、建议、解析、导出
│   ├── styles.css                 # 606 行，全部样式
│   ├── lib/
│   │   ├── store.ts               # 档案读写、导入导出、WebDAV、图片压缩
│   │   ├── supabase.ts            # 客户端初始化、profiles 读取、start_trial
│   │   ├── ai.ts                  # 调边缘函数 + 结果清洗
│   │   └── heart-rate.ts          # Web Bluetooth + 原生 BLE
│   └── components/
│       ├── OverviewPanel.tsx      # 左栏：品牌 + 健康率圆环 + 关键发现
│       ├── Dashboard.tsx          # 首页
│       ├── MetricDetail.tsx       # 指标二级页
│       ├── TrendChart.tsx         # 自绘 SVG 折线
│       ├── ScanPage.tsx           # 三步扫描流程
│       ├── RecordsPage.tsx        # 我的数据（3 tab）
│       ├── SettingsPage.tsx       # 设置（8 分区）
│       ├── AuthPage.tsx           # 登录注册
│       ├── NavigationRail.tsx     # 右侧竖排导航
│       ├── MetricIcon.tsx         # 8 个指标 → lucide 图标映射
│       └── HeartRateCapture.tsx   # 心率实时采集卡
├── supabase/
│   ├── schema.sql                 # 建表 + RLS + 触发器 + start_trial
│   ├── migrations/*.sql           # 同上 + GRANT 补丁
│   └── functions/analyze-report/index.ts   # Kimi 代理边缘函数
└── android/                       # Capacitor 8 壳
```

---

## 3. 设计系统（逐字拆解）

### 3.1 配色：五档红 + 语义色

主色板就是用户指定的五档红，用途严格区分，不许混用：

| 色值 | 名称 | 实际用途 |
|---|---|---|
| `#fff5f5` | 底 | 页面背景 `--bg`、左栏文字色 `--panel-text` |
| `#ffebee` | 浅底 | 卡片内浅底 `--surface-soft`、建议卡背景、输入框底色 |
| `#ffcdd2` | 描边 | 所有分隔线 `--line`、边框、圆环轨道 |
| `#ef9a9a` | 深色态主色 | 暗色主题下的 `--accent` |
| `#e57373` | 主色 | 左栏整块背景 `--panel-bg`、主按钮、强调文字、圆环进度 |

光只有五个红会糊成一团，所以补了四组语义色（都在同一色温里）：

| 变量 | 亮色值 | 暗色值 | 用途 |
|---|---|---|---|
| `--text` | `#432326` | `#fbeaea` | 正文主色（深红棕，不是纯黑） |
| `--muted` | `#8c5f63` | `#c79a9e` | 次要文字 |
| `--faint` | `#c09398` | `#8f666a` | 三级文字、日期、单位 |
| `--good` | `#2f9a66` | `#79c99a` | 状态「最优」、区间条、「已连接」 |
| `--amber` | `#e5a83b` | `#e6b85c` | 状态「偏低」（用琥珀不用黄，避免廉价感） |
| `--red` | `#e57373` | `#ef9a9a` | 状态「偏高」、错误提示 |
| `--lime` | `#ffffff` | `#ffcdd2` | 左栏上的高亮文字/进度环（红底上的白） |

### 3.2 完整 CSS 变量（照抄即可）

```css
.app {
  --bg: #fff5f5;
  --surface: #ffffff;
  --surface-soft: #ffebee;
  --text: #432326;
  --muted: #8c5f63;
  --faint: #c09398;
  --line: #ffcdd2;
  --accent: #e57373;
  --accent-soft: #ffebee;
  --lime: #ffffff;
  --amber: #e5a83b;
  --good: #2f9a66;
  --red: #e57373;
  --red-soft: #ffcdd2;
  --ring-track: rgba(255, 255, 255, .32);
  --panel-bg: #e57373;
  --panel-soft: rgba(255, 255, 255, .16);
  --panel-text: #fff5f5;
  --panel-muted: #ffcdd2;
  --shadow: 0 1px 2px rgba(120, 40, 45, .05);
  width: 100%;
  height: 100dvh;
  overflow: hidden;
  background: var(--bg);
  color: var(--text);
}

.app.theme-dark {
  --bg: #1d1214;
  --surface: #281a1c;
  --surface-soft: #332124;
  --text: #fbeaea;
  --muted: #c79a9e;
  --faint: #8f666a;
  --line: #4a2f33;
  --accent: #ef9a9a;
  --accent-soft: #43282c;
  --lime: #ffcdd2;
  --amber: #e6b85c;
  --good: #79c99a;
  --red: #ef9a9a;
  --red-soft: #43282c;
  --ring-track: rgba(255, 255, 255, .14);
  --panel-bg: #3a2124;
  --panel-soft: rgba(255, 255, 255, .07);
  --panel-text: #fbeaea;
  --panel-muted: #c79a9e;
  --shadow: 0 1px 2px rgba(0, 0, 0, .2);
}
```

**暗色不是把亮色反转**：红要往粉里退（`#ef9a9a`），底要往棕黑里压（`#1d1214` 而不是 `#111`），否则整屏发紫。

### 3.3 字体与字号阶梯

字体栈：`'Noto Sans SC'`（Google Fonts，300/400/500/600）→ `PingFang SC` → `Microsoft YaHei`。

```css
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;600&display=swap');
:root {
  font-family: 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}
```

字号全部手写 px（不用 rem 阶梯），因为这是「大数字 + 小字说明」的仪表盘式排版：

| 用途 | 字号 | 字重 | 字距 / 行高 |
|---|---|---|---|
| 首页主标题 h1 | `clamp(25px, 2.4vw, 34px)` | 500 | 0 / 1.35 |
| 二级页标题 h1 | 29px | 400 | — |
| 圆环中心数字 | 34px（窄屏 25px） | 500 | -1px |
| 指标卡数值 | 30px（窄屏 25px） | 500 | -0.5px |
| 二级页大数值 | 42px | 300 | -1px |
| 区块标题 h2 | 22px | 500 | — |
| 卡片标题 h2 | 18px | 500 | — |
| 正文 | 12px | 400 | 1.55–1.75 |
| 次要说明 | 10–11px | 400 | 1.6 |
| 日期 / 单位 / 标签 | 8–9px | 400 | — |
| 英文小标（kicker） | 10px | 500–600 | `letter-spacing: 2.5px` |
| 品牌名 | 22px（窄屏 19px） | 500 | 0.2px |
| 品牌副标题 | 8px | 400 | `letter-spacing: 2.4px` |

### 3.4 圆角 / 阴影 / 间距

```css
/* 圆角：小控件 8–11，卡片 17–18，大容器 20–22 */
.icon-button     { border-radius: 8px; }
.button          { border-radius: 12px; }
.metric-icon     { border-radius: 12px; }
.metric-card     { border-radius: 18px; }
.surface-card    { border-radius: 18px; }
.history-list    { border-radius: 16px; }
.document-modal  { border-radius: 20px; }

/* 阴影：几乎没有。仪表盘靠边框和留白分层，不靠投影 */
--shadow: 0 1px 2px rgba(120, 40, 45, .05);
.metric-card:hover { box-shadow: 0 10px 28px rgba(18, 54, 41, .06); }

/* 间距：页面 32/30/48，卡片 22，卡片间距 14–15 */
.page-content { padding: 32px 30px 48px; }
.surface-card { padding: 22px; }
.metric-list  { gap: 14px; }
```

对齐基准是 4 的倍数，唯一例外是 9/11/13 这类小间距（用于图标与文字的贴合）。

### 3.5 三栏布局（核心）

```css
html, body, #root { margin: 0; min-width: 740px; min-height: 100%; }
.app { height: 100dvh; overflow: hidden; }

.app-shell {
  display: grid;
  grid-template-columns: clamp(190px, 22vw, 272px) minmax(0, 1fr) 72px;
  width: 100%;
  min-width: 740px;
  height: 100%;
  transition: grid-template-columns .22s ease;   /* 折叠动画 */
}
.app-shell.overview-collapsed { grid-template-columns: minmax(0, 1fr) 72px; }

.main-panel { min-width: 0; height: 100%; overflow: auto; }   /* 只有中栏滚动 */
.overview-panel { height: 100%; overflow-y: auto; }
```

- 左列 **弹性 190～272px**，按视口 22% 自适应；右列固定 72px（窄屏 58px）。
- `minmax(0, 1fr)` 里的 `0` 很关键：不加的话中栏内容会把栅格撑破，横向出现滚动条。
- 折叠是改 `grid-template-columns`，配合 `transition` 自动补间，不需要测宽度。

### 3.6 响应式断点（只有三个）

```css
/* ① 超宽屏：放大留白与字号 */
@media (min-width: 1500px) {
  .page-content { max-width: 1180px; padding: 40px 38px 56px; }
  .overview-panel { padding: 32px 26px 24px; }
  .metric-card { padding: 22px 24px; }
  .trend-chart { height: 128px; }
}

/* ② 窄屏（手机横屏 986px 落在这里）：只缩尺寸，不改结构 */
@media (max-width: 1050px) {
  .app-shell { grid-template-columns: 190px minmax(0, 1fr) 58px; }
  .page-content { padding: 24px 20px 38px; }
  .brand { font-size: 19px; }              /* 必须写在文件最后，见坑位 #8 */
  .main-heading h1, .page-header h1 { font-size: 25px; }
  .button { min-height: 38px; padding: 0 13px; font-size: 11px; }
}

/* ③ 矮屏（横屏手机常见 486px 高）：压缩纵向留白 */
@media (max-height: 620px) {
  .overview-panel { padding-top: 16px; }
  .health-score-ring { width: 116px; height: 116px; margin-top: 14px; }
  .page-content { padding-top: 20px; }
  .rail-item { min-height: 83px; padding: 9px 0; }
}
```

**没有「手机竖屏 → 底部导航」这一档，这是产品决策**，不是遗漏。

---

## 4. 数据模型

整个应用的「数据库」就是一个 JSON 对象 `Vault`，存在 `localStorage`，可随时导出成文件。**没有服务端业务表**。

### 4.1 完整类型定义（`src/types.ts`）

```ts
export type MetricKey = 'weight' | 'waist' | 'heartRate' | 'hrv' | 'spo2' | 'sleep' | 'steps' | 'bodyFat';
export type PageKey = 'dashboard' | 'metric' | 'scan' | 'records' | 'settings' | 'auth';

export interface MetricDefinition {
  key: MetricKey;
  name: string;        // 体重
  shortName: string;   // 重（图标角标用）
  unit: string;        // kg
  decimals: number;    // 1
  min: number;         // 输入合法下限（校验用）
  max: number;         // 输入合法上限
  lowerBetter: boolean;// 越低越好？
  optimalMin: number;  // 区间下限
  optimalMax: number;  // 区间上限
  color: string;       // 该指标的专属色
  tip: string;         // 卡片上的「下一步」文案
}

export interface HealthRecord {
  id: string;
  date: string;                          // YYYY-MM-DD
  value: number;
  note: string;
  source: 'demo' | 'manual' | 'scan' | 'huawei' | 'ble';
}

export interface ExtractedMetric { key: MetricKey; name: string; unit: string; value: number; }

export interface HealthDocument {
  id: string; title: string; summary: string; advice: string;
  imagePath?: string; rawText: string; engine: string; createdAt: string;
  metrics: ExtractedMetric[];
}

export interface AISettings {
  webdavUrl: string; webdavUser: string; webdavPassword: string;
  huaweiClientId: string;    // 华为运动健康 API 预留位，目前不消费
}

export type SexKey = 'male' | 'female' | 'other';
export type LimitationKey = 'none' | 'lower' | 'upper' | 'vision' | 'cardio' | 'other';
export type GoalKey = 'fatLoss' | 'muscle' | 'maintain' | 'endurance' | 'rehab';
export type ActivityLevelKey = 'sedentary' | 'light' | 'moderate' | 'high';

/** 用户身体基础信息，会随报告一起交给 AI 作为分析前提 */
export interface UserProfile {
  name: string; height: number; age: number;
  sex: SexKey | ''; limitation: LimitationKey | ''; limitationNote: string;
  goal: GoalKey | ''; activityLevel: ActivityLevelKey | '';
}

export interface Vault {
  schemaVersion: 1;
  updatedAt: string;
  profile: UserProfile;
  activity: { targetSteps: number };
  settings: AISettings;
  documents: HealthDocument[];
  metrics: Record<MetricKey, HealthRecord[]>;
}

export interface AIResult { title: string; summary: string; metrics: ExtractedMetric[]; advice: string; engine: string; }
export interface Advice { id: string; tag: string; title: string; description: string; level: string; }
export interface HealthAssessment { score: number; keyIssue: string; summary: string; coverage: number; }
export interface AccountProfile {
  id: string; display_name: string;
  trial_started_at: string | null; trial_ends_at: string | null;
  plan_status: 'trial' | 'expired' | 'paid';
}
```

### 4.2 字段设计说明（几个必须理解的取舍）

| 字段 | 为什么这么设计 |
|---|---|
| `schemaVersion: 1` | 导入/升级时的闸门。`parseVault` 里校验 `schemaVersion !== 1` 直接抛「档案格式或版本不受支持」，避免旧结构串进来把界面打崩。 |
| `metrics` 用 `Record<MetricKey, HealthRecord[]>` | 8 个固定键 + 数组，不需要索引表；读取最新值就是排序后取末尾，O(n log n) 但 n 只有几十条。 |
| `source` 五值枚举 | 卡片、明细页、导出表格都要显示来源；`huawei` 是预留值，现在没有写入路径。 |
| `profile.limitation` + `limitationNote` | 决定建议是否走「下肢友好/上肢友好」分支，也拼进 AI 提示词。`none` 是默认值，不是空串。 |
| `updatedAt` | 每次写入自动刷新（`saveVault` 里覆盖），用于将来做冲突判断，目前只展示。 |
| 没有 `userId` 字段 | 归属靠 **存储键** 区分（`ai.health.vault.v2.<ownerId>`），档案本身跟账号解耦，换账号就是换一个键，导出/导入天然干净。 |

---

## 5. 业务算法（`src/data.ts`，269 行）

这一章是整个产品的「大脑」，全部是纯函数，无副作用、无网络。

### 5.1 八项指标定义表

```ts
export const METRICS: MetricDefinition[] = [
  { key: 'weight',    name: '体重',       shortName: '重', unit: 'kg',  decimals: 1, min: 25,  max: 250,    lowerBetter: true,  optimalMin: 18.5, optimalMax: 23.9, color: '#e46f51', tip: '固定晨起测量条件，用四周趋势调整饮食与力量训练。' },
  { key: 'waist',     name: '腰围',       shortName: '围', unit: 'cm',  decimals: 1, min: 35,  max: 180,    lowerBetter: true,  optimalMin: 60,   optimalMax: 85,   color: '#d99032', tip: '保持自然呼吸，在肚脐水平测量，结合力量训练改善体成分。' },
  { key: 'heartRate', name: '静息心率',   shortName: '心', unit: 'bpm', decimals: 0, min: 30,  max: 220,    lowerBetter: true,  optimalMin: 50,   optimalMax: 80,   color: '#d95c6a', tip: '优先稳定作息与有氧基础，疲劳时不要突然增加训练量。' },
  { key: 'hrv',       name: '心率变异性', shortName: '律', unit: 'ms',  decimals: 0, min: 5,   max: 250,    lowerBetter: false, optimalMin: 35,   optimalMax: 120,  color: '#8d73aa', tip: '观察个人长期基线，优先保证规律睡眠和恢复。' },
  { key: 'spo2',      name: '血氧饱和度', shortName: '氧', unit: '%',   decimals: 0, min: 70,  max: 100,    lowerBetter: false, optimalMin: 95,   optimalMax: 100,  color: '#358ba4', tip: '保持测量时静止；持续异常或伴随不适时请及时就医。' },
  { key: 'sleep',     name: '睡眠时长',   shortName: '眠', unit: 'h',   decimals: 1, min: 0,   max: 24,     lowerBetter: false, optimalMin: 7,    optimalMax: 9,    color: '#5979ad', tip: '固定起床时间，逐步靠近七到九小时的规律睡眠。' },
  { key: 'steps',     name: '运动步数',   shortName: '动', unit: '步',  decimals: 0, min: 0,   max: 100000, lowerBetter: false, optimalMin: 8000, optimalMax: 12000,color: '#3c8c6c', tip: '在现有步数上循序渐进，每周增幅不超过一成。' },
  { key: 'bodyFat',   name: '体脂率',     shortName: '脂', unit: '%',   decimals: 1, min: 2,   max: 70,     lowerBetter: true,  optimalMin: 8,    optimalMax: 22,   color: '#a06d43', tip: '每周安排力量训练，配合充足蛋白质与适度热量管理。' },
];
```

**双区间设计**：`min/max` 是「物理合法范围」（防手滑录 999 体重），`optimalMin/optimalMax` 是「个人最优区间」（判断状态用）。两者必须分开，否则一个 250kg 的合法值会被判成「偏高」却又在合法范围内，逻辑就乱了。

指标专属色刻意避开主色红：如果 8 个指标都用红，折线图和图标全部糊在一起。这组颜色是低饱和的「陶土 / 赭石 / 紫灰 / 蓝灰 / 苔绿」，跟红底同色温。

### 5.2 个人最优区间（会随身高/目标变化）

```ts
export function getOptimalRange(vault: Vault, definition: MetricDefinition) {
  if (definition.key === 'weight') {
    const factor = (vault.profile.height / 100) ** 2;        // BMI 反算体重
    return {
      min: 18.5 * factor,
      max: 23.9 * factor,
      label: `${(18.5 * factor).toFixed(1)}–${(23.9 * factor).toFixed(1)} ${definition.unit}`,
    };
  }
  if (definition.key === 'steps') {
    return {
      min: vault.activity.targetSteps,
      max: Math.round(vault.activity.targetSteps * 1.5),
      label: `≥ ${vault.activity.targetSteps.toLocaleString()} ${definition.unit}`,
    };
  }
  return { min: definition.optimalMin, max: definition.optimalMax,
           label: `${definition.optimalMin}–${definition.optimalMax} ${definition.unit}` };
}
```

这就是「个人最优区间」区别于普通健康 App 的地方：同样是 70kg，170cm 和 185cm 的用户区间不同；步数目标自己设，区间跟着目标走。

### 5.3 健康率评分（0–100，确定性规则）

**不是 AI 打分**，是「100 分起扣」。扣分表：

| 指标 | 触发条件 | 扣分 | 关键发现文案 | 建议 |
|---|---|---|---|---|
| 体重 | BMI < 18.5 或 > 23.9 | **16** | 最关键的是体重偏离个人目标区间 | 先稳定饮食结构，并用每周两次力量训练改善体成分 |
| 腰围 | > 85cm（男）/ > 80cm（女） | **16** | 最关键的是腰围偏高 | 以可持续的热量管理、轻快走和核心训练逐步改善 |
| 静息心率 | > 80 bpm | **12** | 最关键的是静息心率偏高 | 先安排低强度有氧与恢复，持续异常时请咨询医生 |
| HRV | < 35 ms | **10** | 最关键的是心率变异性偏低 | 优先固定睡眠时间，减少连续高强度训练 |
| 血氧 | < 95% | **24** | 最关键的是血氧指标偏低 | 请结合原始测量条件复核，持续异常或不适时及时就医 |
| 睡眠 | < 7h 或 > 9h | **12** | 最关键的是睡眠时长偏离目标 | 固定起床时间，逐步建立七到九小时的规律睡眠 |
| 体脂率 | > 22%（男）/ > 30%（女），或 < 8% | **20** | 最关键的是体脂率偏高 | 每周安排 2–3 次力量训练，配合轻快走和充足蛋白质 |
| 步数 | — | 不参与评分 | — | 只在「今日行动」里体现 |

```ts
export function getHealthAssessment(vault: Vault): HealthAssessment {
  const issues: Array<{ key: MetricKey; points: number; issue: string; advice: string }> = [];
  const addIf = (key: MetricKey, condition: boolean, points: number, issue: string, advice: string) => {
    if (latestRecord(vault, key) && condition) issues.push({ key, points, issue, advice });
  };
  const weight = latestRecord(vault, 'weight');
  const bmi = weight ? Number(weight.value) / (vault.profile.height / 100) ** 2 : null;
  const female = vault.profile.sex === 'female';
  const waistLimit = female ? 80 : 85;
  const bodyFatUpper = female ? 30 : 22;

  addIf('weight', bmi !== null && (bmi < 18.5 || bmi > 23.9), 16, '最关键的是体重偏离个人目标区间', '先稳定饮食结构，并用每周两次力量训练改善体成分');
  addIf('waist', Number(latestRecord(vault, 'waist')?.value ?? 0) > waistLimit, 16, '最关键的是腰围偏高', '以可持续的热量管理、轻快走和核心训练逐步改善');
  addIf('heartRate', Number(latestRecord(vault, 'heartRate')?.value ?? 65) > 80, 12, '最关键的是静息心率偏高', '先安排低强度有氧与恢复，持续异常时请咨询医生');
  addIf('hrv', Number(latestRecord(vault, 'hrv')?.value ?? 45) < 35, 10, '最关键的是心率变异性偏低', '优先固定睡眠时间，减少连续高强度训练');
  addIf('spo2', Number(latestRecord(vault, 'spo2')?.value ?? 98) < 95, 24, '最关键的是血氧指标偏低', '请结合原始测量条件复核，持续异常或不适时及时就医');
  addIf('sleep', (() => { const v = Number(latestRecord(vault, 'sleep')?.value ?? 8); return v < 7 || v > 9; })(), 12, '最关键的是睡眠时长偏离目标', '固定起床时间，逐步建立七到九小时的规律睡眠');
  addIf('bodyFat', (() => { const v = Number(latestRecord(vault, 'bodyFat')?.value ?? 18); return v > bodyFatUpper || v < 8; })(), 20, '最关键的是体脂率偏高', '每周安排 2–3 次力量训练，配合轻快走和充足蛋白质逐步降低体脂率');

  const coverage = METRICS.filter((d) => latestRecord(vault, d.key)).length;
  if (!coverage) return { score: 0, keyIssue: '等待建立健康基线', summary: '完成一项测量或上传健康资料后生成评分', coverage };

  issues.sort((a, b) => b.points - a.points);                 // 扣分最多的排最前
  const score = Math.max(0, Math.min(100, 100 - issues.reduce((t, i) => t + i.points, 0)));
  if (!issues.length) return { score: 100, keyIssue: '已记录指标均在个人目标区间', summary: '保持当前饮食、训练与恢复节奏', coverage };
  return { score, keyIssue: issues[0].issue, summary: issues[0].advice, coverage };
}
```

**规则细节，重建时别漏**：
1. `addIf` 的第一件事是 `latestRecord(vault, key)` 存在性判断——**没记录过就不扣分，也不出结论**，所以新用户是「0 分 / 等待建立健康基线」而不是「100 分」。
2. 血氧扣 24 分是最高权重：它是唯一可能提示急症的指标，界面文案也直接引导就医。
3. `issues` 按扣分降序排，左栏「关键发现」永远显示**扣分最多**那条的原因 + 针对性建议，而不是笼统总结。
4. 全部达标的档案返回 100 分并给「保持当前节奏」，这是唯一会显示满环的状态（`ring-closed` class）。
5. `coverage` = 有记录的指标数，左栏显示 `3/8 项指标已覆盖`，用来提示用户「分数低可能只是数据少」。

**算例**（演示档案：男，176cm，66.8kg，腰围 79，心率 70，HRV 45，血氧 98，睡眠 7.5，体脂 23.2）：
- BMI = 66.8 / 1.76² = 21.6 → 在 18.5–23.9，不扣；
- 腰围 79 ≤ 85，不扣；心率 70 ≤ 80，不扣；HRV 45 ≥ 35，不扣；血氧 98，不扣；睡眠 7.5 在区间内，不扣；
- 体脂 23.2 > 22（男）→ 扣 20；
- **得分 80**，关键发现「最关键的是体脂率偏高」，建议「每周 2–3 次力量训练…」。
- 这正是界面上那个 80% 圆环的来源。

### 5.4 单指标趋势分析（文案是算出来的，不是写死的）

```ts
export function getMetricAnalysis(vault: Vault, definition: MetricDefinition) {
  const records = sortRecords(vault.metrics[definition.key]);
  const latest = records.at(-1) ?? null;
  const previous = records.at(-2) ?? null;
  const value = latest ? Number(latest.value) : null;
  const delta = latest && previous ? Number(latest.value) - Number(previous.value) : 0;

  // 变化小于「最小刻度的一半」就算持平，避免 0.0 的假波动
  const stable = Math.abs(delta) < 10 ** -definition.decimals / 2;
  // lowerBetter 的指标，下降才算改善
  const improved = previous ? (definition.lowerBetter ? delta < 0 : delta > 0) : true;
  const range = getOptimalRange(vault, definition);

  let status: 'empty' | 'optimal' | 'low' | 'high' = 'empty';
  if (value !== null) status = value < range.min ? 'low' : value > range.max ? 'high' : 'optimal';

  let analysis = '等待首次测量';
  if (latest && previous && stable) analysis = '近阶段保持平稳';
  if (latest && previous && !stable) analysis = `较上期${delta > 0 ? '上升' : '下降'} ${Math.abs(delta).toFixed(definition.decimals)} ${definition.unit}${improved ? '，趋势向好' : '，继续观察'}`;
  if (latest && !previous) analysis = '已建立首条个人基线';

  return { value, latest, previous, records, analysis, improved, range, status, delta };
}
```

四种状态映射到 UI：

| status | 卡片顶边 | 状态胶囊 | 颜色 |
|---|---|---|---|
| `optimal` | `border-top: 3px solid var(--good)` | 最优 | 绿 `#e5f3e8` 底 |
| `low` | `border-top: 3px solid var(--amber)` | 偏低 | 琥珀 `#f8efd9` 底 |
| `high` | `border-top: 3px solid var(--red)` | 偏高 | 红 `#ffcdd2` 底 |
| `empty` | `border-top: 3px solid var(--line)` | 未记录 | 浅灰 |

### 5.5 今日活动（步数进度 + 一句评估）

```ts
export function getDaily(vault: Vault) {
  const currentSteps = Number(latestRecord(vault, 'steps')?.value ?? 0);
  const targetSteps = vault.activity.targetSteps || 8000;
  const progress = Math.min(100, Math.max(0, Math.round((currentSteps / targetSteps) * 100)));
  const sleep = Number(latestRecord(vault, 'sleep')?.value ?? 8);
  let evaluation = '从轻松步行开始，建立今天的活动节奏。';
  if (progress >= 100) evaluation = '今日活动目标已完成，注意拉伸与补水。';
  else if (sleep < 7) evaluation = '昨晚恢复不足，今天适合轻量活动。';
  else if (progress >= 70) evaluation = '再完成一小段步行即可接近今日目标。';
  return { progress, currentSteps, targetSteps, remainingSteps: Math.max(0, targetSteps - currentSteps), evaluation, closed: progress >= 100 };
}
```

判断优先级：**已完成 > 睡眠不足 > 接近目标 > 默认**。睡眠不足会压过 70% 进度，因为恢复优先级高于凑步数——这是产品态度，不是随手写的。

### 5.6 行动建议生成（含身体限制适配）

```ts
export function generateAdvice(vault: Vault): Advice[] {
  const daily = getDaily(vault);
  const sleep = Number(latestRecord(vault, 'sleep')?.value ?? 8);
  const heart = Number(latestRecord(vault, 'heartRate')?.value ?? 70);
  const limitation = vault.profile.limitation || 'none';
  const note = vault.profile.limitationNote ? `（${vault.profile.limitationNote}）` : '';
  const noLegLoad = limitation === 'lower' || limitation === 'cardio';
  const noArmLoad = limitation === 'upper';

  const strength = noLegLoad
    ? { title: '安排 2 次坐姿力量训练', description: `坐姿抬腿、弹力带上肢划船各两组，避开站立负重${note}，组间充分休息。`, level: '关节友好' }
    : noArmLoad
      ? { title: '安排 2 次下肢主导训练', description: `椅子深蹲、臀桥各两组，器械辅助替代上肢负重${note}，组间充分休息。`, level: '循序渐进' }
      : heart > 80
        ? { title: '先进行呼吸与活动度训练', description: '静息心率偏高时先观察恢复，若持续异常请咨询医生。', level: '循序渐进' }
        : { title: '安排 2 次基础力量训练', description: '深蹲、推墙俯卧撑、臀桥各两组，组间充分休息。', level: '循序渐进' };

  const walk = noLegLoad
    ? { title: daily.closed ? '舒缓拉伸 12 分钟' : `上肢循环训练 ${Math.max(10, Math.ceil(daily.remainingSteps / 1000) * 6)} 分钟`,
        description: `以坐姿或卧姿完成上肢与核心动作替代步行${note}，避免下肢负荷。`, level: '低强度' }
    : { title: daily.closed ? '舒缓拉伸 12 分钟' : `轻快走 ${Math.max(10, Math.ceil(daily.remainingSteps / 1000) * 8)} 分钟`,
        description: daily.closed ? '目标已完成，以髋部、腿后侧和肩颈放松为主。' : `以能正常说话的强度完成，剩余约 ${daily.remainingSteps} 步，不必一次走完。`, level: '低至中强度' };

  return [
    { id: 'walk', tag: '今日运动', ...walk },
    { id: 'recover', tag: '恢复建议', title: sleep < 7 ? '今晚提前 30 分钟休息' : '保持当前入睡节奏',
      description: sleep < 7 ? '减少睡前屏幕刺激，避免用高强度运动弥补疲劳。' : '继续固定起床时间，让睡眠和 HRV 形成稳定基线。', level: '恢复优先' },
    { id: 'strength', tag: '本周计划', ...strength },
  ];
}
```

**分支矩阵（照着这张表实现就不会漏）**：

| 用户情况 | 今日运动 | 本周计划 |
|---|---|---|
| 无限制 | 轻快走 N 分钟（N = 剩余步数/1000 向上取整 × 8，最少 10） | 基础力量：深蹲、推墙俯卧撑、臀桥各两组 |
| 下肢受限 / 心肺受限 | 上肢循环训练 N 分钟（×6，最少 10） | 坐姿力量：坐姿抬腿、弹力带上肢划船 |
| 上肢受限 | 轻快走 N 分钟 | 下肢主导：椅子深蹲、臀桥 |
| 无限制但静息心率 > 80 | 轻快走（同上） | 呼吸与活动度训练 |
| 步数已达标（任何情况） | 舒缓拉伸 12 分钟 | 不变 |

首页只取前 2 条（`generateAdvice(vault).slice(0, 2)`），「我的数据 → 运动建议」页展示全部 3 条。

### 5.7 演示档案（`createSeedVault`）

```ts
function seedRecords(key: MetricKey, values: number[]): HealthRecord[] {
  const days = [35, 28, 21, 14, 7, 0];          // 六个时间点，跨度 5 周
  return values.map((value, index) => ({
    id: uid(key), date: dateBefore(days[index]), value,
    note: index === values.length - 1 ? '最近一次记录' : '',
    source: 'demo',
  }));
}

export function createSeedVault(): Vault {
  const vault = createEmptyVault();
  vault.profile = { ...EMPTY_PROFILE, name: '演示健康档案', age: 31, sex: 'male', limitation: 'none', goal: 'fatLoss', activityLevel: 'light', height: 176 };
  vault.metrics = {
    weight:    seedRecords('weight',    [68.8, 68.4, 68.1, 67.6, 67.2, 66.8]),
    waist:     seedRecords('waist',     [82, 81.4, 80.8, 80.2, 79.6, 79]),
    heartRate: seedRecords('heartRate', [78, 76, 75, 73, 72, 70]),
    hrv:       seedRecords('hrv',       [36, 38, 41, 40, 43, 45]),
    spo2:      seedRecords('spo2',      [96, 97, 97, 98, 98, 98]),
    sleep:     seedRecords('sleep',     [6.4, 6.8, 7, 6.9, 7.3, 7.5]),
    steps:     seedRecords('steps',     [5100, 6200, 5800, 7100, 6800, 5600]),
    bodyFat:   seedRecords('bodyFat',   [25.2, 24.8, 24.4, 24, 23.6, 23.2]),
  };
  return vault;
}
```

造数原则：**每条曲线都要有可见趋势但不夸张**。体重 5 周降 2kg、体脂 25.2→23.2、HRV 36→45，这样折线图有形状、评分有扣分项（体脂仍超 22），演示时既有「改善」也有「待办」。

### 5.8 演示模式的本地解析（不联网的正则兜底）

```ts
export function analyzeTextLocally(text: string): AIResult {
  const rules: Array<[MetricKey, RegExp]> = [
    ['weight',    /体重[^0-9]{0,8}([0-9]+(?:\.[0-9]+)?)/i],
    ['waist',     /腰围[^0-9]{0,8}([0-9]+(?:\.[0-9]+)?)/i],
    ['heartRate', /(?:静息)?心率[^0-9]{0,8}([0-9]+(?:\.[0-9]+)?)/i],
    ['hrv',       /(?:HRV|心率变异性)[^0-9]{0,8}([0-9]+(?:\.[0-9]+)?)/i],
    ['spo2',      /(?:血氧|SpO2)[^0-9]{0,8}([0-9]+(?:\.[0-9]+)?)/i],
    ['sleep',     /睡眠(?:时长)?[^0-9]{0,8}([0-9]+(?:\.[0-9]+)?)/i],
    ['steps',     /(?:步数|运动步数)[^0-9]{0,8}([0-9]+(?:\.[0-9]+)?)/i],
    ['bodyFat',   /体脂(?:率)?[^0-9]{0,8}([0-9]+(?:\.[0-9]+)?)/i],
  ];
  const metrics: ExtractedMetric[] = [];
  rules.forEach(([key, pattern]) => {
    const match = text.match(pattern);
    if (!match) return;
    const definition = metricByKey(key);
    const value = Number(match[1]);
    if (value >= definition.min && value <= definition.max)
      metrics.push({ key, name: definition.name, unit: definition.unit, value });
  });
  return {
    title: `健康资料 ${today()}`,
    summary: metrics.length ? `整理出 ${metrics.length} 项指标` : '未识别到指标，可手动补充',
    metrics,
    advice: '保持规律作息与轻量活动；异常指标请结合原始报告咨询医生。',
    engine: '演示解析',
  };
}
```

`[^0-9]{0,8}` 是关键：允许「体重 **为** 66.5」这种中间隔几个汉字的情况，但不能跨太远（8 字符），否则会把下一项的数字抢过来。匹配到数字后**必须再跑一遍 min/max 校验**，否则「体重 180」这种（可能是斤）会污染档案。

### 5.9 导出格式（双份：JSON + Obsidian 风格 Markdown）

```ts
export function toMarkdown(vault: Vault) {
  const lines = ['---', 'schema: health-vault/v1', `updated: ${new Date().toISOString()}`,
    `height_cm: ${vault.profile.height}`, `target_steps: ${vault.activity.targetSteps}`, '---', '',
    '# 我的健康档案', '', '> 健康建议不替代医疗诊断。', ''];
  METRICS.forEach((definition) => {
    lines.push(`## ${definition.name}（${definition.unit}）`, '', '| 日期 | 数值 | 来源 | 备注 |', '| --- | ---: | --- | --- |');
    sortRecords(vault.metrics[definition.key]).forEach((record) =>
      lines.push(`| ${record.date} | ${record.value} | ${record.source} | ${(record.note || '').replace(/\|/g, '／')} |`));
    lines.push('');
  });
  lines.push('## 资料索引', '');
  vault.documents.forEach((document) => lines.push(`- ${document.createdAt.slice(0, 10)} · ${document.title}：${document.summary}`));
  return lines.join('\n');
}
```

- YAML front matter 里放 `height_cm` / `target_steps`，是为了这份 .md 丢进 Obsidian 后能被 Dataview 查询。
- 备注里的 `|` 一律替换成全角 `／`，否则会把 Markdown 表格劈坏。
- 导出时**同时**给两份文件：`health.vault.json`（可回传导入）+ `健康档案.md`（可读、可分享）。

---

## 6. 全局状态机（`src/App.tsx`，195 行）

### 6.1 状态清单

| 状态 | 类型 | 初值 | 作用 |
|---|---|---|---|
| `user` | `User \| null` | `null` | Supabase 登录用户 |
| `profile` | `AccountProfile \| null` | `null` | 云端档案（体验期/会员状态） |
| `vault` | `Vault` | `loadVault()` | 本地健康档案（核心数据） |
| `vaultOwner` | `string` | `'guest'` | 当前档案归属键，`guest` / 用户 id / `demo` |
| `page` | `PageKey` | `'dashboard'` | 页面状态机 |
| `selectedMetric` | `MetricKey` | `'weight'` | 二级页显示哪个指标 |
| `overviewVisible` | `boolean` | `true` | 左栏展开/折叠 |
| `theme` | `'light' \| 'dark'` | `loadTheme()` | 主题 |
| `demoMode` | `boolean` | `false` | 是否演示模式 |
| `toast` | `string` | `''` | 底部提示 |

导航只有两个入口，其它一律走 props 回调：

```ts
function navigate(next: PageKey) { setPage(next); if (next !== 'dashboard') setOverviewVisible(true); }
function openMetric(key: MetricKey) { setSelectedMetric(key); setPage('metric'); setOverviewVisible(true); }
```

### 6.2 四条持久化 effect（顺序和行为都要对上）

```ts
// ① 档案写入：演示模式下绝不写盘；归属键与当前用户不一致时也跳过（防止串档）
useEffect(() => {
  if (!demoMode && vaultOwner === ownerId) saveVault(vault, user?.id);
}, [vault, vaultOwner, ownerId, demoMode, user?.id]);

// ② 主题：写 localStorage + 改 color-scheme + 同步移动端地址栏颜色
useEffect(() => {
  saveTheme(theme);
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#1d1214' : '#fff5f5');
}, [theme]);

// ③ 登录态：先取 session，再订阅变化
useEffect(() => {
  if (!isSupabaseConfigured || !supabase) return;
  let mounted = true;
  supabase.auth.getSession().then(({ data }) => { if (mounted) setUser(data.session?.user ?? null); });
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
  return () => { mounted = false; subscription.unsubscribe(); };
}, []);

// ④ 账号变化 → 换档案 + 退出演示模式
useEffect(() => {
  realVaultRef.current = null;
  setDemoMode(false);
  setVault(loadVault(user?.id));
  setVaultOwner(ownerId);
}, [ownerId, user?.id]);
```

`mounted` 标志是必须的：Supabase 的 `getSession` 是异步的，用户快速切换页面时组件可能已卸载，直接 `setUser` 会警告。

### 6.3 演示模式的数据隔离（最容易做错的地方）

```ts
const realVaultRef = useRef<{ owner: string; vault: Vault } | null>(null);

function setDemo(enabled: boolean) {
  if (enabled) {
    if (!demoMode) {
      if (vaultOwner === ownerId) saveVault(vault, user?.id);      // 先落盘真实档案
      realVaultRef.current = { owner: ownerId, vault };           // 再存内存快照
    }
    setDemoMode(true);
    setVault(createSeedVault());     // 换成演示数据
    setVaultOwner('demo');           // 归属改为 demo，写入 effect 会自动跳过
    setPage('dashboard');
    setOverviewVisible(true);
    notify('已进入演示模式');
    return;
  }
  const snapshot = realVaultRef.current;
  setDemoMode(false);
  setVault(snapshot?.owner === ownerId ? snapshot.vault : loadVault(user?.id));
  setVaultOwner(ownerId);
  setPage('dashboard');
  setOverviewVisible(true);
  notify('已退出演示模式');
}
```

三层保护缺一不可：
1. 进入前 `saveVault` 落盘，避免「在演示模式下关掉 App 导致真实数据丢失」；
2. `vaultOwner='demo'` 让写入 effect 的 `vaultOwner === ownerId` 判断失败，**演示期间的任何录入都不会落盘**；
3. 退出时**优先用内存快照**还原（保留未保存的编辑），快照归属不匹配才回退读盘。

### 6.4 三个写数据函数

```ts
// 手动录入 / 心率录入
function addRecord(key: MetricKey, value: number, date: string, note: string, source: HealthRecord['source'] = 'manual') {
  setVault((current) => ({
    ...current,
    metrics: { ...current.metrics, [key]: [...current.metrics[key], { id: uid(key), value, date, note, source }] },
  }));
  notify(`${metricByKey(key).name}已保存`);
}

// 扫描归档：一次写入「一份资料 + N 条指标记录」
function archive(result: AIResult, metrics: ExtractedMetric[], image: string, transcript: string) {
  const createdAt = new Date().toISOString();
  const document = { id: uid('document'), title: result.title, summary: result.summary, advice: result.advice,
                     imagePath: image, rawText: transcript, engine: result.engine, createdAt, metrics };
  setVault((current) => {
    const nextMetrics = { ...current.metrics };
    metrics.forEach((metric) => {
      nextMetrics[metric.key] = [...nextMetrics[metric.key],
        { id: uid(metric.key), date: today(), value: metric.value, note: result.title, source: 'scan' }];
    });
    return { ...current, metrics: nextMetrics, documents: [document, ...current.documents] };
  });
}

// 设置页保存：顺带处理「体重」这条特殊数据
function saveSettings(settings: AISettings, targetSteps: number, profile: UserProfile, weight: number | null) {
  setVault((current) => {
    let metrics = current.metrics;
    if (weight && Number.isFinite(weight)) {
      const records = current.metrics.weight;
      const todayRecord = records.find((record) => record.date === today());
      if (!todayRecord) {
        metrics = { ...current.metrics, weight: [...records, { id: uid('weight'), date: today(), value: weight, note: '设置页录入', source: 'manual' }] };
      } else if (Number(todayRecord.value) !== weight) {
        metrics = { ...current.metrics, weight: records.map((record) => record.id === todayRecord.id ? { ...record, value: weight, note: '设置页录入', source: 'manual' } : record) };
      }
    }
    return { ...current, settings, activity: { targetSteps }, profile, metrics };
  });
}
```

`saveSettings` 里的体重逻辑值得单独讲：设置页填的体重**不是**独立字段，而是当天的一条记录。今天已有记录就覆盖、没有就新增，这样「设置页填 68.5」和「首页记一笔 68.5」在数据层是同一件事，不会出现两个体重来源打架。

### 6.5 页面进场动画（GSAP）

```ts
useEffect(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;   // 尊重系统设置
  const context = gsap.context(() => {
    gsap.fromTo('.page-content', { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.52, ease: 'power3.out' });
    if (page === 'dashboard')
      gsap.fromTo('.metric-card', { autoAlpha: 0, y: 22 }, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.055, ease: 'power3.out' });
  });
  return () => context.revert();     // 卸载时回收，避免动画残留
}, [page, selectedMetric]);
```

用 `gsap.context()` + `revert()` 而不是手动 `kill`，是因为卡片是循环渲染的，二次进场时手动选择器容易漏。`stagger: 0.055` 是 8 张卡全部落位约 0.44 秒，再快会晕、再慢显得卡。

### 6.6 Toast

```ts
function notify(message: string) {
  setToast(message);
  if (toastTimer.current) clearTimeout(toastTimer.current);
  toastTimer.current = setTimeout(() => setToast(''), 3200);
}
```

```css
.toast {
  position: fixed; z-index: 100; right: 88px; bottom: 24px;   /* 88px 让开右侧 72px 导航栏 */
  display: flex; max-width: 440px; align-items: center; gap: 8px;
  padding: 12px 17px; border: 1px solid var(--line); border-radius: 12px;
  background: var(--surface); box-shadow: 0 15px 45px rgba(0, 0, 0, .15);
  font-size: 11px; animation: toast-in .2s ease-out;
}
@keyframes toast-in { from { opacity: 0; transform: translateY(8px); } }
```

### 6.7 根节点结构

```tsx
<div className={`app ${theme === 'dark' ? 'theme-dark' : ''} ${demoMode ? 'demo-mode' : ''}`}>
  <div className={`app-shell ${overviewVisible ? '' : 'overview-collapsed'}`}>
    {overviewVisible && <OverviewPanel vault={vault} demoMode={demoMode} signedIn={Boolean(user)} onCollapse={() => setOverviewVisible(false)} />}
    <main className="main-panel">
      {page === 'dashboard' && <Dashboard ... />}
      {page === 'metric' && <MetricDetail key={selectedMetric} ... />}
      {page === 'scan' && <ScanPage ... />}
      {page === 'records' && <RecordsPage ... />}
      {page === 'settings' && <SettingsPage ... />}
      {page === 'auth' && <AuthPage ... />}
    </main>
    <NavigationRail activePage={page} theme={theme} onNavigate={navigate} onToggleTheme={...} />
  </div>
  {toast && <div className="toast" role="status"><CheckCircle2 size={18} />{toast}</div>}
</div>
```

`<MetricDetail key={selectedMetric} />` 的 `key` 是刻意的：切换指标时强制重挂载，清空表单里的残留输入和展开状态，省掉一堆 `useEffect` 重置逻辑。

---

## 7. 十个 UI 模块逐个拆解

### 7.1 OverviewPanel（左栏，红底）

**职责**：品牌区 + 健康率圆环 + 关键发现 + 两个小统计 + 档案归属提示。

**结构**：

```tsx
<aside className="overview-panel">
  <div className="brand-row">
    <div className="brand-lockup">
      <img src="/app-icon.png" alt="Ai·健康" />
      <div><span className="brand">Ai·健康</span><span className="brand-subtitle">PERSONAL HEALTH</span></div>
    </div>
    <button className="icon-button collapse-button" onClick={onCollapse} aria-label="收起总览"><PanelLeftClose size={19} /></button>
  </div>

  <section className="ring-section">
    <div className="panel-label"><span>综合健康率</span><span className="live-label">0–100</span></div>
    <div className={`health-score-ring ${assessment.score >= 100 ? 'ring-closed' : ''}`}>
      <svg viewBox="0 0 128 128" role="img" aria-label={`综合健康率 ${assessment.score}%`}>
        <circle className="score-track" cx="64" cy="64" r={RADIUS} />
        <circle ref={circleRef} className="score-progress" cx="64" cy="64" r={RADIUS}
                strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE * (1 - assessment.score / 100)} />
      </svg>
      <div className="ring-inner"><strong>{displayScore}<small>%</small></strong><span>健康率</span></div>
    </div>
    <div className="score-caption"><strong>{assessment.coverage}/8</strong><span>项指标已覆盖</span></div>
  </section>

  <section className="evaluation-section">
    <div className="panel-label"><span>关键发现</span>{demoMode && <span className="soft-badge">演示</span>}</div>
    <strong className="key-issue">{assessment.keyIssue}</strong>
    <p>{assessment.summary}</p>
  </section>

  <div className="mini-stats">
    <div><strong>{getBMI(vault)}</strong><span>当前 BMI</span></div>
    <div><strong>{vault.documents.length}</strong><span>健康资料</span></div>
  </div>
  <div className="local-note"><span />{demoMode ? '演示档案' : signedIn ? '账户档案' : '本机档案'}</div>
</aside>
```

**SVG 圆环的数学（必须算对）**：

```ts
const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;   // ≈ 326.73

// 进度 = 周长 × (1 - 分数/100)
const targetOffset = CIRCUMFERENCE * (1 - assessment.score / 100);
```

- `viewBox="0 0 128 128"` 中心在 `(64,64)`，半径 52 给 9px 描边留了空间（52 + 4.5 = 56.5 < 64）。
- 圆环旋转靠 CSS：`.health-score-ring svg { transform: rotate(-90deg) }`，让 0 度从 12 点开始。
- 满环时 `.ring-closed` 把 `stroke-linecap` 从 `round` 改成 `butt`，否则首尾叠加会鼓出一个包。

**数字滚动（GSAP 补间一个普通对象，不补间 DOM）**：

```ts
const animatedValue = useRef(assessment.score);
const [displayScore, setDisplayScore] = useState(assessment.score);

useEffect(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const targetOffset = CIRCUMFERENCE * (1 - assessment.score / 100);
  if (reduced) {
    circleRef.current?.style.setProperty('stroke-dashoffset', String(targetOffset));
    animatedValue.current = assessment.score;
    setDisplayScore(assessment.score);
    return;
  }
  const counter = { value: animatedValue.current };
  const tween = gsap.to(counter, {
    value: assessment.score, duration: 1.15, ease: 'power3.out',
    onUpdate: () => { animatedValue.current = counter.value; setDisplayScore(Math.round(counter.value)); },
  });
  gsap.to(circleRef.current, { strokeDashoffset: targetOffset, duration: 1.15, ease: 'power3.out' });
  return () => { tween.kill(); gsap.killTweensOf(circleRef.current); };
}, [assessment.score]);
```

`animatedValue` 记录上一帧的值，所以 80 → 92 是从 80 滚到 92，而不是每次从 0 重来。

**左栏专属样式（红底白字，覆盖通用卡片样式）**：

```css
.overview-panel { border-right: 0; background: var(--panel-bg); color: var(--panel-text); }
.overview-panel .panel-label, .overview-panel .mini-stats span, .overview-panel .local-note { color: var(--panel-muted); }
.brand-lockup { display: flex; align-items: center; gap: 9px; flex: 1; min-width: 0; }
.brand-lockup img { width: 35px; height: 35px; border-radius: 11px; background: #ffd0d2; }
.brand { font-size: 22px; font-weight: 500; letter-spacing: .2px; white-space: nowrap; }
.brand-subtitle { color: var(--panel-muted); font-size: 8px; letter-spacing: 2.4px; }

.health-score-ring { position: relative; width: 150px; height: 150px; margin-top: 22px; }
.health-score-ring svg { width: 100%; height: 100%; overflow: visible; transform: rotate(-90deg); }
.health-score-ring circle { fill: none; }
.score-track { stroke: var(--ring-track); stroke-width: 9; }
.score-progress { stroke: var(--lime); stroke-width: 9; stroke-linecap: round; }
.health-score-ring .ring-inner { position: absolute; inset: 15px; background: transparent; color: var(--panel-text); }
.health-score-ring .ring-inner strong { font-size: 34px; font-weight: 500; }

.key-issue { display: block; margin-top: 11px; color: var(--panel-text); font-size: 13px; font-weight: 500; line-height: 1.55; }
.soft-badge { padding: 3px 8px; border-radius: 20px; background: var(--panel-soft); color: var(--lime); font-size: 9px; }
```

**品牌行必须用 grid，不能用 flex + space-between**：

```css
.brand-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: 8px; }
```

原因：`flex` + `justify-content: space-between` 时，文字块（`white-space: nowrap`）不肯收缩，窄栏下会直接压到右上角折叠按钮上。grid 的第一列 `minmax(0, 1fr)` 强制文字列可收缩，按钮固定占第二列，永远不会重叠。

### 7.2 Dashboard（首页）

**三段式**：头部（日期 + 两个动作按钮）→ 指标卡列表（8 张）→ 今日行动（2 张建议卡）。

```tsx
<header className="main-header">
  <div className="main-heading">
    {!overviewVisible && <button className="open-overview" onClick={onShowOverview}><PanelLeftOpen size={17} />Ai·健康</button>}
    <span className="section-kicker">TRACK YOUR HEALTH</span>
    <h1>看见身体的每一步变化。</h1>
    <p>{dateLabel}</p>       {/* 11月7日 · 星期五 */}
  </div>
  <div className="header-actions">
    <button className="button button-secondary" onClick={() => onNavigate('records')}><Plus size={17} />记一笔</button>
    <button className="button button-primary" onClick={() => onNavigate('scan')}><ScanLine size={17} />扫描报告</button>
  </div>
</header>
```

指标卡是本项目视觉的核心，每张卡 3 段：

```tsx
<article className={`metric-card metric-${analysis.status}`} key={definition.key} onClick={() => onOpenMetric(definition.key)} role="button" tabIndex={0}>
  {/* ① 头部：图标 + 名称/日期 + 大数值 + 状态胶囊 */}
  <div className="metric-card-header">
    <div className="metric-identity">
      <span className="metric-icon" style={{ color: definition.color, background: `${definition.color}12` }}>
        <MetricIcon metric={definition.key} />
      </span>
      <div><h3>{definition.name}</h3><span>{analysis.latest?.date ?? '尚无记录'}</span></div>
    </div>
    <div className="metric-value">
      <strong>{formatMetricValue(analysis.value, definition)}</strong>
      <span>{definition.unit}</span>
      <em className={`status-pill status-${analysis.status}`}>{statusLabels[analysis.status]}</em>
    </div>
  </div>

  {/* ② 主体：左折线图 + 右三段文字 */}
  <div className="metric-body">
    <div className="chart-wrap"><TrendChart records={analysis.records} color={definition.color} /></div>
    <div className="metric-analysis">
      <div><span>趋势</span><p>{analysis.analysis}</p></div>
      <div><span>下一步</span><p>{definition.tip}</p></div>
      <div className="optimal-range-block">
        <div><span>个人最优区间</span><strong>{analysis.range.label}</strong></div>
        <div className="range-track">
          <span className="range-optimal" style={{ left: `${rangeLeft}%`, width: `${rangeWidth}%` }} />
          {analysis.value !== null && <i style={{ left: `${markerLeft}%` }} />}
        </div>
      </div>
      <button className="text-link">查看 {analysis.records.length} 次记录<ArrowUpRight size={15} /></button>
    </div>
  </div>
</article>
```

**三条位置计算（照抄即可）**：

```ts
const fullRange = definition.max - definition.min;                    // 例如体重 25–250 → 225
const rangeLeft  = Math.max(0, ((analysis.range.min - definition.min) / fullRange) * 100);
const rangeWidth = Math.min(100 - rangeLeft, ((analysis.range.max - analysis.range.min) / fullRange) * 100);
const markerLeft = analysis.value === null ? 0
  : Math.min(100, Math.max(0, ((analysis.value - definition.min) / fullRange) * 100));
```

`rangeWidth` 的 `Math.min` 是关键：体重的最优上限（23.9 × 身高²）可能超出 `definition.max` 的显示范围，不截断就会把绿色区间画出轨道外。

图标底色用 `color + '12'`（8 位 hex 透明度的写法，`12` ≈ 7%），这是唯一给每个指标单独着色又保持低调的办法。

```css
.metric-body { display: grid; grid-template-columns: minmax(180px, 34%) minmax(0, 1fr); align-items: center; margin-top: 12px; gap: 22px; }
.metric-card { padding: 19px 20px 17px; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); cursor: pointer; transition: transform .18s, box-shadow .18s, border-color .18s; }
.metric-card:hover { border-color: color-mix(in srgb, var(--accent) 35%, var(--line)); box-shadow: 0 10px 28px rgba(18, 54, 41, .06); transform: translateY(-2px); }
.metric-optimal { border-top: 3px solid var(--good); }
.metric-low     { border-top: 3px solid var(--amber); }
.metric-high    { border-top: 3px solid var(--red); }
.metric-empty   { border-top: 3px solid var(--line); }
.metric-value strong { min-width: 64px; font-size: 30px; font-weight: 500; text-align: right; }
```

`min-width: 64px` + 右对齐：让 8 张卡的数值小数点竖直对齐，扫视时不会跳。

**今日行动**（只有 2 张卡，网格 2 列）：

```tsx
<div className="advice-grid">
  {advice.map((item) => (
    <article className="advice-card" key={item.id}>
      <div><span>{item.tag}</span><span>{item.level}</span></div>
      <h3>{item.title}</h3><p>{item.description}</p>
    </article>
  ))}
</div>
<p className="medical-disclaimer">仅提供营养、运动与生活方式建议，不替代医生诊断或治疗。</p>
```

```css
.advice-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.advice-card { min-height: 150px; padding: 20px; border-radius: 17px; background: var(--accent-soft); }
.advice-card > div { display: flex; justify-content: space-between; color: var(--accent); font-size: 9px; }
.advice-card h3 { margin-top: 16px; font-size: 17px; font-weight: 500; }
```

建议卡刻意**不用白底**，用 `--accent-soft`（#ffebee）跟指标卡区分层次：数据是白的，建议是粉的。

### 7.3 TrendChart（自绘 SVG 折线，63 行）

**坐标系统**：`viewBox="0 0 300 150"`，X 从 18 到 282，Y 从 20 到 112（底部 116 是面积闭合线）。

```ts
const sorted = sortRecords(records).slice(-6);            // 只显示最近 6 次
const values = sorted.map((r) => Number(r.value));
let min = values.length ? Math.min(...values) : 0;
let max = values.length ? Math.max(...values) : 1;
const padding = max === min ? Math.max(1, Math.abs(max) * 0.08) : (max - min) * 0.2;
min -= padding; max += padding;                            // 上下各留 20% 余量

const points = sorted.map((record, index) => ({
  record,
  x: sorted.length === 1 ? 150 : 18 + (index / (sorted.length - 1)) * 264,
  y: 112 - ((Number(record.value) - min) / (max - min)) * 92,
}));

const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');
const area = points.length
  ? `M ${points[0].x} 116 L ${points.map((p) => `${p.x} ${p.y}`).join(' L ')} L ${points.at(-1)?.x} 116 Z`
  : '';
```

四个必须处理的边界：
1. **只有 1 条记录**：`x` 固定 150（居中），否则除零得到 `NaN`，SVG 直接不渲染。
2. **所有值相同**：`max === min` 时 padding 用 `max*0.08`，否则除零。
3. **零记录**：`points.length === 0`，渲染 `暂无数据` 文字。
4. **少于 2 个点不画线**（`points.length > 1`），只画点，否则 `polyline` 只有一个点什么都不显示。

渲染层：

```tsx
<svg ref={svgRef} className={`trend-chart ${large ? 'trend-chart-large' : ''}`} viewBox="0 0 300 150" role="img" aria-label="指标变化折线图">
  <defs>
    <linearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity="0.16" />
      <stop offset="100%" stopColor={color} stopOpacity="0" />
    </linearGradient>
  </defs>
  {[20, 52, 84, 116].map((y) => <line key={y} x1="12" x2="288" y1={y} y2={y} className="chart-grid" />)}
  {area && <path d={area} fill={`url(#area-${id})`} />}
  {points.length > 1 && <polyline points={polyline} fill="none" stroke={color} strokeWidth={large ? 3 : 2.6} strokeLinecap="round" strokeLinejoin="round" />}
  {points.map(({ record, x, y }) => (
    <g key={record.id}>
      <circle className="chart-point" cx={x} cy={y} r={large ? 4.5 : 3.6} fill="var(--surface)" stroke={color} strokeWidth="2.2">
        <title>{`${record.date} · ${record.value}`}</title>
      </circle>
      <text x={x} y="140" textAnchor="middle" className="chart-date">{record.date.slice(5).replace('-', '/')}</text>
    </g>
  ))}
  {!points.length && <text x="150" y="72" textAnchor="middle" className="chart-empty">暂无数据</text>}
</svg>
```

- `useId()` 生成唯一渐变 id，`replace(/:/g,'')` 去掉 React 生成的冒号（在 `url(#...)` 里非法）。
- 四条水平网格线手写 `[20, 52, 84, 116]`，间距 32，正好是绘图区 92px 的四等分。
- 描线动画用 `getTotalLength()` 拿到真实长度再做 `strokeDashoffset` 补间，比估算长度干净。

```ts
useEffect(() => {
  if (!svgRef.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const context = gsap.context(() => {
    const line = svgRef.current?.querySelector('polyline');
    if (line) {
      const length = line.getTotalLength();
      gsap.fromTo(line, { strokeDasharray: length, strokeDashoffset: length }, { strokeDashoffset: 0, duration: 0.85, ease: 'power2.out' });
    }
    gsap.fromTo('circle.chart-point', { opacity: 0, scale: 0.4, transformOrigin: 'center' },
      { opacity: 1, scale: 1, duration: 0.35, stagger: 0.055, ease: 'back.out(2)' });
  }, svgRef);
  return () => context.revert();
}, [records, color, large]);
```

### 7.4 MetricDetail（指标二级页）

自上而下 6 块：返回 → hero（图标 + 名称 + 42px 大数字 + 环比）→ 趋势卡（大折线 + 平均/最低/最高）→ 心率采集卡（仅静息心率）→ 手动记录（可折叠）→ 历史列表。

```tsx
<header className="detail-hero">
  <div className="detail-heading">
    <span className="detail-icon" style={{ color: definition.color, background: `${definition.color}12` }}>
      <MetricIcon metric={metric} size={27} />
    </span>
    <div><span className="section-kicker">HEALTH MARKER</span><h1>{definition.name}</h1></div>
  </div>
  <div className="hero-value">
    <div><strong>{formatMetricValue(analysis.value, definition)}</strong><span>{definition.unit}</span></div>
    <p>{previous ? `较上次 ${delta > 0 ? '+' : ''}${delta.toFixed(definition.decimals)} ${definition.unit}` : '个人最优区间'}</p>
  </div>
</header>
```

统计行是三个数：平均值 / 最低 / 最高，全部 `toFixed(decimals)`，空数组显示 `--`。

历史列表每行四段：日期 + 来源标签、备注（单行省略）、数值、删除按钮。

```tsx
<span>{record.source === 'scan' ? '扫描归档' : record.source === 'demo' ? '演示数据' : record.source === 'ble' ? '穿戴设备' : '手动记录'}</span>
```

删除有二次确认，在 `App.deleteRecord` 里用 `window.confirm`：

```ts
function deleteRecord(key: MetricKey, id: string) {
  if (!window.confirm('删除这条记录？')) return;
  ...
}
```

### 7.5 ScanPage（三步扫描流程）

**流程状态**：`image` / `transcript` → `analyzing` → `result` → `saved`，四个布尔/对象驱动三段视图，没有 router。

步骤指示器（`01 上传资料 / 02 整理指标 / 03 核对归档`）的激活逻辑是计算出来的，不是自增状态：

```tsx
{index === 0 || (index === 1 && result) || (index === 2 && saved) ? 'step-active' : ''}
```

**拍照的双通道实现（两端差异最大的地方）**：

```tsx
async function chooseImage() {
  setError('');
  if (Capacitor.isNativePlatform()) {
    try {
      const photo = await CapacitorCamera.getPhoto({
        quality: 85, allowEditing: false,
        resultType: CameraResultType.DataUrl, source: CameraSource.Prompt, width: 1600,
      });
      if (photo.dataUrl) { setImage(photo.dataUrl); setResult(null); setSaved(false); }
    } catch (reason) {
      if (String(reason).toLowerCase().includes('cancel')) return;
      onNotify('无法打开相机，请检查应用权限');
    }
    return;
  }
  fileInput.current?.click();      // 网页端：隐藏 input + capture="environment"
}
```

```tsx
<input ref={fileInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
```

- 原生：Capacitor Camera，`CameraSource.Prompt` 让用户选「拍照 / 相册」，返回 `DataUrl` 直接喂给 AI。
- 网页：`capture="environment"` 在手机上直接开后置摄像头，桌面上退化成文件选择框。
- 网页端图片要压：`resizeImage(file, 1600)` 用 canvas 缩到最长边 1600、`image/jpeg` 质量 0.82，20MB 上限，否则 base64 太大边缘函数会超时。

**解析与错误分流**：

```ts
async function startAnalysis() {
  if (!image && !transcript.trim()) { setError('请先拍照、上传图片或粘贴报告文字'); return; }
  setAnalyzing(true); setError(''); setResult(null);
  try {
    const analysis = await analyzeReport({ image, transcript: transcript.trim(), demoMode, profileContext });
    setResult(analysis);
    setMetrics(analysis.metrics.map((item) => ({ ...item, value: String(item.value) })));
    setSaved(false);
  } catch (reason) {
    setError(reason instanceof Error ? reason.message : '解析失败，请稍后重试');
  } finally { setAnalyzing(false); }
}
```

错误条会按错误内容**动态追加动作按钮**，这是提升可用性的关键：

```tsx
{error && (
  <div className="notice error-notice">
    <span>{error}</span>
    <button onClick={startAnalysis}>重试</button>
    {/未登录|登录状态|请先登录/.test(error) && <button onClick={onOpenAuth}>去登录</button>}
    {/体验已结束|开通会员/.test(error) && <button onClick={onOpenSettings}>去开通</button>}
  </div>
)}
```

**核对表（AI 结果落地前的最后一道人工闸）**：

```tsx
{metrics.map((item, index) => (
  <div className="edit-metric" key={item.key}>
    <div><strong>{item.name}</strong></div>
    <div className="edit-value">
      <input type="number" step="any" value={item.value}
             onChange={(e) => { const next = [...metrics]; next[index] = { ...item, value: e.target.value }; setMetrics(next); setSaved(false); }} />
      <span>{item.unit}</span>
      <button onClick={() => { setMetrics(metrics.filter((_, i) => i !== index)); setSaved(false); }} aria-label="移除指标"><Trash2 size={16} /></button>
    </div>
  </div>
))}
<select className="add-metric-select" value="" onChange={(e) => e.target.value && addMetric(e.target.value as MetricKey)}>
  <option value="">＋ 补充指标</option>
  {METRICS.filter((item) => !metrics.some((m) => m.key === item.key)).map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
</select>
```

归档前再做一次范围校验（防止用户手改出 9999）：

```ts
const valid = metrics.filter((item) => item.value.trim()).every((item) => {
  const definition = metricByKey(item.key);
  const value = Number(item.value);
  return Number.isFinite(value) && value >= definition.min && value <= definition.max;
});
if (!valid) { setError('请检查指标数值'); return; }
```

**等待态动画**（纯 CSS，不用 GIF）：

```css
.scan-animation { position: relative; width: 130px; height: 160px; overflow: hidden; }
.scan-document { width: 116px; height: 146px; padding: 36px 18px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-soft); }
.scan-document i { height: 5px; border-radius: 4px; background: var(--line); }
.scan-document i:nth-child(2) { width: 75%; }
.scan-animation > span { position: absolute; top: 10px; right: 0; left: 0; height: 3px; background: var(--accent); box-shadow: 0 0 14px var(--accent); animation: scanning 1.7s ease-in-out infinite alternate; }
@keyframes scanning { to { transform: translateY(130px); } }
```

一张「纸」+ 一条来回扫的亮线，比转圈更有「正在读文档」的语义。

### 7.6 RecordsPage（我的数据）

3 个 tab：指标数据 / 健康资料 / 运动建议，外加一个可折叠的「快速记录」卡。

- 指标 tab：表头三列 `指标 / 近期趋势 / 最新记录`，每行是一条 84px 高的按钮，中间放一张迷你 sparkline（复用 TrendChart，靠 CSS 压扁）：

```css
.record-sparkline { min-width: 0; height: 55px; overflow: hidden; }
.record-sparkline .trend-chart { height: 70px; transform: translateY(-7px); }
```

- 资料 tab：卡片列表，左图右文，正文 `-webkit-line-clamp: 2` 截断，点开是模态：

```tsx
{preview && (
  <div className="modal-backdrop" onClick={() => setPreview(null)}>
    <div className="document-modal" onClick={(e) => e.stopPropagation()}>
      <button className="modal-close" onClick={() => setPreview(null)}><X size={20} /></button>
      {preview.imagePath && <img src={preview.imagePath} alt="归档健康资料" />}
      <div>
        <span className="section-kicker">{preview.createdAt.slice(0, 10)}</span>
        <h2>{preview.title}</h2><p>{preview.summary}</p>
        <h3>运动与恢复建议</h3><p>{preview.advice}</p>
        <small>{preview.engine}</small>
      </div>
    </div>
  </div>
)}
```

- 建议 tab：顶部一个 98px 的小进度环（conic-gradient 画的，不是 SVG）：

```css
.small-progress-ring { background: conic-gradient(var(--red) var(--progress), var(--ring-track) 0); transform: rotate(-90deg); }
.small-progress-ring > div { width: 76px; height: 76px; border-radius: 50%; background: var(--surface); transform: rotate(90deg); }
```

```tsx
<div className="small-progress-ring" style={{ '--progress': `${daily.progress * 3.6}deg` } as React.CSSProperties}>
  <div>{daily.progress}%</div>
</div>
```

百分比 → 角度是 `× 3.6`，内圈再反向旋转 90 度把文字摆正。

### 7.7 SettingsPage（8 个分区，196 行）

字段顺序就是用户心智顺序，不要改：

| # | 分区 | 字段 / 动作 | 落点 |
|---|---|---|---|
| 1 | 账户与体验 | 邮箱、显示名、体验期状态、退出、申请 24h 体验、缴费（演示） | Supabase `auth` + `profiles` |
| 2 | 演示模式 | 进入 / 退出 | `App.setDemo` |
| 3 | 用户数据 | 身高、体重、年龄、性别、训练目标、日常活动量、身体情况、补充说明 + 实时 BMI | `vault.profile` + 当天体重记录 |
| 4 | 健康目标 | 每日步数目标 | `vault.activity.targetSteps` |
| 5 | 健康档案 | 导出（JSON + MD）/ 复制 JSON / 导入 | `lib/store` |
| 6 | WebDAV | 地址、用户名、密码、上传快照 | `uploadWebDAV` |
| 7 | 设备 | 穿戴设备状态、蓝牙检测 | `navigator.bluetooth` |
| 8 | 外观 | 明暗切换 | `theme` |

**用户数据区的实时 BMI**：

```ts
const heightValue = Number(height);
const weightValue = Number(weight);
const liveBmi = heightValue >= 80 && heightValue <= 250 && weightValue >= 20
  ? weightValue / (heightValue / 100) ** 2 : null;
```

```tsx
<p className="profile-hint">
  {liveBmi ? <>当前 BMI <strong>{liveBmi.toFixed(1)}</strong>，AI 分析会参考这项数据与身体限制</> : '填写身高与体重后自动计算 BMI，AI 分析会参考这些信息'}
</p>
```

**保存前的校验（一次挡住所有脏数据）**：

```ts
function validTargets() {
  const target = Number(targetSteps);
  const ageValue = Number(age || 0);
  const weightOk = weight === '' || (weightValue >= 20 && weightValue <= 300);
  const ageOk = age === '' || (ageValue >= 5 && ageValue <= 120);
  return target >= 1000 && target <= 50000
      && heightValue >= 80 && heightValue <= 250 && weightOk && ageOk;
}
```

**「身体情况」的六个选项**是建议分支的输入，值必须与 `LimitationKey` 对齐：

```ts
export const LIMITATION_OPTIONS: Array<{ value: LimitationKey; label: string }> = [
  { value: 'none',   label: '无' },
  { value: 'lower',  label: '下肢受限' },
  { value: 'upper',  label: '上肢受限' },
  { value: 'vision', label: '视力受限' },
  { value: 'cardio', label: '心肺功能受限' },
  { value: 'other',  label: '其他（请在下方说明）' },
];
```

`limitationNote` 限 120 字（`maxLength={120}`，存储时 `slice(0, 120)`），因为要拼进 AI 提示词，太长会挤掉报告内容。

### 7.8 AuthPage

左右分栏：左侧红底宣传（图标 + 「保存你的健康轨迹。」+ 巨大 `24h`），右侧表单。

```tsx
<section className="auth-intro">
  <img src="/app-icon.png" alt="Ai·健康" />
  <span className="section-kicker">YOUR HEALTH ACCOUNT</span>
  <h1>保存你的<br />健康轨迹。</h1>
  <div className="trial-number"><strong>24</strong><span>h</span></div>
  <p>新用户免费体验</p>
</section>
```

注册时把称呼塞进 `user_metadata`，服务端触发器会读它写 `display_name`：

```ts
const { data, error } = await supabase.auth.signUp({
  email, password,
  options: { data: { display_name: name.trim() || '健康用户' } },
});
if (data.session) onSuccess();
else setMessage('验证邮件已发送，完成后即可登录');
```

**注意**：如果后台开了邮箱确认，`signUp` 不会返回 session，走 else 分支显示提示。本项目在后台关掉了确认，所以注册即登录。

### 7.9 NavigationRail + MetricIcon

导航栏只有 4 个可点项 + 一个 logo 圆点，文字用 `writing-mode: vertical-rl` 竖排：

```tsx
<nav className="navigation-rail" aria-label="主要功能">
  <button className="rail-mark" onClick={() => onNavigate('dashboard')} aria-label="返回首页">Ai</button>
  {items.map((item) => (
    <button key={item.page} className={`rail-item ${activePage === item.page ? 'rail-active' : ''}`} onClick={() => onNavigate(item.page)}>
      {item.icon}<span>{item.label}</span>
    </button>
  ))}
  <button className="rail-item" onClick={onToggleTheme}>{theme === 'dark' ? <Sun size={21} /> : <Moon size={21} />}<span>{theme === 'dark' ? '日间模式' : '暗夜模式'}</span></button>
  <span className="rail-bottom" />
</nav>
```

```css
.rail-mark { width: 30px; height: 30px; border: 1px solid var(--line); border-radius: 50%; font-family: Georgia, serif; font-size: 13px; color: var(--accent); }
.rail-item { min-height: 112px; padding: 16px 0; color: var(--accent); }
.rail-item > span { margin-top: 11px; color: var(--muted); font-size: 10px; letter-spacing: 2px; writing-mode: vertical-rl; }
.rail-bottom { width: 4px; height: 4px; margin-top: auto; border-radius: 50%; background: var(--faint); }
```

图标映射（`MetricIcon`，15 行，无 switch）：

```tsx
const props = { size, strokeWidth: 1.7 };
if (metric === 'weight')    return <Scale {...props} />;
if (metric === 'waist')     return <Ruler {...props} />;
if (metric === 'heartRate') return <HeartPulse {...props} />;
if (metric === 'hrv')       return <Activity {...props} />;
if (metric === 'spo2')      return <Droplets {...props} />;
if (metric === 'sleep')     return <BedDouble {...props} />;
if (metric === 'steps')     return <Footprints {...props} />;
if (metric === 'bodyFat')   return <Gauge {...props} />;
return <Waves {...props} />;
```

### 7.10 HeartRateCapture（心率实时采集）

只出现在「静息心率」二级页。显示实时心率 + 连接状态点 + 两个按钮。

```tsx
<div className="card-heading">
  <div><h2>穿戴设备</h2><p>{session ? session.deviceName : '标准心率广播'}</p></div>
  <span className={`connection-dot ${session ? 'connected' : ''}`} />
</div>
<div className="heart-live-value"><HeartPulse size={24} /><strong>{heartRate ?? '--'}</strong><span>bpm</span></div>
```

```css
.connection-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--faint); }
.connection-dot.connected { background: var(--good); box-shadow: 0 0 0 5px rgba(47, 154, 102, .12); }
.heart-live-value strong { font-size: 48px; font-weight: 500; letter-spacing: -1px; }
```

两条必须的清理：组件卸载时断开连接、点「记录心率」后按钮变「已记录」防重复写入。

```ts
useEffect(() => () => { void sessionRef.current?.stop(); }, []);
```

---

## 8. 服务连接（这是最容易卡住的一章）

整体只有四类外部依赖：

```
浏览器 / WebView
├── Supabase Auth      ← 邮箱注册登录（access_token 存 localStorage）
├── Supabase Postgres  ← 只存 profiles 表（体验期/会员状态），业务数据不在这里
├── Supabase Edge Function (Deno) ← analyze-report，代理调 Kimi
│      └── Kimi API (api.moonshot.cn) ← 视觉模型，密钥只在服务端
└── WebDAV（可选）      ← 档案快照上传，用户名密码存本地
```

### 8.1 前端 Supabase 客户端（`src/lib/supabase.ts`，53 行）

```ts
const rawUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

function resolveSupabaseUrl(): string {
  if (typeof window === 'undefined') return rawUrl;
  const capacitor = (window as any).Capacitor;
  const isNative = Boolean(capacitor && (capacitor.isNativePlatform ? capacitor.isNativePlatform() : capacitor.platform && capacitor.platform !== 'web'));
  if (isNative) return rawUrl;                                    // 安卓：直连
  const { protocol, hostname, origin } = window.location;
  const isLocalWeb = protocol.startsWith('http') && ['127.0.0.1', 'localhost', '::1'].includes(hostname);
  return isLocalWeb ? `${origin}/sb` : rawUrl;                     // 本机网页：走 /sb 同源转发
}

const supabaseUrl = resolveSupabaseUrl();
export const isSupabaseRelayed = supabaseUrl !== rawUrl;
export const isSupabaseConfigured = /^https:\/\/.+\.supabase\.co$/i.test(rawUrl) && supabaseAnonKey.length > 20;

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
```

`supabase` 可能为 `null`，所以每个调用点都要判空——这是刻意的：没配 `.env` 时应用仍能启动（本地档案功能可用），只是登录与 AI 不可用，不会白屏。

`.env` 内容：

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxxxxxxxxxx
```

### 8.2 数据库结构（`supabase/schema.sql`）

只有一张表。业务数据在客户端，云端只判「这个人有没有权限用 AI」。

```sql
-- 1. 用户档案表
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  plan_status text not null default 'none' check (plan_status in ('none', 'trial', 'expired', 'paid')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id and plan_status = (select plan_status from public.profiles where id = auth.uid()));
```

`with check` 里那句子查询是**防自助升级**的：用户能改自己的 `display_name`，但不能把 `plan_status` 改成 `paid`——因为新值必须等于旧值。

```sql
-- 2. 注册时自动创建档案
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

`display_name` 优先取注册时传的 `user_metadata.display_name`，没有就用邮箱 @ 前面那段。`security definer` 必须加，否则触发器没有权限写 `public.profiles`。

```sql
-- 3. 申请 24h 体验（每人一次，服务端时间为准）
create or replace function public.start_trial()
returns public.profiles
language plpgsql
security definer set search_path = public
as $$
declare
  current_profile public.profiles;
begin
  select * into current_profile from public.profiles where id = auth.uid();
  if not found then raise exception 'profile not found'; end if;
  if current_profile.plan_status = 'paid' then return current_profile; end if;
  if current_profile.trial_ends_at is not null then raise exception 'trial already used'; end if;
  update public.profiles
     set trial_started_at = now(),
         trial_ends_at = now() + interval '24 hours',
         plan_status = 'trial'
   where id = auth.uid()
   returning * into current_profile;
  return current_profile;
end;
$$;

revoke all on function public.start_trial() from public;
grant execute on function public.start_trial() to authenticated;
```

三个要点：
- `trial_ends_at is not null` 就抛错 → **一人一次，不能重复领**；
- 时间一律用 `now()`（服务端时间），客户端改系统时间骗不到；
- `revoke all ... from public` + `grant execute ... to authenticated`，匿名用户连试都不能试。

**补齐 GRANT（必须单独执行，否则前端读表报 42501）**：

```sql
-- supabase/migrations/20261107194000_grants.sql
grant usage on schema public to anon, authenticated, service_role;
grant select, update on public.profiles to authenticated;
grant select on public.profiles to service_role;
grant all on public.profiles to service_role;
alter default privileges in schema public grant select on tables to authenticated;
```

RLS 管「能看哪几行」，GRANT 管「能不能碰这张表」，两件事都要做。新项目如果关闭了 `auto_expose_new_tables`，只建 RLS 不 GRANT 就是 42501。

### 8.3 前端账务调用

```ts
export async function fetchAccountProfile(userId: string): Promise<AccountProfile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id,display_name,trial_started_at,trial_ends_at,plan_status')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as AccountProfile | null;
}

export async function requestTrial(): Promise<AccountProfile> {
  if (!supabase) throw new Error('Supabase 尚未配置');
  const { data, error } = await supabase.rpc('start_trial');
  if (error) throw error;
  return data as AccountProfile;
}

export function trialState(profile: AccountProfile | null) {
  if (!profile) return { active: false, label: '尚未开通体验' };
  if (profile.plan_status === 'paid') return { active: true, label: '正式会员' };
  if (!profile.trial_ends_at) return { active: false, label: '可申请 24h 体验' };
  const remaining = new Date(profile.trial_ends_at).getTime() - Date.now();
  if (remaining <= 0) return { active: false, label: '体验已结束' };
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.max(1, Math.floor((remaining % 3600000) / 60000));
  return { active: true, label: `体验剩余 ${hours}h ${minutes}m` };
}
```

用 `.maybeSingle()` 而不是 `.single()`：新注册用户的 profile 可能还没被触发器写进去，`single()` 会抛 PGRST116。

界面上「申请 24h 体验」按钮的显示条件：

```tsx
{user && !trial.active && profile && !profile.trial_ends_at && <button ...>申请 24h 免费体验</button>}
```

`!profile.trial_ends_at` 保证领过的人看不到这个按钮（服务端也会拒，但界面不该给死路）。

### 8.4 报告解析边缘函数（`supabase/functions/analyze-report/index.ts`，168 行）

这是全项目唯一需要保密的逻辑，也是最值钱的一段。

**入口与环境变量**：

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const KIMI_API_KEY     = Deno.env.get('KIMI_API_KEY') ?? '';
const KIMI_BASE_URL    = (Deno.env.get('KIMI_BASE_URL') ?? 'https://api.moonshot.cn/v1').replace(/\/$/, '');
const KIMI_MODEL       = Deno.env.get('KIMI_MODEL') ?? 'moonshot-v1-32k-vision-preview';
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
```

实际部署时把 `KIMI_MODEL` 设成 `kimi-k2.6`（这个模型名是踩坑后试出来的，`moonshot-v1-32k-vision-preview` / `kimi-latest` 都会 404）。

**请求入口与三道门**：

```ts
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {
    // 门①：服务端密钥是否配好
    if (!KIMI_API_KEY) return json({ error: '服务端尚未配置 KIMI_API_KEY' }, 500);

    // 门②：必须带 Bearer token
    const authorization = request.headers.get('Authorization') ?? '';
    if (!authorization.startsWith('Bearer ')) return json({ error: '请先登录' }, 401);

    // 门③：token 有效 + 会员/体验期未过期
    if (SUPABASE_URL && SERVICE_ROLE_KEY) {
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      const token = authorization.replace('Bearer ', '');
      const { data: userData, error: userError } = await admin.auth.getUser(token);
      if (userError || !userData.user) return json({ error: '登录状态无效，请重新登录' }, 401);

      const { data: profile } = await admin
        .from('profiles').select('plan_status,trial_ends_at').eq('id', userData.user.id).maybeSingle();
      const paid = profile?.plan_status === 'paid';
      const trialActive = profile?.trial_ends_at ? new Date(profile.trial_ends_at).getTime() > Date.now() : false;
      if (!paid && !trialActive) return json({ error: '体验已结束，请开通会员后再解析' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const image = typeof body.image === 'string' && body.image.startsWith('data:image/') ? body.image : undefined;
    const transcript = typeof body.transcript === 'string' ? body.transcript.slice(0, 4000) : '';
    const profile = typeof body.profile === 'string' ? body.profile.slice(0, 400) : '';
    if (!image && !transcript) return json({ error: '请提供报告图片或文字' }, 400);

    return json(await callKimi(image, transcript, profile));
  } catch (error) {
    const message = error instanceof Error ? error.message : '解析失败';
    const raw = (error as { raw?: string })?.raw;
    const status = (error as { status?: number })?.status === 401 ? 502 : 500;
    return json({ error: message, raw }, status);
  }
});
```

输入都有硬上限：图片必须是 `data:image/` 前缀（挡掉外部 URL 让服务器去打），文字 4000 字，用户资料 400 字。超限直接截断，不给大 payload 拖垮函数的机会。

**提示词（这是质量的关键，逐字照抄）**：

```ts
const SYSTEM_PROMPT_BASE = [
  '你是 Ai·健康 的健康资料解析引擎。用户会给你一张病历单/体检报告/化验单的图片，或一段报告文字。',
  '任务：读取报告，提取真实出现的身体指标，然后只输出一个 JSON 对象。',
  '下面是一个输出示例（仅示范结构，数值必须来自报告本身，绝不能照抄示例）：',
  '{"title":"2026 年度体检","summary":"体重 70.2kg，体脂率 24.5%，静息心率 72bpm。","advice":"每周三次力量训练并保证蛋白质摄入。本建议不替代医生诊断。","metrics":[{"key":"weight","value":70.2},{"key":"bodyFat","value":24.5},{"key":"heartRate","value":72}]}',
  `metrics 的 key 只能从这些里选：${METRIC_RULES.map((r) => `${r.key}(${r.name}, 单位${r.unit})`).join('、')}。`,
  '规则：value 是纯数字，不带单位；报告里没有的指标不要输出；不要输出解释、前言、代码块或除 JSON 以外的任何字符。',
];

function systemPrompt(profile: string) {
  const lines = [...SYSTEM_PROMPT_BASE];
  if (profile) {
    lines.splice(lines.length - 1, 0,
      `用户基础信息：${profile}。`,
      'advice 必须结合这些基础信息：说明该结果对这位用户意味着什么；若用户存在身体限制，只给出不涉及受限部位或器官负荷的替代方案，并明确提示回避的动作；不要做诊断，不给药物和补剂剂量。',
    );
  }
  return lines.join('\n');
}
```

**三个提示词工程要点，缺一不可**：
1. 示例必须给**真实数值**。早期版本写成 `{"weight": <数值>}` 这种占位符，模型会原样把占位符吐回来，JSON 解析直接失败。
2. 示例句必须加「绝不能照抄示例」——否则模型会把 70.2 当成答案。
3. 用户资料用 `splice` 插在「规则」之前，让规则永远压在最后（模型对末尾指令最敏感）。

**调用与一次自动纠错**：

```ts
async function requestKimi(messages: unknown[]) {
  const response = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KIMI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: KIMI_MODEL, messages, max_tokens: 1500, stream: false }),
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error('kimi upstream error', response.status, detail.slice(0, 500));
    throw Object.assign(new Error(`Kimi ${response.status}: ${detail.slice(0, 220)}`), { detail, status: response.status });
  }
  const payload = await response.json();
  const message = payload?.choices?.[0]?.message ?? {};
  return typeof message.content === 'string' && message.content.trim()
    ? message.content
    : (typeof message.reasoning_content === 'string' ? message.reasoning_content : '');
}
```

**没有 `temperature` 参数**。`kimi-k2.6` 不接受自定义 temperature，传了直接 400。`max_tokens: 1500` 够 8 条指标 + 摘要 + 建议。

```ts
const CORRECTION = '上一次回复不是合法 JSON。请直接输出一个 JSON 对象：所有字段填真实数值，不要复述格式说明，不要代码块、不要解释文字。';

async function callKimi(image: string | undefined, transcript: string, profile: string) {
  const content: unknown[] = [{
    type: 'text',
    text: transcript
      ? `请解析这份健康报告，报告文字：${transcript}${image ? '（同时附报告图片供核对）' : ''}`
      : '请解析这张图片中的健康报告并提取指标。',
  }];
  if (image) content.push({ type: 'image_url', image_url: { url: image } });
  const prompt = systemPrompt(profile);
  const base: unknown[] = [{ role: 'system', content: prompt }, { role: 'user', content }];

  const first = await requestKimi(base);
  if (!first) throw new Error('invalid upstream payload');
  try {
    return sanitize(extractJson(first));
  } catch {
    const second = await requestKimi([
      { role: 'system', content: prompt },
      { role: 'user', content: '上一次输出格式错误，请重新解析并只输出 JSON。' },
    ]);
    try {
      return sanitize(extractJson(second));
    } catch {
      throw Object.assign(new Error('报告已读取，但未能整理成结构化数据，请换一张更清晰的图片或补充文字后重试'), { raw: (second || first).slice(0, 300) });
    }
  }
}
```

**容错三层**：`extractJson` 先剥 ```` ```json ```` 围栏再正则抓第一个 `{...}`；`sanitize` 校验范围去重；失败后**只重试一次**（重试第二次基本也不会变好，还烧钱）。

```ts
function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '');
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw Object.assign(new Error('no json'), { raw: text.slice(0, 400) });
  return JSON.parse(match[0]);
}

const METRIC_RULES = [
  { key: 'weight', name: '体重', unit: 'kg', min: 20, max: 300 },
  { key: 'waist', name: '腰围', unit: 'cm', min: 30, max: 200 },
  { key: 'heartRate', name: '静息心率', unit: 'bpm', min: 25, max: 220 },
  { key: 'hrv', name: 'HRV', unit: 'ms', min: 5, max: 300 },
  { key: 'spo2', name: '血氧', unit: '%', min: 50, max: 100 },
  { key: 'sleep', name: '睡眠时长', unit: 'h', min: 0, max: 24 },
  { key: 'steps', name: '步数', unit: '步', min: 0, max: 100000 },
  { key: 'bodyFat', name: '体脂率', unit: '%', min: 2, max: 70 },
];
```

服务端的 `METRIC_RULES` 与前端 `METRICS` 的 `min/max` 故意不完全一致（前端更严，比如体重要求 25–250）：**服务端宽一点是为了不误杀**，前端严一点是为了不让脏数据进档案。

**部署命令**（在本机终端逐条执行）：

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push                                  # 或把 schema.sql 贴进 SQL Editor

supabase secrets set KIMI_API_KEY=sk-xxxxxxxx \
                     KIMI_MODEL=kimi-k2.6 \
                     KIMI_BASE_URL=https://api.moonshot.cn/v1

supabase functions deploy analyze-report
```

`SUPABASE_URL` 与 `SUPABASE_SERVICE_ROLE_KEY` 是平台自动注入的，不用手动设。

### 8.5 前端调用 AI（`src/lib/ai.ts`，49 行）

```ts
export const SAMPLE_REPORT = '体检摘要：体重 66.5 kg，腰围 78.8 cm，静息心率 69 bpm，HRV 46 ms，血氧 98%，睡眠时长 7.6 h，体脂率 22.9%，昨日运动步数 6200 步。';

export async function analyzeReport({ image, transcript, demoMode, profileContext }: AnalyzeOptions): Promise<AIResult> {
  if (demoMode) {                                   // 演示模式：不联网
    await new Promise((resolve) => setTimeout(resolve, 700));
    return analyzeTextLocally(transcript || (image ? SAMPLE_REPORT : ''));
  }
  if (!supabase) throw new Error('Supabase 尚未配置');
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) throw new Error('请先在设置中登录');
  const { data, error } = await supabase.functions.invoke('analyze-report', {
    body: { image, transcript, profile: profileContext || '' },
  });
  if (error) throw new Error(error.message || '报告解析失败');
  return sanitize(data);
}
```

`sanitize` 在客户端再洗一遍（不信任服务端返回值）：

```ts
function sanitize(payload: unknown): AIResult {
  if (!payload || typeof payload !== 'object') throw new Error('解析结果不完整');
  const candidate = payload as { title?: string; summary?: string; advice?: string; metrics?: Array<{ key?: string; name?: string; value?: number }> };
  const metrics: ExtractedMetric[] = [];
  (candidate.metrics ?? []).forEach((item) => {
    const definition = METRICS.find((entry) => entry.key === item.key || entry.name === item.name);
    const value = Number(item.value);
    if (!definition || !Number.isFinite(value) || value < definition.min || value > definition.max
        || metrics.some((entry) => entry.key === definition.key)) return;
    metrics.push({ key: definition.key, name: definition.name, unit: definition.unit, value });
  });
  return {
    title: String(candidate.title || '健康资料').slice(0, 60),
    summary: String(candidate.summary || '请核对指标后归档').slice(0, 500),
    advice: String(candidate.advice || '保持规律作息与轻量活动，异常指标请咨询医生。').slice(0, 500),
    metrics,
    engine: 'Kimi',
  };
}
```

`sanitize` 干四件事：按 key **或** name 认指标（模型偶尔吐中文名）、丢越界值、同一指标去重、字符串截断。

`profileContext` 来自 `data.ts` 的 `profileBrief(vault)`：

```ts
export function profileBrief(vault: Vault): string {
  const profile = vault.profile;
  const weight = latestRecord(vault, 'weight');
  const parts: string[] = [];
  if (profile.age >= 5) parts.push(`${profile.age} 岁`);
  if (profile.sex) parts.push(labelOf(SEX_OPTIONS, profile.sex));
  if (profile.height >= 80) parts.push(`身高 ${profile.height} cm`);
  if (weight) {
    parts.push(`体重 ${weight.value} kg`);
    if (profile.height >= 80) parts.push(`BMI ${(Number(weight.value) / (profile.height / 100) ** 2).toFixed(1)}`);
  }
  if (profile.limitation && profile.limitation !== 'none') {
    parts.push(`身体限制：${labelOf(LIMITATION_OPTIONS, profile.limitation)}${profile.limitationNote ? `（${profile.limitationNote}）` : ''}`);
  }
  if (profile.goal) parts.push(`训练目标：${labelOf(GOAL_OPTIONS, profile.goal)}`);
  if (profile.activityLevel) parts.push(`日常活动量：${labelOf(ACTIVITY_OPTIONS, profile.activityLevel)}`);
  return parts.join('，');
}
```

输出形如：`31 岁，男，身高 176 cm，体重 66.8 kg，BMI 21.6，身体限制：下肢受限（左膝术后），训练目标：降低体脂，日常活动量：轻度活动`——这正是让模型主动回避深蹲跳跃的那句话。

### 8.6 档案存储与导出（`src/lib/store.ts`，121 行）

```ts
const STORAGE_PREFIX = 'ai.health.vault.v2';
const THEME_KEY = 'ai.health.theme';
const storageKey = (ownerId?: string) => `${STORAGE_PREFIX}.${ownerId || 'guest'}`;

export function loadVault(ownerId?: string): Vault {
  try {
    const stored = localStorage.getItem(storageKey(ownerId));
    return stored ? normalize(JSON.parse(stored)) : createEmptyVault();
  } catch { return createEmptyVault(); }
}

export function saveVault(vault: Vault, ownerId?: string) {
  localStorage.setItem(storageKey(ownerId), JSON.stringify({ ...vault, updatedAt: new Date().toISOString() }));
}
```

`normalize` 是防炸的核心：老版本档案缺字段、某指标不是数组，都会被补成合法结构，而不是让界面 `undefined.map` 崩掉。

```ts
function normalize(value: unknown): Vault {
  if (!value || typeof value !== 'object') return createEmptyVault();
  const candidate = value as Partial<Vault>;
  if (!candidate.metrics) return createEmptyVault();
  const seed = createEmptyVault();
  const metrics = { ...seed.metrics };
  METRICS.forEach(({ key }) => { metrics[key] = Array.isArray(candidate.metrics?.[key]) ? candidate.metrics[key] : []; });
  return {
    schemaVersion: 1,
    updatedAt: candidate.updatedAt ?? new Date().toISOString(),
    profile: { ...seed.profile, ...candidate.profile },
    activity: { ...seed.activity, ...candidate.activity },
    settings: { ...DEFAULT_SETTINGS, ...candidate.settings },
    documents: Array.isArray(candidate.documents) ? candidate.documents : [],
    metrics,
  };
}
```

**导出双通道**：安卓写到文档目录，网页触发两个下载。

```ts
export async function exportVault(vault: Vault) {
  const json = JSON.stringify(vault, null, 2);
  const markdown = toMarkdown(vault);
  if (Capacitor.isNativePlatform()) {
    await Filesystem.writeFile({ path: 'AiHealth/health.vault.json', data: json, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true });
    await Filesystem.writeFile({ path: 'AiHealth/健康档案.md', data: markdown, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true });
    return '已保存到 Android 文档目录 /AiHealth';
  }
  downloadFile('health.vault.json', json, 'application/json;charset=utf-8');
  setTimeout(() => downloadFile('健康档案.md', markdown, 'text/markdown;charset=utf-8'), 180);
  return '已开始下载 JSON 与 Markdown';
}
```

两次下载之间隔 180ms 是必要的：部分浏览器连续触发两次 `a.click()` 会吞掉第二个。

**图片压缩**（配合 AI 传输）：

```ts
export function resizeImage(file: File, maxSize = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('请选择图片文件'));
    if (file.size > 20 * 1024 * 1024) return reject(new Error('图片不能超过 20 MB'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('图片格式不受支持'));
      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
```

1600px + 0.82 质量 ≈ 200–400KB base64，边缘函数不会超时。

**WebDAV**（目前唯一的跨设备同步手段）：

```ts
export async function uploadWebDAV(settings: AISettings, vault: Vault) {
  if (!/^https:\/\//i.test(settings.webdavUrl)) throw new Error('请填写 HTTPS WebDAV 目录地址');
  const url = `${settings.webdavUrl.replace(/\/$/, '')}/health.vault.json`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' };
  if (settings.webdavUser) headers.Authorization = `Basic ${encodeAuth(`${settings.webdavUser}:${settings.webdavPassword}`)}`;
  const response = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(vault, null, 2) });
  if (!response.ok) throw new Error(`WebDAV 上传失败（${response.status}）`);
  return url;
}
```

只允许 HTTPS（`Basic` 明文凭据走 HTTP 等于公开密码）。`encodeAuth` 用 `TextEncoder` + `btoa` 处理中文用户名：

```ts
function encodeAuth(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}
```

### 8.7 BLE 心率（`src/lib/heart-rate.ts`，130 行）

两条完全不同的通道，用 `Capacitor.isNativePlatform()` 分流：

```ts
export function connectHeartRate(onValue: (heartRate: number) => void): Promise<HeartRateSession> {
  return Capacitor.isNativePlatform() ? connectNative(onValue) : connectWeb(onValue);
}
```

**心率广播的协议细节**（Web 与原生共用解析器）：

```ts
export function parseHeartRate(value: DataView) {
  if (!value || value.byteLength < 2) return null;
  const flags = value.getUint8(0);
  const heartRate = (flags & 0x01) === 0 ? value.getUint8(1) : value.getUint16(1, true);
  return heartRate >= 30 && heartRate <= 220 ? heartRate : null;
}
```

这是 BLE Heart Rate Measurement（0x2A37）的规范：flags 的最低位 `0` 表示心率是 `uint8`，`1` 表示 `uint16`（小端）。不做这个判断，遇到支持 uint16 的设备读出来是乱码。

**原生端（安卓）**：

```ts
// 原生端只接受完整的 128 位 UUID，短 UUID '180D' 会被插件校验拒绝
const HEART_RATE_SERVICE      = '0000180d-0000-1000-8000-00805f9b34fb';
const HEART_RATE_MEASUREMENT  = '00002a37-0000-1000-8000-00805f9b34fb';

async function connectNative(onValue: (heartRate: number) => void): Promise<HeartRateSession> {
  // androidNeverForLocation: 只做心率读取，不用于定位，Android 12+ 无需申请定位权限
  try {
    await BleClient.initialize({ androidNeverForLocation: true });
  } catch (reason) {
    throw new Error(`蓝牙未就绪：${detailOf(reason)}。请确认已允许「附近的设备」权限并打开蓝牙`);
  }

  const device = await pickDevice();
  try { await connectDevice(device.deviceId); }
  catch (reason) { throw new Error(`连接 ${device.name || '设备'} 失败：${detailOf(reason)}。请先在其他 App 中断开该设备后重试`); }

  try {
    await BleClient.startNotifications(device.deviceId, HEART_RATE_SERVICE, HEART_RATE_MEASUREMENT, (value) => {
      const heartRate = parseHeartRate(value);
      if (heartRate) onValue(heartRate);
    });
  } catch (reason) {
    await BleClient.disconnect(device.deviceId).catch(() => undefined);
    throw new Error(`该设备未提供标准心率广播（0x2A37）：${detailOf(reason)}`);
  }

  return {
    deviceName: device.name || '穿戴设备',
    stop: async () => {
      await BleClient.stopNotifications(device.deviceId, HEART_RATE_SERVICE, HEART_RATE_MEASUREMENT).catch(() => undefined);
      await BleClient.disconnect(device.deviceId).catch(() => undefined);
    },
  };
}

async function pickDevice() {
  try {
    return await BleClient.requestDevice({ services: [HEART_RATE_SERVICE], optionalServices: [HEART_RATE_SERVICE] });
  } catch (reason) {
    const detail = detailOf(reason);
    if (/cancel|abort|user/i.test(detail)) throw new Error('已取消，未选择设备');
    throw new Error(`没有搜索到心率设备：${detail}。请靠近设备，并让手环/手表开启「心率广播」或运动模式；若已被手机自带健康 App 连接，请先断开`);
  }
}

async function connectDevice(deviceId: string) {
  try { await BleClient.connect(deviceId); }
  catch (reason) {
    // Android 首次连接常因设备还在上一轮扫描/连接状态而返回 GATT 133，稍等重试一次
    await new Promise((resolve) => setTimeout(resolve, 800));
    try { await BleClient.connect(deviceId); }
    catch { throw reason; }
  }
}
```

**网页端（Web Bluetooth）**：

```ts
async function connectWeb(onValue: (heartRate: number) => void): Promise<HeartRateSession> {
  const bluetooth = (navigator as BluetoothNavigator).bluetooth;
  if (!bluetooth) throw new Error('请使用支持 Web Bluetooth 的 Chrome 浏览器');
  const device = await bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
  if (!device.gatt) throw new Error('设备不支持蓝牙连接');
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService('heart_rate');
  const characteristic = await service.getCharacteristic('heart_rate_measurement');
  const listener: EventListener = (event) => {
    const heartRate = parseHeartRate((event.target as any).value as DataView);
    if (heartRate) onValue(heartRate);
  };
  characteristic.addEventListener('characteristicvaluechanged', listener);
  await characteristic.startNotifications();
  return {
    deviceName: device.name || '穿戴设备',
    stop: async () => {
      characteristic.removeEventListener('characteristicvaluechanged', listener);
      await characteristic.stopNotifications().catch(() => undefined);
      server.disconnect();
    },
  };
}
```

网页端用**别名**（`heart_rate` / `heart_rate_measurement`），浏览器自己映射到 128 位 UUID；原生端必须用完整 UUID。这个差异就是「电脑能用、安卓报 Invalid UUID format 180d」的根因。

### 8.8 安卓壳（Capacitor 8）

`capacitor.config.ts`：

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.healthagent.vault',
  appName: 'Ai·健康',
  webDir: 'dist',
  server: { androidScheme: 'https' },     // 让 WebView 里的 origin 是 https://localhost，避免混合内容限制
  ios: { contentInset: 'never' },
};

export default config;
```

`AndroidManifest.xml` 关键项：

```xml
<activity
    android:name=".MainActivity"
    android:screenOrientation="landscape"
    android:launchMode="singleTask"
    android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density"
    android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
    </intent-filter>
</activity>

<uses-feature android:name="android.hardware.bluetooth_le" android:required="false" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" android:maxSdkVersion="30" />
```

权限这套写法是踩坑后的结果：`BLUETOOTH_SCAN` 加 `neverForLocation` 声明「扫描不用于定位」，Android 12+ 就不再要求定位权限；但插件内部仍会检查 `ACCESS_FINE_LOCATION`，所以老版本的 `ACCESS_FINE_LOCATION`/`COARSE` 都保留并标 `maxSdkVersion="30"`（只在 Android 11 及以下生效）。

隐藏状态栏（`MainActivity.java`）：

```java
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        hideStatusBar();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideStatusBar();     // 从系统面板返回时重新隐藏
    }

    private void hideStatusBar() {
        WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.statusBars());
    }
}
```

### 8.9 构建与签名

```bash
# 网页
npm run build                       # tsc -b && vite build → dist/

# 安卓调试包
export JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk-22.jdk/Contents/Home   # Capacitor 8 需 JDK 21+
npm run build && npx cap copy android
cd android && ./gradlew assembleDebug

# 安卓发行包（需先配签名）
cd android && ./gradlew assembleRelease
```

签名材料（**丢了就无法给已安装用户发升级包**）：

```properties
# android/keystore.properties
storeFile=app/aihealth-release.jks
storePassword=********
keyAlias=aihealth
keyPassword=********
```

```gradle
// android/app/build.gradle 片段
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file("keystore.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    defaultConfig {
        applicationId "com.healthagent.vault"
        versionCode 20
        versionName "2.0"
    }
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
    buildTypes {
        release {
            minifyEnabled false
            signingConfig signingConfigs.release
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

**生成图标**（`scripts/generate-icons.mjs`，用 sharp 从一张 1024 母图批量出全套）：

```js
const backgroundSvg = Buffer.from(`
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#FFD0D2"/><stop offset="1" stop-color="#F4AEB5"/>
  </linearGradient></defs>
  <rect width="1024" height="1024" rx="220" fill="url(#bg)"/>
</svg>`);

const cross = await sharp(iconSource).resize(338, 338, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
const icon1024 = await sharp(backgroundSvg).composite([{ input: cross, gravity: 'center' }]).png().toBuffer();

await sharp(icon1024).resize(512, 512).png().toFile(join(root, 'public/app-icon.png'));
await sharp(icon1024).resize(64, 64).png().toFile(join(root, 'public/favicon.png'));

// 安卓 mipmap：mdpi 48 / hdpi 72 / xhdpi 96 / xxhdpi 144 / xxxhdpi 192
for (const [density, size] of [['mdpi',48],['hdpi',72],['xhdpi',96],['xxhdpi',144],['xxxhdpi',192]]) {
  const dir = join(androidRes, `mipmap-${density}`);
  const icon = await sharp(icon1024).resize(size, size).png().toBuffer();
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="white"/></svg>`);
  const round = await sharp(icon).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  await sharp(icon).toFile(join(dir, 'ic_launcher.png'));
  await sharp(round).toFile(join(dir, 'ic_launcher_round.png'));

  // 自适应图标前景：1.5 倍画布 + 居中图案
  const foregroundSize = Math.round(size * 2.25);
  const foregroundCross = await sharp(iconSource).resize(Math.round(foregroundSize * 0.36), Math.round(foregroundSize * 0.36), { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const foreground = await sharp({ create: { width: foregroundSize, height: foregroundSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: foregroundCross, gravity: 'center' }]).png().toBuffer();
  await sharp(foreground).toFile(join(dir, 'ic_launcher_foreground.png'));
}
```

### 8.10 静态托管要点

- 产物 `dist/` 只有 700KB（`index.html` + 3 个 assets + 2 张图标），无任何服务端依赖。
- `base: './'` → 放根域名或 `/health/` 子目录都行。
- 无 router → **不需要 history fallback**（配了也无害）。
- 边缘函数 CORS 是 `*` 且处理 `OPTIONS`，浏览器可直连 `*.supabase.co`。
- 换域名后要去 Supabase 后台把 **Site URL / Redirect URLs** 换成线上域名，否则「重置密码」邮件里的链接会跳回本机。
- `localStorage` 按 origin 隔离：从本机迁到线上，旧档案不会自动带过去，需「导出 JSON → 线上导入」。

```nginx
location / {
    root /var/www/ai-health;
    try_files $uri $uri/ /index.html;
}
location /assets/ {
    root /var/www/ai-health;
    expires 1y;
    add_header Cache-Control "public, immutable";
}
location = /index.html {
    root /var/www/ai-health;
    add_header Cache-Control "no-cache";
}
```

---

## 9. 从零重建的施工顺序

按这个顺序做，每步都有可验证的产出，不会做到一半发现地基不对。

### 第 0 步：环境
- Node 20+、JDK 21/22（安卓打包用）、Android SDK。
- 新建 Vite + React + TS 工程：`npm create vite@latest web -- --template react-ts`。
- 装依赖：`npm i lucide-react gsap @supabase/supabase-js @capacitor/core @capacitor/camera @capacitor/filesystem @capacitor-community/bluetooth-le`。
- **验收**：`npm run dev` 出默认页。

### 第 1 步：先把设计系统的 CSS 变量和三栏骨架写上
写 `styles.css` 的 `:root`、`.app`、`.app.theme-dark`、`.app-shell`、`.overview-panel`、`.main-panel`、`.navigation-rail`。
- **验收**：空页面就是「白底 + 左侧粉色空栏 + 右侧 72px 空栏」，缩放窗口到 986×486 不换行不塌。

### 第 2 步：数据层（不碰 UI）
`types.ts` → `data.ts`（先只写 `METRICS`、`createEmptyVault`、`createSeedVault`、`sortRecords`、`latestRecord`）→ `lib/store.ts`。
- **验收**：控制台 `loadVault()` 返回一个 8 个空数组的合法 Vault；`createSeedVault()` 每条指标 6 条记录。

### 第 3 步：算法层
补 `getOptimalRange`、`getMetricAnalysis`、`getHealthAssessment`、`getDaily`、`generateAdvice`、`analyzeTextLocally`、`toMarkdown`。
- **验收**（用演示档案跑一遍，结果必须一致）：
  - `getHealthAssessment(seed).score === 80`，`keyIssue` 含「体脂率」；
  - `getDaily(seed).progress === 70`（5600/8000）；
  - `generateAdvice(seed)[0].title === '轻快走 24 分钟'`（剩余 8000-5600=2400 步 → ceil(2.4)=3 → 3×8=24 分钟）；
  - 把 `profile.limitation` 改成 `lower` 后，`generateAdvice` 的第一条变成「上肢循环训练…」，第三条变成「坐姿力量训练」。

### 第 4 步：左栏 + 首页
`OverviewPanel`（含圆环 SVG 与 GSAP 数字）→ `TrendChart` → `Dashboard`。
- **验收**：圆环从 0 滚到 80、`3/8` 覆盖数正确、8 张卡片的顶边颜色分别为「红（体脂偏高）/ 灰（其余无记录项）」、折线有面积渐变且描线动画正常。

### 第 5 步：二级页与数据页
`MetricDetail` → `RecordsPage`。
- **验收**：点任意卡片进入详情，改表单数值越界时保存按钮禁用；删除记录有 confirm；「运动建议」tab 的小圆环角度 = 进度 × 3.6°。

### 第 6 步：设置页
`SettingsPage` 八个分区按顺序写，表单状态全部本地 `useState`，只有「保存设置」时才 `onSave`。
- **验收**：填身高 176 + 体重 66.8 后 BMI 显示 21.6；保存后首页体重卡片出现今天的一条「设置页录入」记录（同一天再改是覆盖不是新增）。

### 第 7 步：登录注册 + 云端
先在控制台建项目 → 跑 `schema.sql` → 跑 `grants.sql` → 关掉邮箱确认 → 填 `.env` → 写 `lib/supabase.ts` 与 `AuthPage`。
- **验收**：注册后立刻是登录态（不需要点邮件）；`profiles` 表出现一行且 `display_name` 是注册时填的称呼；刷新页面仍是登录态。

### 第 8 步：AI 链路
部署 `analyze-report` + 设 `KIMI_API_KEY`/`KIMI_MODEL` → 写 `lib/ai.ts` → `ScanPage`。
- **验收**：
  - 未登录点「开始整理」→ 提示「请先在设置中登录」并出现「去登录」按钮；
  - 登录但没体验期 → 「体验已结束，请开通会员后再解析」+「去开通」；
  - 点了「申请 24h 体验」后 → 粘贴示例报告 → 返回 8 项指标进核对表 → 可编辑 → 归档后首页多出 8 条 `scan` 来源记录 + 1 份资料。

### 第 9 步：心率
先做 Web Bluetooth（`connectWeb`），再做原生（`connectNative`）。
- **验收**：电脑 Chrome 连手环能看到 bpm 跳动、点「记录心率」写进档案且来源是 `穿戴设备`；安卓装包后连接不报 UUID 错误。

### 第 10 步：打包
`capacitor.config.ts` → `npx cap add android` → 改 manifest（landscape、权限）→ `MainActivity` 隐藏状态栏 → 图标脚本 → 签名 → `assembleRelease`。
- **验收**：安装后**横向**打开、无状态栏、图标是粉底黑十字、`versionName 2.0`。

### 可视化搭建工具的对应关系（不用写代码时怎么映射）

如果重建环境是可视化/低代码搭建而非手写 React，按这张表对应：

| 代码概念 | 搭建工具里的等价物 |
|---|---|
| `App.tsx` 的 `page` 状态机 | 多页面 / 页面容器 + 条件显示，或「页面跳转」动作 |
| `Vault` 单个 JSON | 「数据模型」里建一张单行表（字段：profile、metrics JSON、documents JSON），或直接用本地存储变量 |
| `METRICS` 常量数组 | 配置表 / 字典，8 行 12 列，页面用「列表」组件绑定 |
| `getHealthAssessment` 扣分规则 | 公式字段或「条件赋值」节点：初始 100，逐个条件减分，最后 clamp(0,100) |
| `TrendChart` | 折线图组件，X 取日期、Y 取数值，只取最近 6 条，开面积填充 |
| 圆环 | 进度环组件，值绑定健康率，开圆角端点 |
| `analyze-report` 边缘函数 | 后端「AI 节点 / 工作流」，系统提示词原样粘进去，模型选视觉模型，输出解析成 JSON |
| `profiles.trial_ends_at` | 用户表的日期字段 + 每次 AI 调用前的前置校验节点 |
| `localStorage` 按用户分键 | 数据表的行级权限（按 user_id 过滤） |

**关键：不管用什么工具，那三段提示词和扣分规则必须原样搬过去**，界面换了不影响效果，规则改了就变了个产品。

---

## 10. 十个坑位清单（都是真实踩过的）

| # | 现象 | 根因 | 修法 |
|---|---|---|---|
| 1 | `./gradlew assembleDebug` 报「无效源发行版 21」 | Capacitor 8 要求 JDK 21+，系统默认还是 17 | `export JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk-22.jdk/Contents/Home` |
| 2 | Kimi 调不通，404 model not found | `moonshot-v1-32k-vision-preview` / `kimi-latest` 都无效 | 先 `curl /v1/models` 列出来，实际可用是 `kimi-k2.6` |
| 3 | 加了 `temperature` 就 400 | `kimi-k2.6` 不接受自定义采样参数 | 请求体里删掉 `temperature` |
| 4 | 模型把 `<数值>` 占位符原样吐回来，JSON 解析失败 | 示例里写的是占位符 | 示例改成真实数值 + 一句「绝不能照抄示例」+ 失败后自动纠错一次 |
| 5 | 前端读 `profiles` 报 42501 | 只建了 RLS，没给表级 GRANT | 执行 `grants.sql`：`grant select, update on public.profiles to authenticated` |
| 6 | 注册成功但一直没有登录态 | 后台开了「Confirm email」 | Management API 打 `mailer_autoconfirm: true`，或后台手动关 |
| 7 | 本机浏览器连 Supabase 报 `SSL_ERROR_SYSCALL` | 中间网络对 `*.supabase.co` 做 TLS 重置（CORS 其实是通的） | Vite 加 `/sb` 同源转发（`https-proxy-agent`），客户端按 hostname 自动切换 |
| 8 | 窄屏品牌名换行、压住折叠按钮 | `.brand` 有两条重复定义，且 flex + space-between 不让文字收缩 | 删重复规则；`.brand-row` 改 grid `minmax(0,1fr) auto`；窄屏字号写在**文件最后**的 `@media` 里 |
| 9 | 安卓 BLE 报缺 `ACCESS_FINE_LOCATION` | 清单里该权限带 `maxSdkVersion=30`，Android 12+ 被过滤，但插件仍检查 | 补 `ACCESS_COARSE_LOCATION` + `initialize({ androidNeverForLocation: true })` |
| 10 | 安卓报 `Invalid UUID format 180d` | 插件只接受 128 位 UUID，短 UUID 用于 Web Bluetooth 别名 | 原生分支全部改 `0000180d-…` / `00002a37-…`，并加 800ms 重试绕开 GATT 133 |

额外一条工程经验：`npx cap sync android` 的 update 阶段在本机会被批量删除守卫拦下（一次删太多文件），但 **copy 阶段已经成功**，直接进 `android/` 跑 gradle 就行，不影响产物。

---

## 11. 附：文件-职责-关键点速查

| 文件 | 行数 | 一句话 | 重建时的关键点 |
|---|---|---|---|
| `src/App.tsx` | 195 | 状态机 + 数据写入 + 动画 + Toast | 演示隔离的三层保护 |
| `src/types.ts` | 109 | 全部类型 | `Vault` 的结构决定了后面一切 |
| `src/data.ts` | 269 | 指标定义、评分、建议、解析、导出 | 扣分表权重、限制分支、双区间 |
| `src/styles.css` | 606 | 全部样式 | 五档红 + 三栏 grid + 三个断点 |
| `src/lib/store.ts` | 121 | 档案读写/导入导出/WebDAV/压缩 | `normalize` 兜底 |
| `src/lib/supabase.ts` | 53 | 客户端 + 体验期 | 本机走 `/sb`，线上直连 |
| `src/lib/ai.ts` | 49 | 调边缘函数 + 清洗 | 演示模式短路、结果二次校验 |
| `src/lib/heart-rate.ts` | 130 | Web + 原生 BLE | 完整 UUID、flags 位运算、GATT 重试 |
| `components/OverviewPanel.tsx` | 68 | 圆环 + 关键发现 | `C = 2πr`、数字滚动、grid 品牌行 |
| `components/Dashboard.tsx` | 88 | 8 张指标卡 + 建议 | 区间条三处百分比计算 |
| `components/MetricDetail.tsx` | 79 | 指标详情 | `key` 强制重挂载 |
| `components/TrendChart.tsx` | 63 | 自绘折线 | 4 个边界条件 |
| `components/ScanPage.tsx` | 155 | 三步扫描 | 双通道拍照、错误分流按钮 |
| `components/RecordsPage.tsx` | 93 | 三 tab 数据页 | sparkline 复用、模态正确止冒泡 |
| `components/SettingsPage.tsx` | 196 | 八分区设置 | 体重落成当天记录 |
| `components/AuthPage.tsx` | 63 | 登录注册 | 注册即登录的判定 |
| `components/NavigationRail.tsx` | 25 | 竖排导航 | `writing-mode: vertical-rl` |
| `components/MetricIcon.tsx` | 15 | 图标映射 | 8 个 if，无 switch |
| `components/HeartRateCapture.tsx` | 48 | 实时心率 | 卸载断开、防重复记录 |
| `supabase/functions/analyze-report/index.ts` | 168 | Kimi 代理 | 三道门、提示词、一次纠错 |
| `supabase/schema.sql` | 74 | 建表/RLS/触发器/RPC | `with check` 防自助升级 |
| `scripts/generate-icons.mjs` | 60 | 图标生成 | 自适应前景 2.25 倍画布 |

---

**最后一句提醒**：这套东西的价值不在界面，在 5.3 的扣分表、5.6 的限制分支和 8.4 的提示词。界面换一套写法照样能用，这三块改了就不是同一个产品了。

