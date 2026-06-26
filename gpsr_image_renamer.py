"""Batch-copy store images and rename them from an xlsx or csv table.

The parser intentionally uses only the Python standard library so the desktop
build can stay small and avoid pandas/openpyxl/numpy.
"""

from __future__ import annotations

import csv
import posixpath
import re
import shutil
import sys
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape as xml_escape


NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkgrel": "http://schemas.openxmlformats.org/package/2006/relationships",
}

ASIN_PREFIX = "ASIN:"
FULLWIDTH_ASIN_PREFIX = "ASIN\uff1a"
OUTPUT_SUFFIX = ".PS01.jpg"
SUPPORTED_TABLE_SUFFIXES = {".xlsx", ".csv"}
TEMPLATE_FILE_NAME = "GPSR表格模板.xlsx"
TEMPLATE_SHEET_NAME = "店铺-站点"
TEMPLATE_ROW_VALUE = "ASIN：B012345678"
TEMPLATE_ROW_COUNT = 10
ASIN_RE = re.compile(r"^[A-Z0-9]{10}$", re.IGNORECASE)


@dataclass
class ProcessResult:
    success: bool
    output_dirs: list[Path] = field(default_factory=list)
    copied_files: int = 0
    error: str = ""


@dataclass
class TableSheet:
    name: str
    shop: str
    site: str
    asins: list[str]


def column_number(cell_ref: str) -> int:
    match = re.match(r"([A-Z]+)", cell_ref.upper())
    if not match:
        return 0

    number = 0
    for char in match.group(1):
        number = number * 26 + ord(char) - ord("A") + 1
    return number


def read_xml(workbook_zip: zipfile.ZipFile, name: str) -> ET.Element:
    with workbook_zip.open(name) as xml_file:
        return ET.parse(xml_file).getroot()


def read_shared_strings(workbook_zip: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in workbook_zip.namelist():
        return []

    root = read_xml(workbook_zip, "xl/sharedStrings.xml")
    strings: list[str] = []
    for si in root.findall("main:si", NS):
        parts = [node.text or "" for node in si.findall(".//main:t", NS)]
        strings.append("".join(parts))
    return strings


def read_workbook_sheets(workbook_zip: zipfile.ZipFile) -> list[tuple[str, str]]:
    workbook = read_xml(workbook_zip, "xl/workbook.xml")
    rels = read_xml(workbook_zip, "xl/_rels/workbook.xml.rels")

    rel_targets = {}
    for rel in rels.findall("pkgrel:Relationship", NS):
        rel_targets[rel.attrib["Id"]] = rel.attrib["Target"]

    sheets: list[tuple[str, str]] = []
    for sheet in workbook.findall("main:sheets/main:sheet", NS):
        sheet_name = sheet.attrib["name"]
        rel_id = sheet.attrib[f"{{{NS['rel']}}}id"]
        target = rel_targets[rel_id]
        if not target.startswith("/"):
            target = posixpath.normpath(posixpath.join("xl", target))
        else:
            target = target.lstrip("/")
        sheets.append((sheet_name, target))
    return sheets


def validate_table_suffix(table_path: Path) -> None:
    if table_path.suffix.lower() not in SUPPORTED_TABLE_SUFFIXES:
        raise ValueError("请选择 .xlsx 或 .csv 表格文件。")


def parse_sheet_name(sheet_name: str) -> tuple[str, str]:
    if "-" not in sheet_name:
        raise ValueError(f"表名必须是 店铺-站点 格式: {sheet_name}")

    shop, site = [part.strip() for part in sheet_name.split("-", 1)]
    if not shop or not site:
        raise ValueError(f"表名必须包含店铺和站点: {sheet_name}")
    return shop, site


def extract_asin(cell_value: str) -> str:
    value = cell_value.strip()
    if FULLWIDTH_ASIN_PREFIX in value:
        value = value.split(FULLWIDTH_ASIN_PREFIX, 1)[-1].strip()
    elif ASIN_PREFIX in value:
        value = value.split(ASIN_PREFIX, 1)[-1].strip()

    value = value.upper()
    if not ASIN_RE.fullmatch(value):
        raise ValueError(f"ASIN 格式不正确: {cell_value}")
    return value


def extract_sheet_asins(values: list[str], sheet_name: str) -> list[str]:
    asins: list[str] = []
    for row_number, value in enumerate(values, start=1):
        if not value.strip():
            continue
        try:
            asins.append(extract_asin(value))
        except ValueError as exc:
            raise ValueError(f"{sheet_name} 第 {row_number} 行: {exc}") from exc

    if not asins:
        raise ValueError(f"{sheet_name} 第一列没有有效 ASIN 数据。")
    return asins


def cell_text(cell: ET.Element, shared_strings: list[str]) -> str:
    cell_type = cell.attrib.get("t")

    if cell_type == "inlineStr":
        parts = [node.text or "" for node in cell.findall(".//main:t", NS)]
        return "".join(parts)

    value_node = cell.find("main:v", NS)
    if value_node is None or value_node.text is None:
        return ""

    value = value_node.text
    if cell_type == "s":
        try:
            return shared_strings[int(value)]
        except (ValueError, IndexError):
            return value
    return value


def read_first_column_values(
    workbook_zip: zipfile.ZipFile, sheet_path: str, shared_strings: list[str]
) -> list[str]:
    root = read_xml(workbook_zip, sheet_path)
    values: list[str] = []

    for row in root.findall(".//main:sheetData/main:row", NS):
        first_column_value = ""
        for cell in row.findall("main:c", NS):
            cell_ref = cell.attrib.get("r", "")
            if column_number(cell_ref) == 1:
                first_column_value = cell_text(cell, shared_strings).strip()
                break
        if first_column_value:
            values.append(first_column_value)

    return values


def load_xlsx_sheets(table_path: Path) -> list[TableSheet]:
    loaded_sheets: list[TableSheet] = []
    try:
        with zipfile.ZipFile(table_path) as workbook_zip:
            shared_strings = read_shared_strings(workbook_zip)
            for sheet_name, sheet_path in read_workbook_sheets(workbook_zip):
                shop, site = parse_sheet_name(sheet_name)
                values = read_first_column_values(workbook_zip, sheet_path, shared_strings)
                asins = extract_sheet_asins(values, sheet_name)
                loaded_sheets.append(TableSheet(sheet_name, shop, site, asins))
    except zipfile.BadZipFile as exc:
        raise ValueError(f"不是有效的 .xlsx 文件: {table_path}") from exc

    if not loaded_sheets:
        raise ValueError("表格中没有可处理的 sheet。")
    return loaded_sheets


def read_csv_rows(csv_path: Path) -> list[str]:
    encodings = ("utf-8-sig", "utf-8", "gbk")
    last_error: UnicodeDecodeError | None = None
    for encoding in encodings:
        try:
            with csv_path.open("r", encoding=encoding, newline="") as csv_file:
                rows = csv.reader(csv_file)
                return [row[0].strip() for row in rows if row and row[0].strip()]
        except UnicodeDecodeError as exc:
            last_error = exc

    raise ValueError(f"无法读取 CSV 编码: {last_error}")


def load_csv_sheet(table_path: Path) -> list[TableSheet]:
    rows = read_csv_rows(table_path)
    if not rows:
        raise ValueError("CSV 第一列没有数据。")

    try:
        sheet_name = rows[0]
        shop, site = parse_sheet_name(sheet_name)
    except ValueError:
        raise ValueError("CSV 第一行必须填写 店铺-站点。") from None

    asin_rows = rows[1:]
    asins = extract_sheet_asins(asin_rows, sheet_name)
    return [TableSheet(sheet_name, shop, site, asins)]


def load_table_sheets(table_path: Path) -> list[TableSheet]:
    validate_table_suffix(table_path)
    if table_path.suffix.lower() == ".xlsx":
        return load_xlsx_sheets(table_path)
    return load_csv_sheet(table_path)


def get_required_shops(table_path: Path) -> list[str]:
    shops: list[str] = []
    for sheet in load_table_sheets(table_path):
        if sheet.shop not in shops:
            shops.append(sheet.shop)
    return shops


def create_template(template_dir: Path) -> Path:
    template_dir.mkdir(parents=True, exist_ok=True)
    template_path = template_dir / TEMPLATE_FILE_NAME
    sheet_data = "\n".join(
        f'<row r="{row}"><c r="A{row}" t="inlineStr"><is><t>{xml_escape(TEMPLATE_ROW_VALUE)}</t></is></c></row>'
        for row in range(1, TEMPLATE_ROW_COUNT + 1)
    )
    files = {
        "[Content_Types].xml": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>""",
        "_rels/.rels": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>""",
        "xl/workbook.xml": f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="{xml_escape(TEMPLATE_SHEET_NAME)}" sheetId="1" r:id="rId1"/></sheets></workbook>""",
        "xl/_rels/workbook.xml.rels": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>""",
        "xl/worksheets/sheet1.xml": f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>{sheet_data}</sheetData></worksheet>""",
    }

    with zipfile.ZipFile(template_path, "w", compression=zipfile.ZIP_DEFLATED) as workbook_zip:
        for name, content in files.items():
            workbook_zip.writestr(name, content)

    return template_path


def is_valid_jpeg(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size < 4:
        return False

    with path.open("rb") as image_file:
        header = image_file.read(3)
    return header.startswith(b"\xff\xd8\xff")


def process_excel(table_path: Path, log: Callable[[str], None] = print) -> ProcessResult:
    output_dirs: list[Path] = []
    copied_files = 0

    try:
        sheets = load_table_sheets(table_path)
        for sheet in sheets:
            log(f"处理店铺: {sheet.shop}, 站点: {sheet.site}")

            base_dir = table_path.parent
            source_image = base_dir / f"{sheet.shop}.jpg"
            if not source_image.is_file():
                raise FileNotFoundError(f"未找到源图片: {source_image}")
            if not is_valid_jpeg(source_image):
                raise ValueError(f"源图片不是有效 JPG: {source_image}")

            output_dir = base_dir / sheet.name
            output_dir.mkdir(exist_ok=True)
            if output_dir not in output_dirs:
                output_dirs.append(output_dir)

            for asin in sheet.asins:
                new_pic_name = asin + OUTPUT_SUFFIX
                shutil.copy2(source_image, output_dir / new_pic_name)
                copied_files += 1
                log(f"已复制: {new_pic_name}")

        log("\n==================================================")
        log("拷贝及命名数据成功！")
        return ProcessResult(True, output_dirs, copied_files)
    except Exception as exc:
        log("\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
        log(f"处理过程中发生错误: {exc}")
        log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n")
        return ProcessResult(False, output_dirs, copied_files, str(exc))


def main() -> None:
    print("==================================================")
    print("图片批量处理工具")
    print("==================================================")

    while True:
        table = input("\n请输入 .xlsx 或 .csv 表格文件路径（或输入 Q 退出）: ").strip()
        if table.lower() == "q":
            print("\n感谢使用，程序已退出！")
            return

        table_path = Path(table.strip('"'))
        if not table_path.is_file():
            print(f"\n错误: 文件不存在 - {table_path}")
            continue

        result = process_excel(table_path)
        if result.success:
            choice = input("\n操作完成！是否继续处理其他表格？(Y/N): ").strip()
            if choice.lower() != "y":
                print("\n感谢使用，程序已退出！")
                return


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"\n程序发生未处理错误: {exc}")
    finally:
        if getattr(sys, "frozen", False):
            input("\n按 Enter 键退出程序...")
