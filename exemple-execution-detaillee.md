# 🎬 Exemple d'exécution avec logs détaillés

## 📋 Scénario de test

**Client envoie:**
```javascript
socket.emit('product:operation', {
  productId: 42,
  operation: 'create',
  payload: { name: 'iPhone', price: 999 }
});
```

## 🚀 Trace d'exécution complète

### **PHASE 1: CONSTRUCTION (serveur démarre)**

```javascript
// 1. Construction de withValidation
const validationWrapper = withValidation(
  productActionSchema,
  async (data, callback) => { /* handler métier */ },
  'product:operation'
);

// 2. Construction de withErrorHandling  
const errorWrapper = withErrorHandling(
  validationWrapper,
  'product:operation'
);

// 3. Enregistrement dans Socket.IO
socket.on('product:operation', errorWrapper);
```

---

### **PHASE 2: EXÉCUTION (client émet l'événement)**

#### ✅ **Étape 1: Socket.IO reçoit l'événement**
```
[Socket.IO] Event 'product:operation' received
Data: { productId: 42, operation: 'create', payload: { name: 'iPhone', price: 999 } }
```

#### ✅ **Étape 2: withErrorHandling s'exécute**
```javascript
// Point d'entrée: errorWrapper(data, callback)
async (data, callback) => {
  try {
    // ← ON ENTRE ICI
    await validationWrapper(data, callback);
  } catch (error) {
    // Pas encore atteint
  }
}
```

#### ✅ **Étape 3: withValidation s'exécute**
```javascript
// validationWrapper(data, callback) appelée
async (data, callback) => {
  try {
    // ← ON ENTRE ICI
    const validatedData = productActionSchema.parse(data);
```

#### ✅ **Étape 4: Validation Zod**
```javascript
// productActionSchema.parse() s'exécute:
{
  productId: z.union([z.string(), z.number()]).transform(String),  // 42 → "42" ✅
  operation: z.enum(['create', 'update', 'delete']),              // "create" ✅  
  payload: z.object({
    name: z.string().optional(),                                  // "iPhone" ✅
    price: z.number().positive().optional()                      // 999 ✅
  }).optional()
}
```

**Log produit:**
```
[DEBUG] Validation successful for product:operation
{
  eventName: 'product:operation',
  validatedData: {
    productId: "42",        // ← Transformé en string
    operation: "create", 
    payload: { name: "iPhone", price: 999 }
  }
}
```

#### ✅ **Étape 5: Handler métier s'exécute**
```javascript
// await handler(validatedData, callback) appelé
async (data, callback) => {
  logger.info('Product operation received', {
    socketId: 'abc123',
    productId: "42",       // ← Données validées
    operation: "create",
    payload: { name: "iPhone", price: 999 }
  });

  // Logique métier...
  const response = {
    success: true,
    message: 'Product operation "create" completed',
    productId: "42",
    operation: "create", 
    timestamp: '2024-01-15T10:30:00.000Z'
  };
```

**Log produit:**
```
[INFO] Product operation received
{
  socketId: 'abc123',
  productId: "42", 
  operation: "create",
  payload: { name: "iPhone", price: 999 }
}
```

#### ✅ **Étape 6: Réponse au client**
```javascript
  // Callback au client
  if (callback) {
    callback({
      success: true,
      message: 'Product operation "create" completed',
      productId: "42",
      operation: "create",
      timestamp: '2024-01-15T10:30:00.000Z'
    });
  }

  // Broadcast aux autres clients
  socket.broadcast.emit('product:operation-broadcast', {
    success: true,
    message: 'Product operation "create" completed', 
    productId: "42",
    operation: "create",
    timestamp: '2024-01-15T10:30:00.000Z',
    fromSocket: 'abc123'
  });
}
```

---

## 🔥 Exemple d'erreur de validation

**Client envoie des données invalides:**
```javascript
socket.emit('product:operation', {
  productId: "",           // ← Erreur: string vide
  operation: "invalid",    // ← Erreur: opération non autorisée
  payload: { price: -50 }  // ← Erreur: prix négatif
});
```

### **Trace d'erreur:**

#### ❌ **Validation Zod échoue:**
```javascript
try {
  const validatedData = schema.parse(data); // ← ÉCHEC ICI
} catch (error) {
  if (error instanceof ZodError) {
    // error.errors contient:
    // [
    //   { path: ['productId'], message: 'String must contain at least 1 character(s)' },
    //   { path: ['operation'], message: 'Operation must be create, update, or delete' },
    //   { path: ['payload', 'price'], message: 'Number must be positive' }
    // ]
```

#### ❌ **Log d'erreur produit:**
```
[WARN] Validation failed for product:operation
{
  eventName: 'product:operation',
  validationErrors: 'productId: String must contain at least 1 character(s), operation: Operation must be create, update, or delete, payload.price: Number must be positive',
  receivedData: { productId: "", operation: "invalid", payload: { price: -50 } }
}
```

#### ❌ **Réponse d'erreur au client:**
```javascript
callback({
  success: false,
  error: 'Validation failed',
  errorCode: 'VALIDATION_ERROR',
  details: 'productId: String must contain at least 1 character(s), operation: Operation must be create, update, or delete, payload.price: Number must be positive',
  timestamp: '2024-01-15T10:30:00.000Z'
});
```

---

## 💥 Exemple d'erreur du handler métier

**Client envoie des données valides mais handler lève une exception:**
```javascript
socket.emit('product:operation', {
  productId: "forbidden",  // ← Provoque une erreur dans le handler
  operation: "delete"
});
```

### **Trace d'erreur:**

#### ✅ **Validation réussit:**
```
[DEBUG] Validation successful for product:operation
{
  eventName: 'product:operation',
  validatedData: { productId: "forbidden", operation: "delete" }
}
```

#### ❌ **Handler métier lève une exception:**
```javascript
// Dans le handler:
if (data.operation === 'delete' && data.productId === 'forbidden') {
  throw new Error('Cannot delete forbidden product'); // ← ERREUR ICI
}
```

#### ❌ **withValidation capture l'erreur (non-Zod):**
```javascript
} catch (error) {
  if (error instanceof ZodError) {
    // Pas cette branche
  } else {
    // ← ON ARRIVE ICI
    logger.error(`Handler error for ${eventName}`, {
      eventName: 'product:operation',
      error: 'Cannot delete forbidden product',
      stack: 'Error: Cannot delete forbidden product\n    at productHandler.js:30...'
    });
```

#### ❌ **withErrorHandling capture également:**
```javascript
// Dans withErrorHandling:
} catch (error) {
  logger.error(`Error in product:operation handler`, {
    eventName: 'product:operation',
    error: 'Cannot delete forbidden product',
    stack: 'Error: Cannot delete forbidden product\n    at productHandler.js:30...'
  });
```

**Résultat: Double logging de la même erreur (comportement actuel)**

---

## 📊 Résumé des logs par scénario

### **✅ Succès complet:**
1. `[DEBUG] Validation successful for product:operation`
2. `[INFO] Product operation received`

### **❌ Erreur de validation:**
1. `[WARN] Validation failed for product:operation`

### **💥 Erreur du handler:**
1. `[DEBUG] Validation successful for product:operation`
2. `[INFO] Product operation received`
3. `[ERROR] Handler error for product:operation` (withValidation)
4. `[ERROR] Error in product:operation handler` (withErrorHandling)