const path = require('node:path')
const fs = require('node:fs')
const process = require('node:process')
const express = require('express')
const multipart = require('multiparty')
const fse = require('fs-extra')
const cors = require('cors')
const bodyParser = require('body-parser')

const API = {
  check: '/check',
  upload: '/upload',
  merge: '/merge',
}
const SERVER_URL = 'http://localhost:8001'
const UPLOAD_INFO = {
  FAIL: { success: false, message: '上传失败' },
  CHUNK_SUCCESS: { success: true, message: '分片上传成功' },
  SUCCESS: { success: true, message: '上传成功' },
  EXIST: { shouldUpload: false, message: '文件已存在' },
  NOT_EXIST: { shouldUpload: true, message: '文件不存在', uploadedChunks: [] },
  NO_CHUNK_DIR: { message: '分片文件夹不存在', success: false },
  MERGE_SUCCESS: { message: '合并成功', success: true },
  CANCEL_SUCCESS: { message: '取消成功', success: true },
  CANCEL_FAIL: { message: '取消失败', success: true },
}

const app = express()
app.use(bodyParser.json())
app.use(cors())
// 托管静态文件 upload 目录
app.use('/upload', express.static('./upload'))

const UPLOAD_DIR = path.resolve(__dirname, './upload')

// 检查文件是否存在
app.post(API.check, async (req, res) => {
  const { fileHash } = req.body
  // upload 目录不存在
  if (!fse.existsSync(UPLOAD_DIR)) {
    res.status(200).json(UPLOAD_INFO.NOT_EXIST)
    return
  }

  // 合并后的文件已存在： 已上传的文件名中是否包含当前 hash
  const uploadedFiles = await fse.readdir(UPLOAD_DIR).then((fileOrDirs) => {
    return fileOrDirs.filter((item) => {
      return fse.statSync(path.resolve(UPLOAD_DIR, item)).isFile() && !item.startsWith('.')
    })
  })
  const isExist = uploadedFiles.some((fileName) => {
    if (fileName.includes(fileHash)) {
      res.status(200).json({ ...UPLOAD_INFO.EXIST, fileUrl: `${SERVER_URL}/upload/${fileName}` })
      return true
    }
    return false
  })
  if (!isExist) {
    // 分片临时目录已存在
    const chunkDir = path.resolve(UPLOAD_DIR, fileHash)
    if (fse.existsSync(chunkDir)) {
      // 返回已上传的分片列表
      const uploadedChunks = await fse.readdir(chunkDir).then((chunkNames) => {
        return chunkNames.filter(chunkName => !chunkName.startsWith('.')).map(chunkName => +chunkName.split('-')[0])
      })
      res.status(200).json({ ...UPLOAD_INFO.NOT_EXIST, uploadedChunks })
    }
    else {
      res.status(200).json(UPLOAD_INFO.NOT_EXIST)
    }
  }
})

app.post(API.upload, (req, res) => {
  const form = new multipart.Form()
  form.parse(req, async (err, fields, files) => {
    if (err) {
      res.status(401).json(UPLOAD_DIR.FAIL)
      return
    }
    const chunkName = fields.chunkName[0]
    const fileHash = fields.fileHash[0]
    const chunk = files.chunk[0]
    // 分片临时存储目录
    const chunkDir = path.resolve(UPLOAD_DIR, fileHash)
    // 不存在则创建目录
    if (!fse.existsSync(chunkDir)) {
      await fse.mkdirs(chunkDir)
    }
    // FIXME 暂停继续报错
    try {
      await fse.move(chunk.path, `${chunkDir}/${chunkName}`)
      res.status(200).json(UPLOAD_DIR.success)
    }
    catch {
      res.status(401).json(UPLOAD_DIR.FAIL)
    }
  })
})

// 合并分片
app.post(API.merge, async (req, res) => {
  const { fileHash, fileName, chunkSize } = req.body
  const fileExt = fileName.split('.').pop()
  const chunkDir = path.resolve(UPLOAD_DIR, fileHash)
  if (!fse.existsSync(chunkDir)) {
    res.status(401).json(UPLOAD_INFO.NO_CHUNK_DIR)
    return
  }
  // 合并分片
  const chunkNames = await fse.readdir(chunkDir)
  chunkNames.sort((a, b) => +a.split('-')[0] - +b.split('-')[0])
  const mergePromises = chunkNames.map((chunkName, index) => new Promise((resolve) => {
    const chunkPath = path.resolve(chunkDir, chunkName)
    const readStream = fse.createReadStream(chunkPath)
    const writeStream = fse.createWriteStream(path.resolve(UPLOAD_DIR, `${fileHash}.${fileExt}`), {
      start: index * chunkSize,
      end: (index + 1) * chunkSize,
    })

    readStream.on('end', async () => {
      await fse.unlink(chunkPath)
      resolve()
    })

    readStream.pipe(writeStream)
  }))
  await Promise.all(mergePromises)

  const CLIENT_OS = detectOS()
  if (CLIENT_OS === 'mac') {
    fs.rmSync(chunkDir, { recursive: true, force: true })
  }
  else {
    await fs.remove(chunkDir)
  }

  res.json({ ...UPLOAD_INFO.MERGE_SUCCESS, fileUrl: `${SERVER_URL}/upload/${fileHash}.${fileExt}` })
})
function detectOS() {
  const platform = process.platform
  if (platform === 'win32') {
    return 'windows'
  }
  else if (platform === 'darwin') {
    return 'mac'
  }
  else if (platform === 'linux') {
    return 'linux'
  }
  return platform
}

// 取消上传
app.post('/cancel', async (req, res) => {
  const { fileHash } = req.body
  const chunkDir = path.resolve(UPLOAD_DIR, fileHash)
  if (fse.existsSync(chunkDir)) {
    try {
      // FIXME: 无法删干净
      const CLIENT_OS = detectOS()
      if (CLIENT_OS === 'mac') {
        fs.rmSync(chunkDir, { recursive: true, force: true })
      }
      else {
        fs.remove(chunkDir)
      }
      res.status(200).json(UPLOAD_INFO.CANCEL_SUCCESS)
    }
    catch {
      res.status(401).json(UPLOAD_INFO.CANCEL_FAIL)
    }
  }
})

app.listen(8001, () => {
  console.warn(`server is running on ${SERVER_URL}`)
})
