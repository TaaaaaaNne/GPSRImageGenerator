"""Batch-copy store images and rename them from ASIN.xlsx.

This is a standard-library replacement for the original packaged tool. It reads
the xlsx file directly as a zip archive, so pandas/numpy/openpyxl are not needed.
"""

from __future__ import annotations

import posixpath
import re
import shutil
import sys
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable
from xml.etree import ElementTree as ET


NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkgrel": "http://schemas.openxmlformats.org/package/2006/relationships",
}

ASIN_PREFIX = "ASIN:"
FULLWIDTH_ASIN_PREFIX = "ASIN\uff1a"
OUTPUT_SUFFIX = ".PS01.jpg"


@dataclass
class ProcessResult:
    success: bool
    output_dirs: list[Path] = field(default_factory=list)
    copied_files: int = 0
    error: str = ""


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


def get_required_shops(excel_path: Path) -> list[str]:
    shops: list[str] = []
    with zipfile.ZipFile(excel_path) as workbook_zip:
        for sheet_name, _sheet_path in read_workbook_sheets(workbook_zip):
            if "-" not in sheet_name:
                raise ValueError(f"Sheet 名必须是 店铺名-国家缩写: {sheet_name}")

            shop = sheet_name.split("-", 1)[0].strip()
            if not shop:
                raise ValueError(f"Sheet 名缺少店铺名: {sheet_name}")
            if shop not in shops:
                shops.append(shop)
    return shops


def is_valid_jpeg(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size < 4:
        return False

    with path.open("rb") as image_file:
        header = image_file.read(3)
    return header.startswith(b"\xff\xd8\xff")


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


def extract_asin(cell_value: str) -> str:
    if FULLWIDTH_ASIN_PREFIX in cell_value:
        return cell_value.split(FULLWIDTH_ASIN_PREFIX)[-1].strip()
    if ASIN_PREFIX in cell_value:
        return cell_value.split(ASIN_PREFIX)[-1].strip()
    return cell_value.strip()


def process_excel(excel_path: Path, log: Callable[[str], None] = print) -> ProcessResult:
    output_dirs: list[Path] = []
    copied_files = 0

    try:
        with zipfile.ZipFile(excel_path) as workbook_zip:
            shared_strings = read_shared_strings(workbook_zip)
            sheets = read_workbook_sheets(workbook_zip)

            for sheet_name, sheet_path in sheets:
                if "-" not in sheet_name:
                    raise ValueError(f"Sheet 名必须是 店铺名-国家缩写: {sheet_name}")

                shop, country = sheet_name.split("-", 1)
                log(f"处理店铺: {shop}, 国家: {country}")

                base_dir = excel_path.parent
                old_pic_path = base_dir / f"{shop}.jpg"
                if not old_pic_path.is_file():
                    raise FileNotFoundError(f"未找到源图片: {old_pic_path}")
                if not is_valid_jpeg(old_pic_path):
                    raise ValueError(f"源图片不是有效 JPG: {old_pic_path}")

                save_path = base_dir / sheet_name
                save_path.mkdir(exist_ok=True)
                if save_path not in output_dirs:
                    output_dirs.append(save_path)

                values = read_first_column_values(
                    workbook_zip, sheet_path, shared_strings
                )
                for cell_value in values:
                    asin = extract_asin(cell_value)
                    if not asin:
                        continue
                    new_pic_name = asin + OUTPUT_SUFFIX
                    shutil.copy2(old_pic_path, save_path / new_pic_name)
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
        folder = input(
            "\n请输入Excel文件所在目录的完整路径（或输入Q退出）: "
        ).strip()

        if folder.lower() == "q":
            print("\n感谢使用，程序已退出！")
            return

        folder_path = Path(folder)
        if not folder_path.exists():
            print(f"\n错误: 路径不存在 - {folder}")
            continue

        excel_path = folder_path / "ASIN.xlsx"
        if not excel_path.is_file():
            print(f"\n错误: 未找到ASIN.xlsx文件 - {excel_path}")
            continue

        result = process_excel(excel_path)
        if result.success:
            choice = input("\n操作完成！是否重新处理其他目录？(Y/N): ").strip()
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
            input("\n按Enter键退出程序...")
