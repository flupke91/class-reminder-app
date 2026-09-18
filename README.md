# 上课啦 (Class Bell)

一个简洁的课程提醒 Web 应用，支持多种课表导入格式，提供浏览器通知提醒功能。

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
git clone https://github.com/your-username/class-reminder-app.git

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
node tools/test-parsers.js   # 回归测试：课表合并、字段校验、周次检测
```

## 更新记录

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
详见 [tools/gmu/README.md](tools/gmu/README.md)）。

## 技术栈

- HTML5 / CSS3 / JavaScript (ES6+)
- Capacitor (Android 原生封装)
- SheetJS (Excel 文件解析)

## 许可证

ISC License
