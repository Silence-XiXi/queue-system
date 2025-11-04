import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    redirect: '/ticket'
  },
  {
    path: '/ticket',
    name: 'ticket',
    component: () => import('../views/ticket/TicketView.vue')
  },
  {
    path: '/display',
    name: 'display',
    component: () => import('../views/display/DisplayView.vue')
  },
  {
    path: '/counter',
    name: 'counter',
    component: () => import('../views/counter/CounterView.vue')
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router;
