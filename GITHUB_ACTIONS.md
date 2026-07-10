# GitHub Actions 打包说明

这个项目已经配置好自动打包流程：

- Windows x64 桌面版：`GPSRImageGenerator-*-win-x64.exe`
- macOS Intel 桌面版：`GPSRImageGenerator-*-mac-x64.zip`
- macOS Apple Silicon 桌面版：`GPSRImageGenerator-*-mac-arm64.zip`

## 第一次接入 GitHub

当前仓库地址：

https://github.com/TaaaaaaNne/GPSRImageGenerator

如果本地还没有绑定远端，在项目目录执行：

```powershell
git init -b main
git add .
git commit -m "Initial GPSRImageGenerator desktop build"
git remote add origin https://github.com/TaaaaaaNne/GPSRImageGenerator.git
git push -u origin main
```

推送后，打开 GitHub 仓库的 `Actions` 页面，选择 `Build desktop apps`，点 `Run workflow` 就能手动打包。

## 发布给运营

如果要让产物自动挂到 GitHub Releases，打一个 tag：

```powershell
git tag v1.0.0
git push origin v1.0.0
```

Actions 跑完后，GitHub Releases 会自动出现 Windows 和 macOS 桌面包。

## 使用方式

Windows 用户下载 `.exe` 后双击运行。

macOS 用户下载对应芯片的 `.zip`，解压后运行里面的 app。未签名构建第一次打开时，如果系统提示无法验证开发者，可以在 Finder 里右键 app，选择“打开”。

桌面版默认输出到系统下载目录里的 `GPSR输出` 文件夹，页面会显示完整路径，保存后可以点击“打开输出文件夹”。

页面里已经内置使用说明，不再单独附带说明书文件。普通浏览器打开 `web/index.html` 时仍可作为备用网页版本使用。

如果要长期维护店铺图片，可以把 JPG/JPEG 放进网页包里的 `resource/images` 文件夹。Actions 打包时会自动生成内置素材清单，网页打开后会自动加载这些常用图片。

本地手动新增图片后，可以执行下面命令刷新素材清单：

```powershell
python tools/build_web_resource_manifest.py
```

浏览器出于安全限制不能自动枚举任意本地文件夹；如果是临时素材文件夹，仍然需要在页面里点击“选择素材文件夹”，一次性选中该文件夹即可自动匹配店铺图片。

Electron 桌面版可以直接保存到完整本机路径，也可以打开输出文件夹。

纯网页备用版不能预填任意本机绝对路径，也不能保存后直接打开资源管理器或 Finder；这是浏览器安全限制。其他浏览器可用“下载 ZIP 备用”。
