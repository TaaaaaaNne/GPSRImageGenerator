# GitHub Actions 打包说明

这个项目已经配置好自动打包流程：

- Windows / macOS 通用网页包：`GPSRImageGenerator-web.zip`

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

推送后，打开 GitHub 仓库的 `Actions` 页面，选择 `Package web tool`，点 `Run workflow` 就能手动打包。

## 发布给运营

如果要让产物自动挂到 GitHub Releases，打一个 tag：

```powershell
git tag v1.0.0
git push origin v1.0.0
```

Actions 跑完后，GitHub Releases 会自动出现 `GPSRImageGenerator-web.zip`。

## 使用方式

解压 `GPSRImageGenerator-web.zip` 后，进入 `GPSRImageGenerator-web` 文件夹，双击 `index.html` 即可在浏览器中使用。

这个版本是纯前端网页工具，表格和图片只在用户本机浏览器里处理，不需要安装 Python，也不需要 macOS `.app` 签名。

页面里已经内置使用说明，不再单独附带说明书文件。

如果要长期维护店铺图片，可以把 JPG/JPEG 放进网页包里的 `resource/images` 文件夹。Actions 打包时会自动生成内置素材清单，网页打开后会自动加载这些常用图片。

本地手动新增图片后，可以执行下面命令刷新素材清单：

```powershell
python tools/build_web_resource_manifest.py
```

浏览器出于安全限制不能自动枚举任意本地文件夹；如果是临时素材文件夹，仍然需要在页面里点击“选择素材文件夹”，一次性选中该文件夹即可自动匹配店铺图片。

Chrome / Edge 等支持文件夹写入能力的浏览器可以直接点击“保存到文件夹”，无需下载 ZIP 后再解压。第一次选择保存位置时，网页会默认从“下载”目录开始；请在下载目录里新建或选择一个普通子文件夹，例如 `GPSR输出`。选过一次后，同一浏览器会尽量记住上次授权的文件夹。

纯网页不能预填任意本机绝对路径，也不能保存后直接打开资源管理器或 Finder；这是浏览器安全限制。Chrome / Edge 通常也不允许网页直接选择“下载”根目录本身。其他浏览器可用“下载 ZIP 备用”。
