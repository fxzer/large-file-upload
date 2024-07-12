<script setup lang='ts'>
import axios from 'axios'
// import type { UploadRequestOptions } from 'element-plus'

const API = {
  check: '/check',
  upload: '/upload',
  merge: '/merge',
}

const fileSizeRef = ref('0B')
interface Progress {
  createChunks: number
  calculateHash: number
  uploadChunks: number
}
const progressMap = reactive<Progress>({
  createChunks: 0,
  calculateHash: 0,
  uploadChunks: 0,
})

const CHUNK_SIZE = 10 * 1024 * 1024 // 10MB
interface Chunk {
  name: string
  file: Blob
  range: string
  size: string
}
let formDatas: FormData[] = []

const inputRef = ref<HTMLInputElement | null>(null)
const videoRef = ref<HTMLVideoElement | null>(null)
// async function handleUpload(options: UploadRequestOptions) {
//   const file = options.file
async function calcHashInWorker(chunks: Blob[]): Promise<string> {
  const worker = new Worker('hashWorker.js')
  worker.postMessage({ chunks })
  return new Promise((resolve) => {
    worker.onmessage = (event) => {
      const { progress, hash = '' } = event.data
      if (progress) {
        progressMap.calculateHash = progress
      }
      if (hash) {
        resolve(hash)
        worker.terminate()
      }
    }
  })
}
async function handleUpload() {
  const file = inputRef.value?.files?.[0]
  // const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) {
    ElNotification({
      title: '请选择文件',
      type: 'warning',
    })
    return
  }
  const chunks = createChunks(file)
  const pickedChunks = pickChunks(chunks)
  const fileHash = await calcHashInWorker(pickedChunks)
  const { shouldUpload, message, uploadedChunks = [], fileUrl } = await checkExist(fileHash)
  if (shouldUpload) {
    // 需要上传, 则上传文件 ，分片都已上传，则直接合并
    if (uploadedChunks.length === chunks.length) {
      await mergeRequest(file.name, CHUNK_SIZE, fileHash)
    }
    else {
      await uploadChunks(chunks, fileHash, uploadedChunks)
      await mergeRequest(file.name, CHUNK_SIZE, fileHash)
    }
  }
  else {
    ElNotification({
      title: message,
      type: 'warning',
    })
    if (videoRef.value && fileUrl)
      videoRef.value.src = fileUrl
  }
}

const isPause = ref(false)
function handleControl() {
  if (isPause.value) {
    isPause.value = false
    // 继续上传
    handleUpload()
  }
  else {
    isPause.value = true
    // 暂停上传
    formDatas = []
  }
}

// 创建切片: 10kb 一个切片
function createChunks(file: File) {
  const chunks = []
  const fileSize = file.size
  fileSizeRef.value = formatSize(fileSize)

  for (let cur = 0; cur < fileSize; cur += CHUNK_SIZE) {
    const end = Math.min(cur + CHUNK_SIZE, fileSize) // 确保不超过文件大小
    progressMap.createChunks = end === fileSize ? 100 : Math.floor(end / fileSize * 100)
    chunks.push({
      name: `${chunks.length}-${file.name}`,
      file: file.slice(cur, end),
      range: `${cur}-${end - 1}`,
      size: formatSize(end - cur),
    })
  }
  return chunks
}

// 用于计算 hash 的 chunks
function pickChunks(chunks: Chunk[]) {
  const pickedChunks: Blob[] = []
  for (let i = 0; i < chunks.length; i += CHUNK_SIZE) {
    const chunkFile = chunks[i].file
    // 除了第一个和最后一个切片，每个切片前中后各取两个字节
    if (i === 0 || i === chunks.length - 1) {
      pickedChunks.push(chunkFile)
    }
    else {
      const mid = Math.floor(CHUNK_SIZE / 2)
      pickedChunks.push(chunkFile.slice(0, 2))
      pickedChunks.push(chunkFile.slice(mid, mid + 2))
      pickedChunks.push(chunkFile.slice(CHUNK_SIZE - 2, CHUNK_SIZE))
    }
  }
  return pickedChunks
}

// 验证文件是否存在
function checkExist(fileHash: string) {
  return axios.post(`/api${API.check}`, { fileHash }).then(res => res.data)
}

async function uploadChunks(chunks: Chunk[], hash: string, uploadedChunks: number[] = []) {
  formDatas = chunks.filter((_, index) => !uploadedChunks.includes(index)).map(({ file, name }) => {
    const formData = new FormData()
    formData.append('chunk', file)
    formData.append('chunkName', name)
    formData.append('fileHash', hash)
    return formData
  })

  await currencyUpload(formDatas)
}

// 并发上传
async function currencyUpload(formDatas: FormData[]) {
  let index = 0
  const max = 6 // 设置浏览器运行最大并发数  目前6个为当前的主流
  const taskPool: Array<Promise<any>> = []
  // const allProgress = index // 总进度
  while (index < formDatas.length) {
    // 生成一个任务
    const task = axios.post(`/api${API.upload}`, formDatas[index])
    // const task = fetch(`/api${API.upload}`, {
    //   method: 'POST',
    //   body: formDatas[index],
    // })

    // 任务完成后从任务池中移除
    task.then(() => {
      taskPool.splice(taskPool.findIndex(item => item === task))
    })

    index++
    taskPool.push(task)
    if (taskPool.length === max) {
      await Promise.race(taskPool) // 竞赛等出一个执行完毕的请求
    }
  }

  await Promise.all(taskPool)
}
// 合并请求
async function mergeRequest(fileName: string, CHUNK_SIZE: number, fileHash: string) {
  const { success, message, fileUrl } = await axios.post(`/api${API.merge}`, { CHUNK_SIZE, fileHash, fileName }).then(res => res.data)

  if (success) {
    ElNotification({
      title: message,
      type: 'success',
    })
    if (videoRef.value)
      videoRef.value.src = fileUrl
  }
}
</script>

<template>
  <div class="mxa w-8/10">
    <input ref="inputRef" type="file" @input="handleUpload">
    <button btn @click="handleUpload">
      上传
    </button>
    <button mx-3 btn @click="handleControl">
      {{ isPause ? '继续' : '暂停' }}
    </button>
    <div my3 text-sm space-y-3>
      <p flex-start-center space-x-3>
        <span>文件大小: {{ fileSizeRef }}</span> <span>已经上传: </span> <span>当前速度: </span> <span>剩余时间: </span>
      </p>
      <p flex>
        <span>切片进度：</span>
        <el-progress :percentage="progressMap.createChunks" :stroke-width="10" flex-1 />
      </p>
      <p flex>
        <span>HASH进度：</span>
        <el-progress :percentage="progressMap.calculateHash" :stroke-width="10" flex-1 />
      </p>
    </div>
    <video ref="videoRef" mt-5 mxa w-200 src="" muted controls />
    <!-- <el-upload drag :http-request="handleUpload">
      <div class="el-upload__text h-30 flex-center">
        拖拽文件到此 <em> 或点击上传</em>
      </div>
      <template #tip>
        <div my3 text-sm space-y-3>
          <p flex-start-center space-x-3>
            <span>文件大小: {{ fileSizeRef }}</span> <span>已经上传: </span> <span>当前速度: </span> <span>剩余时间: </span>
          </p>
          <p flex>
            <span>切片进度：</span>
            <el-progress :percentage="progressMap.createChunks" :stroke-width="10" flex-1 />
          </p>
          <p flex>
            <span>HASH进度：</span>
            <el-progress :percentage="progressMap.calculateHash" :stroke-width="10" flex-1 />
          </p>
        </div>
      </template>
</el-upload> -->
  </div>
</template>

<style scoped lang='scss'></style>
