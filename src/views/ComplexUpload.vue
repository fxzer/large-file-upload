<template>
  <el-upload :http-request="customRequest">
    <template #trigger>
      <el-button type="primary">选择文件</el-button>
    </template>
  </el-upload>
</template>
<script lang="ts" setup>
import axios from 'axios';
import SparkMD5 from 'spark-md5'
const customRequest = async ({ file }) => {
  const formData = new FormData()
  formData.append('fileName', file)
  const hash = await calcFileHash(file)
  const chunks = createFileChunk(file, hash)
  // 检查文件是否存在
  // const { data: { data: { exist } } } = await checkFileExist(hash)
  const res = await uploadChunks(chunks,hash)
  // const res = await axios.post('http://localhost:3000/upload/postFile', formData)
}
const checkFileExist = (hash) => {
  return axios.post('http://localhost:3000/upload/checkFile', {
    hash
  })
}
type Chunk = {
  name: string
  index: number
  chunk: Blob
  hash: string
}
const ChunkSize = 1024 * 1024 * 2 // 2M
// 创建分片
const createFileChunk = (file, hash) => {
  const chunks: Chunk[] = []
  const chunkCount = Math.ceil(file.size / ChunkSize)
  for (let i = 0; i < chunkCount; i++) {
    const chunk: Blob = file.slice(i * ChunkSize, (i + 1) * ChunkSize)
    const name = hash + "-" + i + "." + file.name.substring(file.name.lastIndexOf(".") + 1)
    chunks.push({
      name,
      index: i,
      chunk,
      hash,
    })
  }
  return chunks
}
// 创建文件hash值
const calcFileHash = (file: File) => {
  return new Promise(resolve => {
    const spark = new SparkMD5.ArrayBuffer()
    const reader = new FileReader()
    const size = file.size
    const offset = 2 * 1024 * 1024
    // 第一个2M，最后一个区块数据全要
    const chunks = [file.slice(0, offset)]
    let cur = offset
    while (cur < size) {
      if (cur + offset >= size) {
        // 最后一个区快
        chunks.push(file.slice(cur, cur + offset))
      } else {
        // 中间的区块
        const mid = cur + offset / 2
        const end = cur + offset
        chunks.push(file.slice(cur, cur + 2))
        chunks.push(file.slice(mid, mid + 2))
        chunks.push(file.slice(end - 2, end))
      }
      cur += offset
    }
    // 中间的，取前中后各2各字节
    reader.readAsArrayBuffer(new Blob(chunks))
    reader.onload = e => {
      spark.append(e?.target?.result as ArrayBuffer)
      resolve(spark.end())
    }
  })
}
// 上传分片
const uploadChunks = async (chunks: Array<Chunk>, hash: string) => {
  // 转成promise
  const requestList = chunks.map(({ chunk, name, index, hash }) => {
    const form = new FormData()
    form.append('chunk', chunk, name)
    form.append('hash', hash)
    form.append('name', name)
    return { form, index: index, error: 0 }
  })

  let index = 0
  const taskPool: Array<Promise<any>> = []
  const max = 6 // 设置浏览器运行最大并发数  目前6个为当前的主流
  let allProgress = index // 总进度
  while (index < requestList.length) {
    const task = axios.post("http://localhost:3000/upload/postFile", requestList[index].form, {
      onUploadProgress: (progress) => {
        allProgress += (progress.loaded / (progress.total ? progress.total : 1)) // 这是单个分片的
        const percent = ((allProgress / requestList.length) * 100)
        // if (params.onProgress) params.onProgress({ percent })
      }
    })
    task.then(() => {
      taskPool.splice(taskPool.findIndex(item => item === task))
    })
    taskPool.push(task)
    if (taskPool.length === max) {
      await Promise.race(taskPool) // 竞赛等出一个执行完毕的请求
    }
    index++
  }
  console.log('[ taskPool ]-95', taskPool)

  await Promise.all(taskPool)
  let ext = ""
  // if (params.filename)
  //   ext = params.filename.substring(params.filename.lastIndexOf(".") + 1)
  // const { data } = await axios.post("/mergeFile", { hash, ext })
  // params.onSuccess && params.onSuccess(data)
}


</script>

<style scoped lang="scss">
.upload-demo {
  margin: 100px 100px;
}
</style>