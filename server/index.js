const path = require('node:path')
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

const app = express()
app.use(bodyParser.json())
app.use(cors())

const UPLOAD_DIR = path.resolve(__dirname, './upload')

app.post(API.upload, (req, res) => {
  const form = new multipart.Form()
  form.parse(req, async (err, fields, files) => {
    if (err) {
      res.status(401).json({ message: '上传失败' })
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
    await fse.move(chunk.path, `${chunkDir}/${chunkName}`)
    res.status(200).json({ message: '上传成功', success: true })
  })
})

// 检查文件是否存在
app.post(API.check, async (req, res) => {
  const { fileHash } = req.body
  // upload 目录不存在
  if (!fse.existsSync(UPLOAD_DIR)) {
    res.status(200).json({ uploaded: false, message: '文件不存在' })
    return
  }
  // 已上传的文件名中是否包含当前 hash
  const uploadedFiles = await fse.readdir(UPLOAD_DIR).then((fileOrDir) => {
    return fileOrDir.filter((item) => {
      return fse.statSync(path.resolve(UPLOAD_DIR, item)).isFile()
    })
  })
  const isExist = uploadedFiles.some(fileName => fileName.includes(fileHash))
  if (isExist) {
    res.status(200).json({ uploaded: true, message: '文件已存在' })
  }
  else {
    res.status(200).json({ uploaded: false, message: '文件不存在' })
  }
})

// 合并分片
app.post(API.merge, async (req, res) => {
  const { fileHash, fileName, chunkSize } = req.body
  const chunkDir = path.resolve(UPLOAD_DIR, fileHash)
  if (!fse.existsSync(chunkDir)) {
    res.status(401).json({ message: '分片文件夹不存在' })
    return
  }

  // 合并分片
  const chunkNames = await fse.readdir(chunkDir)
  chunkNames.sort((a, b) => a.split('-')[0] - b.split('-')[0])
  const mergePromises = chunkNames.map((chunkName, index) => new Promise((resolve) => {
    const chunkPath = path.resolve(chunkDir, chunkName)
    const readStream = fse.createReadStream(chunkPath)
    const writeStream = fse.createWriteStream(path.resolve(UPLOAD_DIR, `${fileHash}-${fileName}`), {
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
  fse.remove(chunkDir)
  res.json({ message: '合并成功', success: true })
})

app.listen(8001, () => {
  console.warn('server is running on http://localhost:8001')
})
