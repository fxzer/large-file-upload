// 上传请求

/* function createChunks(file: File, chunkSize = CHUNK_SIZE) {
  const chunks = []
  let cur = 0
  let total = 0
  const fileSize = file.size
  fileSizeRef.value = formatSize(fileSize)

  while (cur < fileSize) {
    const end = Math.min(cur + chunkSize, fileSize)
    chunks.push({
      name: `${chunks.length}-${file.name}`,
      file: file.slice(cur, end),
      range: `${cur}-${end - 1}`,
      size: formatSize(end - cur),
    })
    cur = end
    total += end - cur
    progressMap.createChunks = end === fileSize ? 100 : Math.floor(total / fileSize * 100)
  }
  return chunks
} */

// 增量计算 hash （节省内存）
/* function calculateHash(chunks: Chunk[]) {
  return new Promise((resolve, reject) => {
    const spark = new SparkMD5.ArrayBuffer()

    function processChunk(index: number) {
      // 如果所有切片都处理完毕则返回 hash
      if (index >= chunks.length) {
        resolve(spark.end())
        return
      }

      const chunk = chunks[index]
      const reader = new FileReader()

      // 读取完成后的回调函数
      reader.onload = (e) => {
        spark.append(e.target.result)
        const progress = Math.floor((index + 1) / chunks.length * 100)
        progressMap.calculateHash = progress
        processChunk(index + 1) // 递归处理下一个切片
      }

      reader.onerror = (error) => {
        reject(error) // 读取错误时拒绝Promise
      }
      reader.readAsArrayBuffer(chunk.file) // 读取当前切片
    }

    processChunk(0)
  }) */
// }

// const requestList = formDatas.map((formData) => {
//   return axios({
//     url: '/upload',
//     method: 'post',
//     data: formData,
//   })
// })
// await Promise.all(requestList)

// 单个文件上传
// function uploadHandler(chunk: Chunk ,hash = '') {
//   return new Promise(async (resolve, reject) => {
//     try {
//       const fd = new FormData()
//       fd.append('file', chunk.file)
//       fd.append('fileHash', hash)
//       fd.append('name', chunk.name)
//       const result = await fetch('http://localhost:3000/upload', {
//         method: 'POST',
//         body: fd,
//       }).then(res => res.json())
//       chunk.uploaded = true
//       resolve(result)
//     }
//     catch (err) {
//       reject(err)
//     }
//   })
// }

// // 批量上传切片
// function uploadChunks(chunks, maxRequest = 6) {
//   return new Promise((resolve, reject) => {
//     if (chunks.length === 0) {
//       resolve([])
//     }
//     const requestSliceArr = []
//     let start = 0
//     while (start < chunks.length) {
//       requestSliceArr.push(chunks.slice(start, start + maxRequest))
//       start += maxRequest
//     }
//     let index = 0
//     const requestReaults = []
//     const requestErrReaults = []

//     const request = async () => {
//       if (index > requestSliceArr.length - 1) {
//         resolve(requestReaults)
//         return
//       }
//       const sliceChunks = requestSliceArr[index]
//       Promise.all(
//         sliceChunks.map(chunk => uploadHandler(chunk)),
//       ).then((res) => {
//         requestReaults.push(...(Array.isArray(res) ? res : []))
//         index++
//         request()
//       }).catch((err) => {
//         requestErrReaults.push(...(Array.isArray(err) ? err : []))
//         reject(requestErrReaults)
//       })
//     }
//     request()
//   })
// }
