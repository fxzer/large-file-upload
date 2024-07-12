// 监听主线程发送的数据

globalThis.importScripts('./spark-md5.min.js')
onmessage = async function ({ data }) {
  const hash = await calculateHash(data.chunks)
  // 处理数据并返回
  postMessage({ hash })
}

function calculateHash(chunks) {
  console.time('CalcHashTimeConsume')
  return new Promise((resolve, reject) => {
    const spark = new SparkMD5.ArrayBuffer()

    // 递归处理每个切片
    function processChunk(index) {
      const progress = Math.floor((index + 1) / chunks.length * 100)
      if (index >= chunks.length) {
        console.timeEnd('CalcHashTimeConsume')
        resolve(spark.end())
        return
      }
      postMessage({ progress })

      const chunk = chunks[index]
      const reader = new FileReader()

      // 读取完成后的回调函数
      reader.onload = (e) => {
        spark.append(e.target.result)
        processChunk(index + 1)
      }

      reader.onerror = (error) => {
        reject(error)
      }
      reader.readAsArrayBuffer(chunk)
      // reader.readAsArrayBuffer(chunk.file)
    }

    processChunk(0)
  })
}
