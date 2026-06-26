from __future__ import annotations

import shutil
import sys
from html import escape
from pathlib import Path

try:
    from PyQt6.QtCore import QThread, QUrl, pyqtSignal
    from PyQt6.QtGui import QDesktopServices, QDragEnterEvent, QDropEvent
    from PyQt6.QtWidgets import (
        QApplication,
        QFileDialog,
        QFrame,
        QHBoxLayout,
        QLabel,
        QLineEdit,
        QMainWindow,
        QMessageBox,
        QProgressBar,
        QPushButton,
        QSizePolicy,
        QTextEdit,
        QVBoxLayout,
        QWidget,
    )
except ImportError as exc:
    raise SystemExit("PyQt6 未安装，请先运行: pip install PyQt6") from exc

from gpsr_image_renamer import (
    ProcessResult,
    get_required_shops,
    is_valid_jpeg,
    process_excel,
)


APP_TITLE = "GPSR 图片生成器"
DEFAULT_DATA_FOLDER = "GPSR图片生成器"


def application_dir() -> Path:
    if getattr(sys, "frozen", False):
        executable = Path(sys.executable).resolve()
        if sys.platform == "darwin":
            for parent in executable.parents:
                if parent.suffix == ".app":
                    return parent.parent
        return executable.parent
    return Path(__file__).resolve().parent


class ExcelPathEdit(QLineEdit):
    file_dropped = pyqtSignal(str)

    def __init__(self) -> None:
        super().__init__()
        self.setAcceptDrops(True)
        self.setPlaceholderText("选择或拖入 ASIN.xlsx 文件")

    def dragEnterEvent(self, event: QDragEnterEvent) -> None:
        if self._first_local_path(event) is not None:
            event.acceptProposedAction()
        else:
            event.ignore()

    def dropEvent(self, event: QDropEvent) -> None:
        path = self._first_local_path(event)
        if path is None:
            event.ignore()
            return

        event.acceptProposedAction()
        dropped = Path(path)
        if dropped.is_dir():
            dropped = dropped / "ASIN.xlsx"
        self.file_dropped.emit(str(dropped))

    @staticmethod
    def _first_local_path(event) -> str | None:
        mime = event.mimeData()
        if not mime.hasUrls():
            return None
        for url in mime.urls():
            if url.isLocalFile():
                return url.toLocalFile()
        return None


class ProcessWorker(QThread):
    log_message = pyqtSignal(str)
    completed = pyqtSignal(object)

    def __init__(self, excel_path: Path) -> None:
        super().__init__()
        self.excel_path = excel_path

    def run(self) -> None:
        result = process_excel(self.excel_path, log=self.log_message.emit)
        self.completed.emit(result)


class MainWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.worker: ProcessWorker | None = None
        self.last_open_dir: Path | None = None

        self.setWindowTitle(APP_TITLE)
        self.setMinimumSize(680, 540)
        self.resize(720, 560)
        self.build_ui()
        self.apply_style()
        self.load_default_excel()

    def build_ui(self) -> None:
        root = QWidget()
        root.setObjectName("root")
        root_layout = QVBoxLayout(root)
        root_layout.setContentsMargins(24, 24, 24, 24)

        card = QFrame()
        card.setObjectName("mainCard")
        card.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        root_layout.addWidget(card)

        layout = QVBoxLayout(card)
        layout.setContentsMargins(24, 22, 24, 24)
        layout.setSpacing(16)

        title = QLabel("GPSR 图片批量生成器")
        title.setObjectName("mainTitle")
        layout.addWidget(title)

        subtitle = QLabel("根据 ASIN.xlsx 自动匹配店铺图片，并生成各国家站点所需文件。")
        subtitle.setObjectName("subTitle")
        subtitle.setWordWrap(True)
        layout.addWidget(subtitle)

        file_row = QHBoxLayout()
        file_row.setSpacing(10)
        self.excel_input = ExcelPathEdit()
        self.excel_input.file_dropped.connect(self.set_excel_path)
        file_row.addWidget(self.excel_input, 1)

        browse_button = QPushButton("选择 ASIN.xlsx")
        browse_button.setObjectName("btnSecondary")
        browse_button.clicked.connect(self.choose_excel)
        file_row.addWidget(browse_button)
        layout.addLayout(file_row)

        action_row = QHBoxLayout()
        action_row.setSpacing(10)
        self.generate_button = QPushButton("生成图片")
        self.generate_button.setObjectName("btnPrimary")
        self.generate_button.clicked.connect(self.start_generation)
        action_row.addWidget(self.generate_button, 1)

        self.open_button = QPushButton("打开生成位置")
        self.open_button.setObjectName("btnSecondary")
        self.open_button.setEnabled(False)
        self.open_button.clicked.connect(self.open_output_dir)
        action_row.addWidget(self.open_button)
        layout.addLayout(action_row)

        status_row = QHBoxLayout()
        status_row.setSpacing(12)
        self.status_label = QLabel("请选择 ASIN.xlsx 文件")
        self.status_label.setObjectName("statusLabel")
        status_row.addWidget(self.status_label, 1)
        layout.addLayout(status_row)

        self.log_output = QTextEdit()
        self.log_output.setObjectName("logOutput")
        self.log_output.setReadOnly(True)
        self.log_output.setAcceptRichText(True)
        layout.addWidget(self.log_output, 1)

        self.progress_bar = QProgressBar()
        self.progress_bar.setObjectName("progressBar")
        self.progress_bar.setTextVisible(False)
        self.progress_bar.setRange(0, 1)
        self.progress_bar.setValue(0)
        layout.addWidget(self.progress_bar)

        self.setCentralWidget(root)

    def apply_style(self) -> None:
        self.setStyleSheet(
            """
            QMainWindow, QWidget#root {
                background-color: #F5F7FA;
                font-family: "Microsoft YaHei", "Segoe UI", sans-serif;
                color: #111827;
            }
            QFrame#mainCard {
                background-color: #FFFFFF;
                border: 1px solid #E5E7EB;
                border-radius: 8px;
            }
            QLabel#mainTitle {
                font-size: 20px;
                font-weight: 600;
                color: #111827;
            }
            QLabel#subTitle {
                font-size: 13px;
                color: #6B7280;
            }
            QLabel#statusLabel {
                font-size: 12px;
                color: #6B7280;
            }
            QLineEdit {
                background-color: #F9FAFB;
                border: 1px solid #D1D5DB;
                border-radius: 6px;
                padding: 8px 12px;
                font-size: 13px;
                color: #374151;
                min-height: 20px;
            }
            QLineEdit:focus {
                border: 1px solid #0066FF;
                background-color: #FFFFFF;
            }
            QPushButton#btnPrimary {
                background-color: #0066FF;
                border: none;
                border-radius: 6px;
                padding: 10px 18px;
                color: #FFFFFF;
                font-size: 14px;
                font-weight: 600;
                min-height: 22px;
            }
            QPushButton#btnPrimary:hover {
                background-color: #005CE6;
            }
            QPushButton#btnPrimary:pressed {
                background-color: #0052CC;
            }
            QPushButton#btnPrimary:disabled {
                background-color: #93C5FD;
            }
            QPushButton#btnSecondary {
                background-color: #FFFFFF;
                border: 1px solid #D1D5DB;
                border-radius: 6px;
                padding: 9px 14px;
                color: #374151;
                font-size: 13px;
                font-weight: 500;
                min-height: 20px;
            }
            QPushButton#btnSecondary:hover {
                background-color: #F3F4F6;
                color: #111827;
            }
            QPushButton#btnSecondary:disabled {
                background-color: #F3F4F6;
                color: #9CA3AF;
                border: 1px solid #E5E7EB;
            }
            QTextEdit#logOutput {
                background-color: #1F2937;
                color: #D1D5DB;
                border: none;
                border-radius: 6px;
                padding: 10px;
                font-family: "Consolas", "Menlo", monospace;
                font-size: 12px;
            }
            QProgressBar#progressBar {
                border: none;
                background-color: #EEF2F7;
                border-radius: 3px;
                height: 6px;
                max-height: 6px;
            }
            QProgressBar#progressBar::chunk {
                background-color: #0066FF;
                border-radius: 3px;
            }
            """
        )

    def load_default_excel(self) -> None:
        default_excel = application_dir() / DEFAULT_DATA_FOLDER / "ASIN.xlsx"
        if default_excel.is_file():
            self.set_excel_path(str(default_excel))
            self.set_status("已自动选择默认 Excel")

    def set_excel_path(self, path_text: str) -> None:
        self.excel_input.setText(path_text)
        self.set_status("已选择 Excel")

    def choose_excel(self) -> None:
        initial_dir = application_dir() / DEFAULT_DATA_FOLDER
        if not initial_dir.exists():
            initial_dir = application_dir()
        selected, _filter = QFileDialog.getOpenFileName(
            self,
            "选择 ASIN.xlsx",
            str(initial_dir),
            "Excel 工作簿 (*.xlsx);;所有文件 (*)",
        )
        if selected:
            self.set_excel_path(selected)

    def start_generation(self) -> None:
        excel_path = self.selected_excel_path()
        if excel_path is None:
            return

        self.log_output.clear()
        self.last_open_dir = excel_path.parent
        self.open_button.setEnabled(False)
        self.generate_button.setEnabled(False)
        self.generate_button.setText("正在生成中...")
        self.set_status("正在检查文件...")
        self.progress_bar.setRange(0, 0)

        if not self.ensure_required_images(excel_path):
            self.finish_cancelled()
            return

        self.append_log("开始生成图片...", "info")
        self.set_status("正在生成图片...")

        self.worker = ProcessWorker(excel_path)
        self.worker.log_message.connect(self.append_process_log)
        self.worker.completed.connect(self.finish_generation)
        self.worker.start()

    def selected_excel_path(self) -> Path | None:
        path_text = self.excel_input.text().strip()
        if not path_text:
            QMessageBox.warning(self, "缺少 Excel", "请先选择 ASIN.xlsx 文件。")
            return None

        excel_path = Path(path_text)
        if not excel_path.is_file():
            QMessageBox.critical(self, "未找到文件", f"未找到所选 Excel:\n{excel_path}")
            return None

        if excel_path.name.lower() != "asin.xlsx":
            QMessageBox.critical(self, "Excel 文件不正确", "请选择名为 ASIN.xlsx 的文件。")
            return None

        return excel_path

    def ensure_required_images(self, excel_path: Path) -> bool:
        try:
            shops = get_required_shops(excel_path)
        except Exception as exc:
            QMessageBox.critical(self, "Excel 检查失败", str(exc))
            return False

        for shop in shops:
            expected_image = excel_path.parent / f"{shop}.jpg"
            if is_valid_jpeg(expected_image):
                self.append_log(f"店铺图片已就绪: {expected_image.name}", "success")
                continue

            root_image = application_dir() / f"{shop}.jpg"
            if root_image.resolve() != expected_image.resolve() and is_valid_jpeg(root_image):
                try:
                    shutil.copy2(root_image, expected_image)
                except OSError as exc:
                    QMessageBox.critical(self, "图片复制失败", str(exc))
                    return False
                self.append_log(f"已从程序根目录复制店铺图片: {expected_image.name}", "success")
                continue

            if not self.ask_for_shop_image(shop, expected_image):
                return False

        return True

    def ask_for_shop_image(self, shop: str, expected_image: Path) -> bool:
        while True:
            QMessageBox.warning(
                self,
                "缺少店铺图片",
                f"缺少或无效的店铺图片：{expected_image.name}\n请为“{shop}”选择 JPG/JPEG 图片。",
            )
            selected, _filter = QFileDialog.getOpenFileName(
                self,
                f"选择 {shop} 的 JPG 图片",
                str(expected_image.parent),
                "JPEG 图片 (*.jpg *.jpeg);;所有文件 (*)",
            )
            if not selected:
                self.append_log("用户取消选择图片，任务已停止。", "warn")
                return False

            selected_image = Path(selected)
            if not is_valid_jpeg(selected_image):
                QMessageBox.critical(self, "图片无效", "请选择有效的 JPG/JPEG 图片。")
                continue

            try:
                shutil.copy2(selected_image, expected_image)
            except OSError as exc:
                QMessageBox.critical(self, "图片复制失败", str(exc))
                return False

            self.append_log(f"已补齐店铺图片: {expected_image.name}", "success")
            return True

    def append_process_log(self, message: str) -> None:
        level = "info"
        if "已复制" in message or "成功" in message:
            level = "success"
        elif "错误" in message or "失败" in message or "未找到" in message:
            level = "error"
        elif "处理店铺" in message:
            level = "info"
        self.append_log(message, level)

    def append_log(self, message: str, level: str = "info") -> None:
        colors = {
            "info": "#D1D5DB",
            "success": "#34D399",
            "warn": "#FBBF24",
            "error": "#F87171",
        }
        color = colors.get(level, colors["info"])
        lines = message.splitlines() or [""]
        for line in lines:
            self.log_output.append(f'<span style="color:{color}">{escape(line)}</span>')
        self.log_output.moveCursor(self.log_output.textCursor().MoveOperation.End)

    def finish_generation(self, result: ProcessResult) -> None:
        self.reset_running_state()
        self.progress_bar.setRange(0, 1)
        self.progress_bar.setValue(1 if result.success else 0)

        if result.success:
            self.open_button.setEnabled(True)
            self.set_status(f"完成，共生成 {result.copied_files} 张")
            self.append_log(f"生成完成，共生成 {result.copied_files} 张。", "success")
            QMessageBox.information(
                self,
                "生成完成",
                f"图片生成完成，共生成 {result.copied_files} 张。\n可点击“打开生成位置”查看文件夹。",
            )
        else:
            self.set_status("生成失败")
            self.append_log(result.error or "处理过程中发生错误。", "error")
            QMessageBox.critical(self, "生成失败", result.error or "处理过程中发生错误。")

        self.worker = None

    def finish_cancelled(self) -> None:
        self.reset_running_state()
        self.progress_bar.setRange(0, 1)
        self.progress_bar.setValue(0)
        self.set_status("已取消")

    def reset_running_state(self) -> None:
        self.generate_button.setEnabled(True)
        self.generate_button.setText("生成图片")

    def set_status(self, text: str) -> None:
        self.status_label.setText(text)

    def open_output_dir(self) -> None:
        target = self.last_open_dir
        if target is None or not target.exists():
            QMessageBox.warning(self, "无法打开", "还没有可打开的生成文件夹。")
            return
        QDesktopServices.openUrl(QUrl.fromLocalFile(str(target)))


def main() -> int:
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
