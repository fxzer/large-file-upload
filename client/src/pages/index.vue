<script setup lang="ts" generic="T extends any, O extends any">
defineOptions({
  name: 'IndexPage',
})
</script>

<template>
  <div flex-center gap-10>
    <router-link to="/simple" text-xl text-blue>
      简单文件上传
    </router-link>
    <router-link to="/upload" text-xl text-blue>
      大文件上传
    </router-link>
  </div>
</template>
