//路由
import { createRouter , createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('../views/Home.vue'),
    redirect: '/complexUpload',
    children: [
      {
        path: '/simpleUpload',
        name: 'SimpleUpload',
        component: () => import('../views/SimpleUpload.vue')

      },
      {
        path: '/complexUpload',
        name: 'ComplexUpload',
        component: () => import('../views/ComplexUpload.vue')

      },
    ]
  }]
const router = createRouter({
  history: createWebHistory(),
  routes
})
export default router