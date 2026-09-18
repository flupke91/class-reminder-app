---
name: gmu-timetable-fetch
description: 抓取赣南医科大学（GMU）教务系统课表并导入手机上的「上课啦」App。当用户提到"导入课表"、"更新课表"、"教务系统课表"、"上课啦"、"gmu.jw.chaoxing.com"、"赣南医科大学课表"，或课表显示为空/周次不对需要重新抓取时使用。支持扫码登录（不需要用户提供账号密码），手机需已 root 且 adb 已连接。
agent_created: true
---

# GMU 课表抓取与导入

## 概述

从赣南医科大学教务系统（超星平台，https://gmu.jw.chaoxing.com ）抓取本学期课表，
解析成「上课啦」App（`com.classbell.app`，Capacitor WebView 应用）的格式，写入手机。
全程用扫码登录，不需要用户提供学号密码。

前置条件：手机已 root、adb 已连接、已安装「上课啦」App。

## 安装

本目录是 skill 的仓库版本，脚本本体在 `tools/gmu/`。使用时把整个目录复制到用户级
skill 目录，并把脚本一起带上：

```bash
mkdir -p ~/.workbuddy/skills/gmu-timetable-fetch/scripts
cp skills/gmu-timetable-fetch/SKILL.md ~/.workbuddy/skills/gmu-timetable-fetch/
cp tools/gmu/*.js tools/gmu/*.py ~/.workbuddy/skills/gmu-timetable-fetch/scripts/
```

## 三步流程

按顺序执行 `tools/gmu/` 下的三个脚本，每步的产物都在 `tools/gmu/out/`（已 gitignore）：

```bash
# 0. 准备（只需一次）
npm i playwright-core           # 用系统已有的 Chrome，不额外下载 Chromium

# 1. 扫码登录 + 抓课表（需要用户用学习通 App 扫二维码）
node tools/gmu/fetch_timetable.js

# 2. 解析成 App 格式
GMU_MY_CLASS="<用户的班级，如 24级护理4班>" python tools/gmu/parse_timetable.py

# 3. 写入手机（可选，也可以让用户手动粘 JSON 导入）
python tools/gmu/apply_to_device.py
```

### 第 1 步：fetch_timetable.js

- 打开登录页，自动切到「扫码登录」，把二维码截图存到 `tools/gmu/out/qr.png` —— **把这个文件给用户看，等他用学习通 App 扫码**，脚本会自己轮询直到登录成功（最多 8 分钟，二维码每 20 秒自动重截）
- 登录态保存在 `tools/gmu/out/chrome-profile`，短时间内再跑不用重新扫码
- 调 `POST /admin/xsd/yxkccx/listYxkc` 一次拿全本学期已选课程（含 `sksjdd` 上课时间地点）
- 顺带调 `getXqByZc` 逐周探测今天是第几周（找 `sfdt=true` 那天），用于推算学期开始日期
- 产物：`out/raw-timetable.json`

设置环境变量 `CHROME_PATH` 可指定浏览器路径；默认自动探测常见安装位置。

### 第 2 步：parse_timetable.py

- 把 `sksjdd` 解析成课程数组（周次/星期/节次/教室），并推算学期开始日期
- 产物：`out/courses.json`（可粘进 App 的 JSON 导入框）、`out/app-state.json`（完整状态）
- `GMU_MY_CLASS` 用于在合班课里挑出用户自己的班级，不设则取第一个
- 输出里会打印学期名和学期开始日期，**务必核对**，为空则第 3 步后要在 App 里手动校准

### 第 3 步：apply_to_device.py

- 直接替换 `/data/data/com.classbell.app/shared_prefs/CapacitorStorage.xml`（Capacitor Preferences）
- 自动保留原文件的属主/权限/SELinux 上下文，写之前先备份到 `/sdcard/CapacitorStorage.xml.bak-<时间戳>`
- 写完自动重启 App。出问题用备份文件还原即可
- 包名不同可用环境变量 `CLASSBELL_PKG` 覆盖

不想动手机的话，把 `out/courses.json` 内容给用户，让他在 App 的
「导入课表 → JSON → 粘贴内容 → 导入并覆盖」里粘贴导入。

## 关键知识点（踩过的坑）

### 1. 课表接口不稳定，不要用

`POST /admin/getXsdSykb`（按周返回课表网格）服务端经常直接 500，连教务页面自己调它也报错。
**一律走 `POST /admin/xsd/yxkccx/listYxkc`**（已选课程查询），一次请求拿全学期。

### 2. sksjdd 字段格式

```
第8周 星期五 1-8节【见习场所11（章贡）】,第4周 星期二 1-2节 第4,7周 星期一 1-2节【11合班（章贡）】
```

- `;` 分大块，`,` 分小组
- **`【地点】` 写在小组末尾，作用于该小组内的全部时间段** —— 上例两个时间段都在 11合班（章贡）
- 周次写法多样：`第1,13周`、`第3-4,8周`、`第14-15周`，解析前要先保护周次列表里的逗号
- 小组没写 `【地点】` 时，若整个大块里只有一个教室就继承它，否则留空

这条规则是用教务系统第 1 周的课表网格数据交叉验证过的，不要凭直觉改。

### 3. 学期开始日期是课表显示为空的头号原因

App 用 `week = floor((今天 - 学期开始日期)/7) + 1` 算周次。
学期开始日期一旦停在上一学期，算出的周次就会超过课表范围，课表一片空白、
却毫无提示，用户只会以为「导入失败」。

抓到新学期数据后，务必确认学期开始日期已更新（第 1 周的周一）。
App 本身已内置「校准周次」入口（课表过期时会出现横幅）。

### 4. 解析逻辑改了要跑回归测试

`tools/test-parsers.js` 从 `app.js` 里抽函数做测试（含多位教师轮班合并、
NaN 脏数据拒绝、学期过期检测、班级名提取、真实课表冒烟测试）：

```bash
node tools/test-parsers.js
```

改了 `normalizeCourse` / `mergeDuplicateCourses` / `parseSksjdd` 之后必跑。

### 5. App 里的 JS 有一份 GBK 双编码的坏版本

仓库里的 `app.js` 曾经是 UTF-8 被当成 GBK 再编码回来的版本，所有中文提示、
正则、界面文案都是乱码。判断方法：用 UTF-8 打开看中文是否正常。
来源以仓库 `app.js` 为准，必要时从已安装 APK 的 `assets/public/app.js` 取回。
