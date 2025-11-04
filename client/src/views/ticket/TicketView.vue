<template>
  <div class="ticket-container">
    <h1>请选择业务类型</h1>
    
    <div class="business-type-grid">
      <!-- 业务类型按钮将在这里渲染 -->
      <div v-for="type in businessTypes" :key="type.id" class="business-type-btn" @click="selectBusinessType(type)">
        {{ type.name }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { businessTypeService } from '@/api';

const businessTypes = ref([]);

onMounted(async () => {
  try {
    const response = await businessTypeService.getAll();
    businessTypes.value = response.data;
  } catch (error) {
    console.error('获取业务类型失败:', error);
  }
});

const selectBusinessType = (type) => {
  // 选择业务类型后的处理逻辑
  console.log('选择了业务类型:', type);
};
</script>

<style scoped>
.ticket-container {
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100vh;
}

.business-type-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  margin-top: 50px;
}

.business-type-btn {
  width: 200px;
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #409EFF;
  color: white;
  font-size: 18px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.business-type-btn:hover {
  background-color: #66b1ff;
}
</style>
