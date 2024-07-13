<script setup lang='ts'>
import axios from 'axios'

const http = axios.create({
  baseURL: '/api',
})

const API = {
  check: '/check',
  upload: '/upload',
  merge: '/merge',
  cancel: '/cancel',
}

const CHUNK_SIZE = 10 * 1024 * 1024 // 10MB
interface Chunk {
  name: string
  file: Blob
  size: string
}

const inputRef = ref<HTMLInputElement | null>(null)

const filesList = ref<any>([])

function getCurrentByHash(hash: string) {
  return filesList.value.find((item: any) => item.hash === hash)
}

async function handleUpload() {
  const files: any = inputRef.value!.files
  if (!files)
    return
  for await (const file of files) {
    await handlePreUpload(file)
  }
  const newFileList = filesList.value.filter((item: any) => !item.fileUrl)
  for (const fileInfo of newFileList) {
    if (fileInfo.shouldUpload) {
      await uploadFile(fileInfo)
    }
  }
}

async function handlePreUpload(file: File) {
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

  const { shouldUpload, message, uploadedChunks = [] } = await checkExist(fileHash)
  let fileInfo: any = {}
  if (shouldUpload) {
    fileInfo = getCurrentByHash(fileHash)
    if (fileInfo) {
      ElNotification({
        title: '文件已在列表',
        type: 'warning',
      })
    }
    else {
    // 表格中没有，并且需要上传 才放入表格
      fileInfo = {
        file,
        hash: fileHash,
        progress: 0,
        fileUrl: '',
        totalChunk: chunks.length,
        uploadedCount: uploadedChunks.length,
        isPause: false,
        isExist: false,
        chunks,
        uploadedChunks,
        controllers: [],
      }
      filesList.value.push(fileInfo)
    }
  }
  else {
    ElNotification({
      title: `${message}（${file.name}）`,
      type: 'warning',
    })
  }
  fileInfo.shouldUpload = shouldUpload
  return fileInfo
}

async function calcHashInWorker(chunks: Blob[]): Promise<string> {
  const worker = new Worker('hashWorker.js')
  worker.postMessage({ chunks })
  return new Promise((resolve) => {
    worker.onmessage = (event) => {
      const { hash = '' } = event.data
      if (hash) {
        resolve(hash)
        worker.terminate()
      }
    }
  })
}

async function uploadFile(fileInfo: any) {
  const { uploadedChunks = [], chunks, hash: fileHash } = fileInfo
  fileInfo.uploadedCount = uploadedChunks.length

  // 如果没有已上传的分片，则上传所有分片
  if (uploadedChunks.length < chunks.length) {
    await uploadChunks(chunks, fileHash, uploadedChunks)
  }

  // 所有分片都上传后，合并文件
  if (uploadedChunks.length === chunks.length) {
    await mergeRequest(fileInfo.file.name, fileHash)
  }
}

function handleControl(row: any) {
  // FIXME: 暂停后继续上传，会导致文件上传完毕后打不开
  const currentRow = getCurrentByHash(row.hash)
  currentRow.isPause = !currentRow.isPause

  // 暂停上传
  if (currentRow.isPause) {
    currentRow.controllers.forEach(controller => controller.abort())
  }
  else {
    // 继续上传
    uploadFile(currentRow)
  }
}
function cancelUpload(row: any) {
  row.isPause = false
  handleControl(row)
  filesList.value = filesList.value.filter((item: any) => item !== row)
  http.post(API.cancel, { fileHash: row.hash })
}

// 创建切片: 10kb 一个切片
function createChunks(file: File) {
  const chunks = []
  const fileSize = file.size

  for (let cur = 0; cur < fileSize; cur += CHUNK_SIZE) {
    const end = Math.min(cur + CHUNK_SIZE, fileSize) // 确保不超过文件大小
    chunks.push({
      name: `${chunks.length}-${file.name}`,
      file: file.slice(cur, end),
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
  return http.post(API.check, { fileHash }).then(res => res.data)
}

async function uploadChunks(chunks: Chunk[], hash: string, uploadedChunks: number[] = []) {
  const formDatas = chunks.filter((_, index) => !uploadedChunks.includes(index)).map(({ file, name }) => {
    const formData = new FormData()
    formData.append('chunk', file)
    formData.append('chunkName', name)
    formData.append('fileHash', hash)
    return formData
  })

  await currencyUpload(formDatas, hash)
}

// 并发上传
async function currencyUpload(formDatas: FormData[], hash: string) {
  let index = 0
  const max = 6 // 设置浏览器运行最大并发数  目前6个为当前的主流
  const taskPool: Array<Promise<any>> = []
  const currentRow = getCurrentByHash(hash)

  while (index < formDatas.length) {
    // 生成一个任务
    const controller = new AbortController()
    const task = http.post(API.upload, formDatas[index], {
      signal: controller.signal,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    if (currentRow && currentRow.isPause) {
      break
    }
    index++
    taskPool.push(task)
    currentRow.controllers.push(controller)

    // 任务完成后从任务池中移除
    task.then(() => {
      taskPool.splice(taskPool.findIndex(item => item === task))
      currentRow.controllers.splice(currentRow.controllers.findIndex(item => item === controller))
      currentRow.uploadedCount++

      currentRow.progress = Math.floor((currentRow.uploadedCount / currentRow.totalChunk) * 98)
    })

    if (taskPool.length === max) {
      await Promise.race(taskPool) // 竞赛等出一个执行完毕的请求
    }
  }

  await Promise.all(taskPool)
  ElNotification({
    title: '所有分片上传成功',
    type: 'success',
  })
  await mergeRequest(currentRow.file.name, hash)
}

// 合并请求
async function mergeRequest(fileName: string, fileHash: string) {
  const { success, message, fileUrl } = await http.post(API.merge, { chunkSize: CHUNK_SIZE, fileHash, fileName }).then(res => res.data)
  const currentRow = getCurrentByHash(fileHash)

  if (success) {
    currentRow.progress = 100
    ElNotification({
      title: message,
      type: 'success',
    })
    currentRow.fileUrl = fileUrl
  }
}
</script>

<template>
  <div class="mxa w-8/10">
    <div h-100 border="~ dashed " border-gray:50 rounded relative>
      <input ref="inputRef" type="file" absolute left-0 top-0 multiple op0 wh-full cursor-pointer z-10 @change="handleUpload">
      <div absolute class="left-1/2 top-1/2 -translate-1/2" z-1 text-gray>
        <p>拖拽文件到此处</p>
        或<p text-blue cursor-pointer>
          点击上传文件和文件夹
        </p>
      </div>
    </div>
    <div my3 text-sm space-y-3>
      <el-table :data="filesList">
        <el-table-column label="名称" prop="file.name" />
        <el-table-column label="类型" prop="file.type" />
        <el-table-column label="大小">
          <template #default="{ row }">
            {{ formatSize(row.file.size) }}
          </template>
        </el-table-column>
        <el-table-column label="状态">
          <template #default="{ row }">
            <el-progress :percentage="row.progress" />
          </template>
        </el-table-column>
        <el-table-column label="链接" prop="fileUrl">
          <template #default="{ row }">
            <a v-show="row.fileUrl" :href="row.fileUrl" text-blue underline>下载</a>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <div v-if="!row.fileUrl">
              <button btn-mini @click="handleControl(row)">
                {{ row.isPause ? '继续' : '暂停' }}
              </button>
              <button btn-mini bg-red hover:bg-red-500 ml3 @click="cancelUpload(row)">
                取消
              </button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<style scoped lang='scss'></style>
