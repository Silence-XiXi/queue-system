import { io } from 'socket.io-client';

const socket = io(window.location.origin, {
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

socket.on('connect', () => {
  console.log('WebSocket连接成功');
});

socket.on('connect_error', (error) => {
  console.error('WebSocket连接失败:', error);
});

// 语音播报函数
export function playVoice(text) {
  const speech = new SpeechSynthesisUtterance();
  speech.lang = 'zh-CN';
  speech.text = text;
  window.speechSynthesis.speak(speech);
}

export default socket;
