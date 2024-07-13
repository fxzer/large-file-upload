<script setup>
import axios from 'axios'

function onUpload(e) {
  const formData = new FormData()
  formData.append('fileName', e.target.files[0]) // fileName:后端接收的参数名
  axios.post('http://localhost:3000/upload/postFile', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  }).then((res) => {
    console.log('[ res ]', res)
  }).catch((err) => {
    console.log('[ err ]', err)
  })
}
</script>

<template>
  <input type="file" @change="onUpload">
</template>
