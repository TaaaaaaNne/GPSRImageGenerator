# GitHub Actions 打包说明

这个项目已经配置好自动打包流程：

- Windows x64: `GPSRImageGenerator-windows-x64.zip`
- macOS Apple Silicon: `GPSRImageGenerator-macos-arm64.zip`
- macOS Intel: `GPSRImageGenerator-macos-x64.zip`

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

Actions 跑完后，GitHub Releases 会自动出现三个 zip 包。

## macOS 提醒

当前 `.app` 是无 Apple Developer ID 的内部构建版本。运营第一次打开时如果看到安全提示，可以在 Finder 里右键 app，选择打开。若要完全消除 Gatekeeper 提示，需要 Apple Developer 账号做签名和 notarization。
