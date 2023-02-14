<script setup>
import axios from 'axios'
const onUpload = (e) => {
  let formData = new FormData()
  formData.append('fileName', e.target.files[0]) //fileName:后端接收的参数名
  console.log('[ formData ]-6', formData)
  axios.post('http://localhost:3000/upload/postFile', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  }).then(res => {
    console.log('[ res ]', res)
  }).catch(err => {
    console.log('[ err ]', err)
  })
}
</script>

<template>
  <div class="input-wrap">
    <h2>简单上传</h2>
    <input type="file" @change="onUpload"> 
  </div>
</template>
<style scoped lang="scss">
.input-wrap{
  h2{
    text-align: center;
    margin-bottom: 50px;
  }
   display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    height: 100vh;  
}
</style>