<template>
  <nav fixed right-5 top-3 mt-3 inline-flex gap-2 text-xl>
    <button icon-btn @click="toggleDark()">
      <div i-carbon-sun dark:i-carbon-moon />
    </button>

    <a
      i-carbon-logo-github icon-btn
      rel="noreferrer"
      href="https://github.com/fxzer/large-file-upload"
      target="_blank"
      title="GitHub"
    />
    <a
      i-simple-icons:gitee icon-btn
      rel="noreferrer"
      href="https://gitee.com/fxzer/large-file-upload"
      target="_blank"
      title="GitHub"
    />
  </nav>
</template>
