# 主要功能

- 多选文件
- 拖拽上传
- 文件信息分片
- 增量计算文件 hash (在 web worker 中)
- 验证文件 (是否存在/分片是否上传完毕)
- 并发上传
- 合并文件
- 文件上传进度
- 断点续传(暂停/继续)
- 取消上传

# 前端(./client)

- Vue3
- ElementPlus
- Vue-Router
- Web Worker

# 后端(./server)

- express

# 功能预览

![预览](./client/public/screenshot.png)

# 主要逻辑

![逻辑图](./client/public/mind.svg)

# 计算HASH性能对比

<p align="center">【全量切片计算hash】    VS   【缩略切片计算hash】 </p>

|                  | 100 M               | 2.2G                 |
| ---------------- | ------------------- | -------------------- |
| 全量切片计算hash | 1099.033203125 ms   | 23855.60205078125 ms |
| 缩略切片计算hash | 119.863037109375 ms | 120.06298828125 ms   |
