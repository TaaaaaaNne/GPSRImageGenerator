# GPSR 图片生成器 PyQt6 高颜值前端与架构方案

本方案在坚持“零外部依赖、极小体积”的基础上，通过精心调配的布局结构与高级 QSS 样式，赋予 PyQt6 桌面应用现代、专业、清爽的视觉体验。

## 1. 视觉美学与交互原则

为了达到“好看且好用”的工具型软件标准，我们采用以下设计规范：

- **色彩体系 (Color Palette)：**
  
  - **主品牌色：** `#0066FF` (现代科技蓝，用于生成按钮，提供清晰的视觉焦点)。
  
  - **背景色：** `#F5F7FA` (底层窗口背景) + `#FFFFFF` (核心操作面板背景，形成卡片式悬浮感)。
  
  - **文字色：** `#1D1D1F` (主标题/重要文本) / `#86868B` (次要说明/占位符)。
  
  - **边框色：** `#E5E5EA` (柔和的分割线，拒绝生硬的黑线)。

- **空间排版 (Spacing)：** 告别拥挤的传统排版。全局使用大间距 (`spacing=16` 到 `24`)，组件内部增加内边距 (`padding`)，让界面呼吸感充足。

- **现代化元素：** 全局圆角 (`border-radius: 6px` 到 `8px`)，无衬线字体 (`Segoe UI`, `San Francisco`)，取消传统菜单栏和状态栏。

- **微交互 (Micro-interactions)：** 按钮悬浮变色、点击下压、输入框聚焦高亮。

## 2. 界面信息架构与布局蓝图

窗口尺寸建议锁定在 **宽 640px，高 520px**，禁止随意拉伸，确保完美比例。

整个窗口采用“卡片式” (Card UI) 结构：

```
+-------------------------------------------------------------+
|  QMainWindow (背景色: #F5F7FA)                              |
|  +-------------------------------------------------------+  |
|  | QWidget 卡片面板 (背景色: #FFFFFF, 圆角, 细阴影)      |  |
|  |                                                       |  |
|  |  [标题栏区]                                           |  |
|  |  "GPSR 图片批量生成器" (大号加粗字体)                 |  |
|  |  "根据 ASIN.xlsx 自动匹配并整理店铺图片" (浅色小字)   |  |
|  |                                                       |  |
|  |  [输入区 (带拖拽)]                                    |  |
|  |  +-------------------------------------------------+  |  |
|  |  | 📄  C:/Users/.../ASIN.xlsx           [浏览文件] |  |  |
|  |  +-------------------------------------------------+  |  |
|  |                                                       |  |
|  |  [操作区]                                             |  |
|  |  [ 🚀 立即生成图片 (品牌色大按钮) ]  [ 📁 打开位置 ]  |  |
|  |                                                       |  |
|  |  [反馈区]                                             |  |
|  |  +-------------------------------------------------+  |  |
|  |  | 准备就绪...                          |  |  |
|  |  | 发现新店铺：吕国强-IT                |  |  |
|  |  | 成功：已生成 B0H6JMVR9G.PS01.jpg     |  |  |
|  |  +-------------------------------------------------+  |  |
|  |  [======== 进度条 (高度 6px，纯色无文字) ========]    |  |
|  +-------------------------------------------------------+  |
+-------------------------------------------------------------+
```

## 3. 核心视觉样式源码 (Premium QSS)

这是让 PyQt6 瞬间变好看的核心。无需外部 UI 库，直接在 Python 中应用这段字符串：

```
/* 全局无边框与背景 */
QMainWindow {
    background-color: #F5F7FA;
    font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
}

/* 核心卡片容器 */
QWidget#mainCard {
    background-color: #FFFFFF;
    border-radius: 12px;
    border: 1px solid #EAECEF;
}

/* 标题样式 */
QLabel#mainTitle {
    font-size: 20px;
    font-weight: 600;
    color: #111827;
}
QLabel#subTitle {
    font-size: 13px;
    color: #6B7280;
}

/* 输入框：大号、圆角、聚焦高亮 */
QLineEdit {
    background-color: #F9FAFB;
    border: 1px solid #D1D5DB;
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 13px;
    color: #374151;
}
QLineEdit:focus {
    border: 1px solid #0066FF;
    background-color: #FFFFFF;
}

/* 次要按钮（选择文件、打开位置） */
QPushButton#btnSecondary {
    background-color: #FFFFFF;
    border: 1px solid #D1D5DB;
    border-radius: 6px;
    padding: 8px 16px;
    color: #374151;
    font-weight: 500;
}
QPushButton#btnSecondary:hover {
    background-color: #F3F4F6;
    color: #000000;
}
QPushButton#btnSecondary:disabled {
    background-color: #F3F4F6;
    color: #9CA3AF;
    border: 1px solid #E5E7EB;
}

/* 主操作按钮：品牌色、醒目 */
QPushButton#btnPrimary {
    background-color: #0066FF;
    border: none;
    border-radius: 6px;
    padding: 10px 0px; /* 增加高度 */
    color: #FFFFFF;
    font-size: 14px;
    font-weight: bold;
}
QPushButton#btnPrimary:hover {
    background-color: #005ce6;
}
QPushButton#btnPrimary:pressed {
    background-color: #0052cc;
}
QPushButton#btnPrimary:disabled {
    background-color: #93C5FD; /* 禁用时的浅蓝色 */
    color: #FFFFFF;
}

/* 日志输出区：极客感，等宽字体 */
QPlainTextEdit {
    background-color: #1E1E1E;
    color: #D4D4D4;
    border: none;
    border-radius: 6px;
    padding: 10px;
    font-family: "Consolas", "Menlo", monospace;
    font-size: 12px;
    line-height: 1.5;
}

/* 极致简约的进度条 */
QProgressBar {
    border: none;
    background-color: #F3F4F6;
    border-radius: 3px;
    height: 6px; /* 极细进度条 */
    text-align: center;
}
QProgressBar::chunk {
    background-color: #0066FF;
    border-radius: 3px;
}
```

## 4. 前后端解耦与并发架构

坚持前端只负责“好看”和“交互”，复杂的解析全部分离。

### 目录结构规划

```
gpsr_image_tool/
├── main.py                     # GUI 入口，加载 QSS，组装控件
├── core/
│   ├── gpsr_service.py         # 纯 Python 逻辑：只管解压/读文件/拷文件
│   └── validators.py           # 二进制读取验证 JPG (b'\xff\xd8\xff')
└── gui/
    ├── components.py           # 封装自定义控件 (如支持拖拽的 QLineEdit)
    └── worker.py               # QThread 工作线程
```

### 解决 UI 卡死的终极方案：信号阻塞回调

当后台校验发现 `吕国强-IT.jpg` 缺失时，必须暂停，让前端弹窗：

```
# gui/worker.py
from PyQt6.QtCore import QThread, pyqtSignal

class ProcessTask(QThread):
    # 【神级信号】传递参数给主线程，要求主线程弹窗，主线程将结果填入 user_choice 列表返回
    sig_need_image = pyqtSignal(str, list)
    sig_log = pyqtSignal(str)

    def run(self):
        # ...业务循环...
        if image_missing:
            result_box = []
            # 发射信号，通过 BlockingQueuedConnection 会阻塞当前子线程，直到主线程处理完毕
            self.sig_need_image.emit("吕国强-IT", result_box)

            if not result_box or not result_box[0]:
                self.sig_log.emit("用户取消了选择，任务终止。")
                return # 终止

            # 继续使用 result_box[0] 的路径处理...
```

## 5. 极致体积控制与打包 (20MB 挑战)

为了让这个带 GUI 的应用保持极度轻巧，不使用任何外部解析库：

1. **Excel 解析器：** Python 内置的 `zipfile` 和 `xml.etree.ElementTree`。由于只读取 Sheet 名和第一列，解析 `xl/workbook.xml` 速度在毫秒级。

2. **图片校验：** 仅验证 Magic Number。

3. **零图标依赖：** 按钮上的图标使用 Unicode 符号 (如 🚀, 📁, 📄)，彻底抛弃 `.ico` 或外部图片依赖。

**PyInstaller 精简打包命令 (Windows)：**

```
pyinstaller --noconfirm --windowed --name "GPSR图片生成器" `
  --exclude-module pandas --exclude-module openpyxl --exclude-module PIL `
  --exclude-module tkinter --exclude-module numpy `
  --exclude-module PyQt6.QtNetwork --exclude-module PyQt6.QtQml `
  --exclude-module PyQt6.QtSql --exclude-module PyQt6.QtTest `
  --exclude-module PyQt6.QtWebEngineCore --exclude-module PyQt6.QtWebEngineWidgets `
  --exclude-module pydoc --exclude-module unittest `
  main.py
```

*通过严格的 `--exclude-module`，生成的单文件 EXE 可以极具震撼力地缩小到 25MB 以内。*

## 6. 提升体验的“神来之笔” (加分交互)

1. **拖拽支持 (Drag & Drop)：**
   
   - 重写 `QLineEdit` 的 `dragEnterEvent` 和 `dropEvent`。运营人员可以直接把 `ASIN.xlsx` 从桌面拖到输入框里，瞬间提升高级感。

2. **日志颜色分级：**
   
   - 利用 `QPlainTextEdit` 的 HTML 渲染能力。正常进度用灰色，成功用绿色 (`<span style="color:#10B981">成功</span>`)，需要手动干预或错误用显眼的红色 (`<span style="color:#EF4444">错误</span>`)。

3. **防抖与防重入：**
   
   - 点击“生成”后，立即 `btnPrimary.setDisabled(True)` 并改变文字为“正在生成中...”，进度条开始滚动。完成后恢复，防止狂点导致数据覆写。
