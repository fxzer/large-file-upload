<script setup lang="ts" generic="T extends any, O extends any">
defineOptions({
  name: 'IndexPage',
})
</script>

<template>
  <div flex>
    <router-link to="/upload" text-xl text-blue>
      大文件上传
    </router-link>
  </div>
</template>
