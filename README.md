# 上课啦 (Class Bell)

一个简洁的课程提醒 Web 应用，支持多种课表导入格式，提供浏览器通知提醒功能。

## 功能特性

- **可视化课表**：以周为单位展示课程表，支持快速切换周次
- **多格式导入**：
  - JSON 格式
  - iCal (.ics) 格式
  - Excel (.xlsx/.xls) 格式（支持学习通导出）
  - OCR 识别文本
- **智能提醒**：
  - 上午/下午课程汇总提醒
  - 课间换课提醒（可设置间隔阈值）
  - 浏览器原生通知
- **灵活设置**：
  - 自定义学期名称和开始日期
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

# 构建 Web 资源
mkdir www && cp index.html app.js styles.css favicon.svg manifest.json www/

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

## 技术栈

- HTML5 / CSS3 / JavaScript (ES6+)
- Capacitor (Android 原生封装)
- SheetJS (Excel 文件解析)

## 许可证

ISC License
