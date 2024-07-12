<script setup lang='ts'>
import axios from 'axios'
// import type { UploadRequestOptions } from 'element-plus'

const API = {
  check: '/check',
  upload: '/upload',
  merge: '/merge',
}

interface Progress {
  createChunks: number
  calculateHash: number
  uploadedChunks: number
  fileSize: number
}
const total = ref(0)

const progressMap = reactive<Progress>({
  createChunks: 0,
  calculateHash: 0,
  uploadedChunks: 0,
  fileSize: 0,
})

const CHUNK_SIZE = 10 * 1024 * 1024 // 10MB
interface Chunk {
  name: string
  file: Blob
  range: string
  size: string
}
const startTime = ref(Date.now())
const endTime = ref(Date.now())
const ratio = ref(0.98)
const uploadProgress = computed(() => total.value ? Math.floor(progressMap.uploadedChunks / total.value * 100 * ratio.value) : 0)
const uploadSize = computed(() => {
  const uploadedSize = progressMap.uploadedChunks * CHUNK_SIZE
  return formatSize(Math.min(uploadedSize, progressMap.fileSize))
})
const uploadSpeed = computed(() => {
  const time = endTime.value - startTime.value
  if (!time)
    return '0B/s'
  const speed = progressMap.uploadedChunks * CHUNK_SIZE / time * 1000
  return `${formatSize(speed)}/s`
})

const restTime = computed(() => {
  const time = endTime.value - startTime.value
  if (!time)
    return '0s'
  const uploadedSize = progressMap.uploadedChunks * CHUNK_SIZE
  const restSize = progressMap.fileSize - uploadedSize
  const speed = progressMap.uploadedChunks * CHUNK_SIZE / time * 1000
  const restTime = Math.max(Math.floor(restSize / speed / ratio.value), 0)
  return formatTime(restTime)
})

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
const controllers: AbortController[] = []
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
  progressMap.createChunks = 0
  progressMap.calculateHash = 0
  progressMap.uploadedChunks = 0

  const chunks = createChunks(file)
  total.value = chunks.length
  const pickedChunks = pickChunks(chunks)

  const fileHash = await calcHashInWorker(pickedChunks)
  const { shouldUpload, message, uploadedChunks = [], fileUrl } = await checkExist(fileHash)
  if (shouldUpload) {
    // 需要上传, 则上传文件 ，分片都已上传，则直接合并
    progressMap.uploadedChunks = uploadedChunks.length
    if (uploadedChunks.length === chunks.length) {
      await mergeRequest(file.name, fileHash)
    }
    else {
      await uploadChunks(chunks, fileHash, uploadedChunks)
      await mergeRequest(file.name, fileHash)
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
  isPause.value = !isPause.value
  // 继续上传
  if (isPause.value) {
    controllers.forEach(controller => controller.abort())
  }
  else {
    // 暂停上传
    handleUpload()
  }
}

// 创建切片: 10kb 一个切片
function createChunks(file: File) {
  const chunks = []
  const fileSize = file.size
  progressMap.fileSize = fileSize

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
  startTime.value = Date.now()
  const formDatas = chunks.filter((_, index) => !uploadedChunks.includes(index)).map(({ file, name }) => {
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
    const controller = new AbortController()
    const task = axios.post(`/api${API.upload}`, formDatas[index], {
      signal: controller.signal,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    if (isPause.value) {
      break
    }
    index++
    taskPool.push(task)
    controllers.push(controller)

    // 任务完成后从任务池中移除
    task.then(() => {
      taskPool.splice(taskPool.findIndex(item => item === task))
      controllers.splice(controllers.findIndex(item => item === controller))
      progressMap.uploadedChunks++
      endTime.value = Date.now()
    })

    if (taskPool.length === max) {
      await Promise.race(taskPool) // 竞赛等出一个执行完毕的请求
    }
  }

  await Promise.all(taskPool)
}
// 合并请求
async function mergeRequest(fileName: string, fileHash: string) {
  const { success, message, fileUrl } = await axios.post(`/api${API.merge}`, { chunkSize: CHUNK_SIZE, fileHash, fileName }).then(res => res.data)

  if (success) {
    ratio.value = 1
    endTime.value = Date.now()
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
      <p flex-start-center space-x-3 text-left>
        <span>文件大小:</span><span w-20>{{ formatSize(progressMap.fileSize) }}</span>
        已经上传: <span w-20>{{ uploadSize }}</span>
        上传速度: <span w-20>{{ uploadSpeed }} </span>
        剩余时间: <span> {{ restTime }}</span>
      </p>
      <p flex>
        <span>切片进度：</span>
        <el-progress :percentage="progressMap.createChunks" :stroke-width="10" flex-1 />
      </p>
      <p flex>
        <span>Hash计算：</span>
        <el-progress :percentage="progressMap.calculateHash" :stroke-width="10" flex-1 />
      </p>
      <p flex>
        <span>上传进度：</span>
        <el-progress :percentage="uploadProgress" :stroke-width="10" flex-1 />
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
            <span>文件大小: {{ progressMap.fileSize }}</span> <span>已经上传: </span> <span>当前速度: </span> <span>剩余时间: </span>
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
