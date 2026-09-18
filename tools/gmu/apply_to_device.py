#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 parse_timetable.py 生成的 app-state.json 直接写进手机上已安装的「上课啦」。

  用法: python tools/gmu/apply_to_device.py [app-state.json]

要求：手机已 root、已通过 adb 连接、已安装 com.classbell.app。
原理：App 用 Capacitor Preferences 持久化，数据落在
      /data/data/com.classbell.app/shared_prefs/CapacitorStorage.xml
      直接替换该文件即可（会自动保留原文件的属主/权限/SELinux 上下文，并先备份）。
"""
import json
import os
import subprocess
import sys
import xml.sax.saxutils as su
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get("GMU_OUT") or os.path.join(HERE, "out")

PKG = os.environ.get("CLASSBELL_PKG", "com.classbell.app")
KEY = "class-reminder-state-v1"
REMOTE_PREFS = f"/data/data/{PKG}/shared_prefs/CapacitorStorage.xml"


def sh(cmd, check=True):
    p = subprocess.run(cmd, shell=True, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if check and p.returncode != 0:
        raise RuntimeError(f"命令失败: {cmd}\n{p.stderr.strip()}")
    return p.stdout.strip()


def adb_su(cmd):
    """在设备上以 root 执行。

    引号要留两层：外层双引号给本机 shell（把整段当作一个参数交给 adb），
    内层单引号给设备上的 sh —— 否则 `>` `&&` 会被设备 sh 提前拆开，
    重定向就以普通权限执行，写入 /data/data 直接 Permission denied。
    """
    if "'" in cmd:
        raise RuntimeError("命令里不能包含单引号: " + cmd)
    return sh(f"adb shell \"su -c '{cmd}'\"")


def main():
    state_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(OUT, "app-state.json")
    if not os.path.exists(state_path):
        print(f"找不到 {state_path}，先运行 parse_timetable.py")
        return 1

    state = json.load(open(state_path, encoding="utf-8"))
    if not state.get("settings", {}).get("termStartDate"):
        print("警告：学期开始日期为空，课表可能显示不出来。请先在 App 里校准周次。")

    # 1) 在 PC 上生成 XML
    payload = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
    xml = (
        "<?xml version='1.0' encoding='utf-8' standalone='yes' ?>\n"
        "<map>\n"
        f'    <string name="{KEY}">{su.escape(payload)}</string>\n'
        "</map>\n"
    )
    local_xml = os.path.join(OUT, "CapacitorStorage.xml")
    open(local_xml, "w", encoding="utf-8").write(xml)

    # 2) 读取原文件的属主 / 权限 / SELinux 上下文，等下原样恢复
    try:
        owner = adb_su(f'stat -c %U:%G {REMOTE_PREFS}')
        mode = adb_su(f'stat -c %a {REMOTE_PREFS}')
        context = adb_su(f'ls -Z {REMOTE_PREFS}').split()[0]
    except RuntimeError as e:
        print(f"读取手机上的存储文件失败，确认 App 已安装且手机已 root：{e}")
        return 1

    # 3) 备份
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = f"/sdcard/CapacitorStorage.xml.bak-{stamp}"
    adb_su(f"cp {REMOTE_PREFS} {backup}")
    print(f"已备份原数据 -> 手机 {backup}")

    # 4) 推送并覆盖
    tmp = "/data/local/tmp/classbell-storage.xml"
    sh(f'adb push "{local_xml}" {tmp}')
    adb_su(f"am force-stop {PKG}")
    adb_su(
        f"cat {tmp} > {REMOTE_PREFS} && "
        f"chown {owner} {REMOTE_PREFS} && "
        f"chmod {mode} {REMOTE_PREFS} && "
        f"chcon {context} {REMOTE_PREFS} && "
        f"rm -f {tmp}"
    )
    adb_su(f"ls -Z {REMOTE_PREFS}")

    # 5) 重启 App
    sh(f'adb shell monkey -p {PKG} -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true')

    n = len(state.get("courses", []))
    print(f"\n完成：已写入 {n} 条课程，学期 {state['settings'].get('termName')}，"
          f"起始 {state['settings'].get('termStartDate')}")
    print("App 已重启，看一眼课表对不对。有问题就用上面的备份还原。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
