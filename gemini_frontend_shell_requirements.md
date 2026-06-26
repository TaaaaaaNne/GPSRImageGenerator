# GPSR 图片生成器前端套壳方案需求

请基于下面需求，重新设计一个全新的桌面前端套壳方案。不要参考任何现有前端代码，也不要假设已有 GUI 实现。

## 推荐技术栈

请使用 **PyQt6** 编写前端套壳。

选择 PyQt6 的原因：

- Windows 和 macOS 都支持较好。
- 相比 tkinter，PyQt6 的控件质感、布局能力、样式能力更适合给运营长期使用。
- 可以用 Qt Widgets 做一个正式、清爽、稳定的桌面工具界面。
- 后续可以用 PyInstaller 或 Nuitka 打包成 Windows exe，也可以在 macOS 上打包成 app。

## 体积控制要求

请尽量把最终程序做小。PyQt6 本身体积不会像 tkinter 那样极小，所以要严格控制依赖和 Qt 模块：

- 只使用 PyQt6 基础 Widgets。
- 不要使用 QtWebEngine、QtMultimedia、QtCharts、QML、QtQuick。
- 不要引入 pandas、numpy、openpyxl、Pillow。
- Excel 解析、JPG 校验、文件复制逻辑优先使用 Python 标准库。
- 不要引入大型 UI 资源包、图标包、主题包。
- 样式可以用少量 QSS，但不要依赖第三方主题库。
- 打包时尽量排除无关模块，尤其是科学计算库、测试库、Web 引擎、notebook 相关包。

建议 PyQt6 前端只负责界面和交互，业务逻辑放在独立 Python 模块里。这样 GUI 可以换壳，核心逻辑不受影响。

## 业务背景

这个工具用于根据 `ASIN.xlsx` 批量复制并重命名店铺图片。

运营只需要选择一个名为 `ASIN.xlsx` 的 Excel 文件，然后点击生成。程序会读取 Excel 里的 sheet。每个 sheet 名格式为：

```text
店铺名-国家缩写
```

例如：

```text
吕国强-IT
吕国强-ES
吕国强-FR
吕国强-DE
```

每个 sheet 第一列是 ASIN 数据，通常类似：

```text
ASIN：B0H6JMVR9G
```

程序需要把对应店铺图片复制到 `ASIN.xlsx` 同级目录下的 sheet 名文件夹里，并重命名为：

```text
B0H6JMVR9G.PS01.jpg
```

## 核心交互要求

1. 首页直接是工具界面，不要做欢迎页、说明页或营销式首页。
2. 用户点击按钮选择 `ASIN.xlsx` 文件本身，不要让用户选择文件夹。
3. 文件选择框需要默认筛选 `.xlsx` 文件。
4. 如果用户选择的文件名不是 `ASIN.xlsx`，需要提示错误并要求重新选择。
5. 生成的所有文件夹必须和 `ASIN.xlsx` 在同一个目录下。
6. 生成完成后提供一个按钮：`打开生成位置`。
7. `打开生成位置` 应打开 `ASIN.xlsx` 所在目录，而不是只打开某一个子文件夹。
8. 界面中需要有实时日志区域，显示正在处理的店铺、国家、复制了哪些文件、错误原因。
9. 生成时按钮要禁用，避免重复点击。
10. 生成结束后恢复按钮状态。

## 文件完整性校验

生成前必须做校验：

1. 读取 `ASIN.xlsx` 的所有 sheet 名，解析出需要哪些店铺图片。
2. 对于 sheet `吕国强-IT`，需要图片 `吕国强.jpg`。
3. 先检查 `ASIN.xlsx` 同级目录下是否存在对应店铺图片。
4. 如果同级目录没有，再检查程序根目录下是否存在对应店铺图片。
5. 如果程序根目录有，则自动复制到 `ASIN.xlsx` 同级目录。
6. 如果仍然没有，需要弹窗让运营手动选择该店铺的 JPG/JPEG 图片。
7. 用户选择后，程序应复制并重命名为标准的 `店铺名.jpg`，放到 `ASIN.xlsx` 同级目录。
8. 必须验证图片是有效 JPG/JPEG，不要只看扩展名。
9. 如果用户取消选择图片，则停止生成，并显示“已取消”状态。

## Excel 解析要求

推荐方案：

- 前端只负责交互。
- 业务解析逻辑放在单独 Python 模块里，例如 `gpsr_image_service.py`。
- 前端通过 worker thread 调用服务层，避免 UI 卡死。

要求：

- 不依赖 pandas、numpy。
- 最好避免 openpyxl，优先使用 Python 标准库直接解析 `.xlsx` zip/xml。
- 如果你认为使用某个轻量 Excel 库明显更合理，请说明理由、体积影响和打包影响。

## 跨平台要求

1. Windows 需要最终能打包成 `.exe`。
2. macOS 需要能用同一套源码打包成 `.app`。
3. Windows 打开目录可以用 `os.startfile()`。
4. macOS 打开目录可以调用 `open`。
5. 路径处理必须使用 `pathlib.Path`。
6. 中文路径、中文文件名、中文 sheet 名必须支持。
7. 打包后的程序应默认查找“程序所在目录/GPSR图片生成器/ASIN.xlsx”。

## UI 设计建议

请设计一个面向运营人员的简洁桌面工具界面，至少包含：

- Excel 文件选择输入框。
- `选择 ASIN.xlsx` 按钮。
- `生成图片` 主按钮。
- `打开生成位置` 按钮。
- 状态文本。
- 日志输出区域。
- 生成过程中的进度反馈。

界面风格建议：

- 安静、清晰、工具型。
- 不要复杂导航。
- 不要大面积装饰。
- 操作路径越短越好。
- 使用 Qt Widgets 和少量 QSS 做出更好的视觉层次，但不要堆装饰。

## PyQt6 窗口结构建议

建议窗口结构：

- `QMainWindow`
- 中央 `QWidget`
- 顶部：文件选择行
  - `QLineEdit` 显示 `ASIN.xlsx` 路径
  - `QPushButton` 选择文件
- 中部：操作按钮行
  - `QPushButton` 生成图片
  - `QPushButton` 打开生成位置
  - `QLabel` 显示状态
- 下方：日志区域
  - `QPlainTextEdit` 或 `QTextEdit`
- 底部：轻量进度反馈
  - `QProgressBar` 或 indeterminate 状态条

生成任务应使用 `QThread` 或 `QRunnable + QThreadPool`，通过 signal 把日志、进度、完成状态传回主线程。

## 错误处理要求

需要覆盖这些错误场景：

- 没有选择 Excel。
- 选择的不是 `ASIN.xlsx`。
- Excel 文件损坏或无法解析。
- sheet 名不是 `店铺名-国家缩写` 格式。
- 找不到店铺图片。
- 店铺图片不是有效 JPG/JPEG。
- 目标目录没有写入权限。
- 文件正在被占用。
- 生成过程中用户重复点击按钮。

## 打包建议

Windows exe：

- 推荐 PyInstaller 或 Nuitka。
- 打包入口使用 PyQt6 GUI 主文件。
- 使用 windowed 模式，避免控制台窗口。
- 排除 pandas、numpy、openpyxl、Pillow、QtWebEngine 等无关依赖。

macOS app：

- 需要在 macOS 上打包，不能用 Windows exe。
- 推荐 PyInstaller 或 Briefcase。
- 同一套源码可以复用。

## 交付内容要求

请给出一个新的前端套壳方案，包含：

1. 技术选型说明。
2. 体积控制策略。
3. UI 信息架构。
4. 页面/窗口布局描述。
5. 核心类和模块划分。
6. 关键流程伪代码。
7. 文件完整性校验流程。
8. Windows exe 打包建议。
9. macOS app 打包建议。
10. 你认为最容易踩坑的点。

请不要基于现有 GUI 代码做小修小补，而是给出一个从零设计的 PyQt6 方案，方便我和另一版实现做对比。
