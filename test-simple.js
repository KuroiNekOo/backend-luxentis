import { io } from 'socket.io-client';

console.log('🧪 Test Socket.IO avec handlers et middlewares...');

const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('✅ Connecté !', socket.id);
  
  // Test 1: Ping basique
  socket.emit('ping', (response) => {
    console.log('🏓 Ping response:', response);
  });
  
  // Test 2: User action valide
  socket.emit('user:action', {
    userId: 'user123',
    action: 'login',
    data: { message: 'Hello from client' }
  }, (response) => {
    console.log('👤 User action response:', response);
  });
  
  // Test 3: Product operation valide
  socket.emit('product:operation', {
    productId: 'prod456',
    operation: 'create',
    payload: { name: 'Test Product', price: 19.99 }
  }, (response) => {
    console.log('📦 Product operation response:', response);
  });
  
  // Test 4: Validation error (données invalides)
  setTimeout(() => {
    socket.emit('user:action', {
      userId: '', // Invalide - vide
      action: 'test'
    }, (response) => {
      console.log('❌ Validation error response:', response);
    });
  }, 1000);
  
  // Test 5: Handler error (opération interdite)
  setTimeout(() => {
    socket.emit('product:operation', {
      productId: 'forbidden', // Déclenche une erreur dans le handler
      operation: 'delete'
    }, (response) => {
      console.log('💥 Handler error response:', response);
    });
  }, 2000);
});

// Écouter les confirmations
socket.on('user:action-confirmed', (data) => {
  console.log('✅ User action confirmed:', data);
});

socket.on('product:operation-broadcast', (data) => {
  console.log('📢 Product broadcast received:', data);
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
});

// Fermer après 5 secondes
setTimeout(() => {
  console.log('👋 Fermeture du test');
  socket.close();
  process.exit(0);
}, 5000);