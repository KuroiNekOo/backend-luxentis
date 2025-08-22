import { io } from 'socket.io-client';

console.log('🔍 Test de connexion Socket.IO...');

const socket = io('http://localhost:3000', {
  forceNew: true,
  reconnection: true,
  timeout: 5000,
  transports: ['polling', 'websocket']
});

socket.on('connect', () => {
  console.log('✅ CONNEXION RÉUSSIE !');
  console.log('🆔 Socket ID:', socket.id);
  console.log('🚀 Transport:', socket.io.engine.transport.name);
  
  // Test ping
  socket.emit('ping', (response) => {
    console.log('🏓 Ping response:', response);
    
    // Fermer après test
    setTimeout(() => {
      socket.close();
      process.exit(0);
    }, 1000);
  });
});

socket.on('connect_error', (error) => {
  console.error('❌ ERREUR DE CONNEXION:', error.message);
  console.error('   Type:', error.type);
  console.error('   Description:', error.description);
});

socket.on('disconnect', (reason) => {
  console.log('👋 Déconnecté:', reason);
});

// Timeout après 10 secondes
setTimeout(() => {
  console.log('⏰ Timeout - Arrêt du test');
  socket.close();
  process.exit(1);
}, 10000);