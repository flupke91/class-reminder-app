# 上课啦 (Class Bell)

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Web%20%7C%20Android-blue.svg)
![No build step](https://img.shields.io/badge/build-none%20required-success.svg)

课表提醒工具：Web / PWA 直接打开就能用，也能打包成 Android App。支持 JSON / iCal / Excel / OCR 四种导入方式，以及赣南医科大学教务系统扫码直抓；提醒走浏览器通知与 Android 原生 AlarmManager 双通道，杀进程也能响。

## 功能特性

- **可视化课表**：以周为单位展示课程表，支持快速切换周次
- **多格式导入**：
  - JSON 格式
  - iCal (.ics) 格式
  - Excel (.xlsx/.xls) 格式（支持学习通导出）
  - OCR 识别文本
  - **赣南医科大学教务系统一键抓取**（扫码登录，见 [tools/gmu](tools/gmu/README.md)）
- **智能提醒**：
  - 上午/下午课程汇总提醒
  - 课间换课提醒（可设置间隔阈值）
  - 浏览器原生通知 + Android 原生通知（AlarmManager，杀进程也能响）
- **灵活设置**：
  - 自定义学期名称和开始日期
  - **一键校准周次**（学期过期时会出现醒目提示）
  - 手动标记节假日/停课日
  - 单独控制每门课程的提醒开关
- **PWA 支持**：可安装到桌面使用

## 快速开始

### 在线使用

直接在浏览器中打开 `index.html` 即可使用。

### 本地运行

```bash
# 克隆项目
git clone https://github.com/flupke91/class-reminder-app.git

# 进入项目目录
cd class-reminder-app

# 使用任意 HTTP 服务器打开
# 例如使用 Python
python -m http.server 8080

# 或使用 Node.js
npx serve .
```

### 构建 Android 应用

```bash
# 安装依赖
npm install

# 构建 Web 资源（vendor/xlsx 也要一起，离线才能用 Excel 导入）
mkdir -p www/vendor
cp index.html app.js styles.css favicon.svg manifest.json bg.jpg courses-final.json www/
cp vendor/xlsx.full.min.js www/vendor/

# 添加 Android 平台
npx cap add android

# 同步到 Android 项目
npx cap sync android

# 使用 Android Studio 打开
npx cap open android
```

## 课表导入格式

### JSON 格式

```json
[
  {
    "name": "课程名称",
    "teacher": "教师姓名",
    "className": "班级",
    "room": "教室",
    "dayOfWeek": 1,
    "startPeriod": 1,
    "endPeriod": 2,
    "weeks": [1, 2, 3, 4, 5]
  }
]
```

### OCR 文本格式

```
周一 第1-2节 内科护理学（理论）｜301中班｜蓉江一教
周二 第3-4节 英语（理论）｜315中班｜蓉江一教
```

## 时间节次对照

| 节次 | 开始时间 | 结束时间 |
|------|----------|----------|
| 1    | 08:30    | 09:10    |
| 2    | 09:20    | 10:00    |
| 3    | 10:20    | 11:00    |
| 4    | 11:10    | 11:50    |
| 5    | 14:00    | 14:40    |
| 6    | 14:50    | 15:30    |
| 7    | 15:50    | 16:30    |
| 8    | 16:40    | 17:20    |
| 9    | 19:00    | 19:40    |
| 10   | 19:50    | 20:30    |

## 开发

```bash
npm test                     # 等同 node tools/test-parsers.js
```

回归测试覆盖两个真实踩过的坑（多教师轮班导致同一节课被切碎、自动导入的数据没走
`normalizeCourse` 而缺字段），外加基于 `courses-final.json` 的真实课表冒烟测试。
纯 Node 运行，不需要浏览器环境。

## 项目结构

```text
index.html / app.js / styles.css   全部产品代码（无构建步骤，原生 ES6 + CSS）
vendor/xlsx.full.min.js            Excel 解析库，仅在导入 xlsx 时按需加载
tools/gmu/                         教务系统抓取（扫码登录）
tools/test-parsers.js              解析函数回归测试
tools/legacy/                      教务接口探索期的一次性脚本（留档，非运行时依赖）
skills/gmu-timetable-fetch/        配套智能体 Skill
android/                           Capacitor 封装的 Android 工程
```

`vendor/xlsx.full.min.js` 有 861KB，**不在首屏加载**：`app.js` 的 `ensureXlsx()`
只在真正导入 Excel 时才注入这段脚本（先试本地 `./vendor/`，失败再回退 CDN）。

## 构建与发布 APK

环境要求：Node.js + `@capacitor/cli`、`android` 目录所需的 Android SDK（compileSdk 36）、
JDK（AGP 8.13 + Gradle 8.7，建议 JDK 17/21）。

```bash
# 1. 同步 Web 资源到 android 工程
node node_modules/@capacitor/cli/bin/capacitor sync android

# 2. 打包（debug 可直接装到手机；release 用于上架/分享）
cd android
./gradlew assembleDebug      # 产物：app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease   # 产物：app/build/outputs/apk/release/app-release.apk
```

### 正式签名

`android/keystore.properties`（已在 .gitignore，不入库）放签名信息：

```properties
storeFile=G:\\...\\classbell-release.keystore
storePassword=******
keyAlias=classbell
keyPassword=******
```

配好之后 `assembleRelease` 出的包是正式签名（与 debug 包签名不同，覆盖旧版需先卸载）。
没有这个文件时自动回退 debug 签名，`assembleRelease` 也不会失败。

> 本机 Gradle 8.7 已解压在 `G:\E\Opencodesandbox\gradle-8.7`，可跳过 wrapper 的联网下载直接构建。

## 更新记录

### 2026-10-23

首屏与布局修复：

- **Excel 解析库不再拖慢启动**：`vendor/xlsx.full.min.js` 有 861KB，此前以阻塞
  `<script>` 排在 `app.js` 之前，等于每次打开都要先下完它才能启动。`ensureXlsx()`
  本来就已经实现了按需加载 + CDN 回退，只是那段阻塞标签一直没删。移除后首屏
  **少下载 861KB**，且不再产生任何 xlsx 请求。
- **学期提示条在无需提示时也空占一行**：`.stale-term-notice` 写了 `display: flex`，
  而作者样式的优先级高于浏览器内置的 `[hidden] { display: none }`，所以 JS 里
  `el.hidden = true` 完全无效 —— 界面上表现为课表上方一直挂着一根空橙色横条。
  已补 `[hidden] { display: none !important }` 兜底。
- **窄屏（390px）周导航折行**：三个切周按钮原本 `flex-wrap: wrap`，第三颗「下一周」
  被挤到第二行，顶部面板从 44px 撑到 86px；学期名也会断成两行。已改为不折行 +
  按钮等分宽度 + 学期名 `nowrap`。实测面板高度 86 → 44px，首屏多露出一节课。
- **背景图滚动重绘**：`background-attachment: fixed` 贴在 `body` 上，移动端每滚动
  一帧都要重绘整张 1357×1920 图。已挪到 `body::before` 固定图层；同时把背景图
  从 255KB 压到 142KB（宽 1000px，手机上肉眼无差）。
- **仓库根目录瘦身**：29 个探索期脚本（`fetch_grid3.js`、`probe2.js` 之类）移入
  `tools/legacy/` 并补了索引说明，根目录现在只剩 `app.js` 一个脚本。
- `npm test` 之前是 `exit 1` 占位，现已指向真正能跑的 `tools/test-parsers.js`。

### 2026-09-18

修复一批课表导入问题（在真实使用中踩到的）：

- **学期过期无提示**（最影响使用的一个）：学期开始日期停在上一学期时，算出的周次会超出课表
  范围，课表一片空白且毫无提示。现在会在课表上方出现醒目横幅，并提供「校准周次」入口 ——
  填一下"今天是第几周"，自动反推学期开始日期，不用再去翻校历算。
- **同一门课被切碎**：合并周次时把 `teacher` 也算进了分组键，多位教师轮班上课时
  （比如一门课 11 位老师轮流上），200 条原始数据只能合并成 176 条碎片。
  现在按「课程 + 班级 + 时间 + 教室」分组，教师名单合并去重。
- **Excel 导入依赖 CDN**：`xlsx` 解析库原先从 jsdelivr 加载，校园网/离线场景直接报错
  "xlsx 解析库未加载"。现已打包进 `vendor/`，加载失败时才回退 CDN。
- **自动导入的数据缺字段**：`autoImportOnFirstRun` 没走 `normalizeCourse`，导入的课程缺
  `id` / `className` / `remindEnabled`；且只认 `day`/`week` 一种字段名。
- **`normalizeCourse` 不校验 NaN**：字段名写错（比如把 `dayOfWeek` 写成 `day`）时
  `Number(undefined)` 得到 `NaN`，而任何和 `NaN` 的比较都是 `false`，脏数据会静默混进课表。
- **`capacitor.config.json` 是非法 JSON**（多了一层大括号）。
- **源码乱码**：仓库里的 `app.js` 曾是 GBK 双编码版本，所有中文提示和解析正则都是坏的，
  已替换为正确的 UTF-8 版本。

另外新增了 `tools/gmu/` —— 赣南医科大学教务系统课表抓取工具（扫码登录，
详见 [tools/gmu/README.md](tools/gmu/README.md)）。配套的智能体 Skill 在
`skills/gmu-timetable-fetch/`，复制到 `~/.workbuddy/skills/` 即可让助手直接走完整流程，
里面也记录了教务接口的坑点。

## 技术栈

- HTML5 / CSS3 / JavaScript (ES6+)，无打包步骤
- Capacitor (Android 原生封装)
- SheetJS (Excel 文件解析，按需加载)

## 许可证

[MIT](LICENSE)
